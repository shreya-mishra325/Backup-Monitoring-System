// home.js - dashboard logic: loads instances list, renders selected instance
// details + Configure Backup section, and handles Schedule/Backup Now actions.

let allInstances = [];
let selectedInstanceId = null;

document.addEventListener("DOMContentLoaded", function () {
    initLayout("home").then(() => {
        loadInstances();
    });
});

/** Fetches all instances and renders the left-hand list. */
function loadInstances() {
    fetch("/api/instances")
        .then(res => res.json())
        .then(instances => {
            allInstances = instances;

            // Determine which instance to show: from URL ?id=, or the first one
            const params = new URLSearchParams(window.location.search);
            const idParam = params.get("id");

            if (idParam && instances.some(inst => String(inst.instanceId) === idParam)) {
                selectedInstanceId = parseInt(idParam, 10);
            } else if (instances.length > 0) {
                selectedInstanceId = instances[0].instanceId;
            } else {
                selectedInstanceId = null;
            }

            renderInstanceList();
            renderDetailsPanel();
        })
        .catch(err => {
            document.getElementById("instanceList").innerHTML =
                `<div class="instance-item"><div class="instance-name">Error loading instances</div></div>`;
            console.error(err);
        });
}

/** Renders the left-hand instance list with status dots. */
function renderInstanceList() {
    const listEl = document.getElementById("instanceList");

    if (allInstances.length === 0) {
        listEl.innerHTML = `
            <div class="instance-item">
                <div>
                    <div class="instance-name">No instances found</div>
                    <div class="instance-ip">Add one from "Add New Instance" tab</div>
                </div>
            </div>`;
        return;
    }

    listEl.innerHTML = allInstances.map(inst => {
        const isActive = (inst.instanceId === selectedInstanceId);
        const statusClass = (inst.status === "Connected") ? "connected" : "disconnected";

        return `
            <div class="instance-item ${isActive ? "active" : ""}" data-id="${inst.instanceId}">
                <div>
                    <div class="instance-name">${escapeHtml(inst.instanceName)}</div>
                    <div class="instance-ip">${escapeHtml(inst.instanceIp)}</div>
                </div>
                <div class="status-dot ${statusClass}" title="${escapeHtml(inst.status)}"></div>
            </div>`;
    }).join("");

    // Click handlers - select instance without full page reload
    listEl.querySelectorAll(".instance-item[data-id]").forEach(item => {
        item.addEventListener("click", function () {
            const id = parseInt(this.getAttribute("data-id"), 10);
            selectedInstanceId = id;

            // Update the URL (so refresh/bookmark keeps the selection) without reloading
            const url = new URL(window.location.href);
            url.searchParams.set("id", id);
            window.history.replaceState({}, "", url);

            renderInstanceList();
            renderDetailsPanel();
        });
    });
}

/** Renders the right-hand details panel + Configure Backup section for the selected instance. */
function renderDetailsPanel() {
    const panel = document.getElementById("instanceDetailsPanel");

    if (selectedInstanceId == null) {
        panel.innerHTML = "<p>No instance selected. Please add a new instance first.</p>";
        return;
    }

    const inst = allInstances.find(i => i.instanceId === selectedInstanceId);
    if (!inst) {
        panel.innerHTML = "<p>Instance not found.</p>";
        return;
    }

    // Clone the template into the panel
    const template = document.getElementById("detailsTemplate");
    panel.innerHTML = "";
    panel.appendChild(template.content.cloneNode(true));

    // Populate fields
    document.getElementById("currentInstanceId").value = inst.instanceId;
    setField("instanceName", inst.instanceName);
    setField("databaseType", inst.databaseType);
    setField("instanceIpPort", `${inst.instanceIp}:${inst.portNumber}`);
    setField("lastBackupDuration", inst.lastBackupDuration || "-");
    setField("lastBackupFileSize", inst.lastBackupFileSize || "-");
    setField("lastBackupRemark", inst.lastBackupRemark || "-");
    setField("lastDownTime", formatDateTime(inst.lastDownTime));
    setField("lastBackupDate", formatDateTime(inst.lastBackupDate));
    setField("lastBackupLocation", inst.lastBackupLocation || "-");

    const statusBadge = panel.querySelector('[data-field="statusBadge"]');
    const statusClass = (inst.status === "Connected") ? "connected" : "disconnected";
    statusBadge.textContent = inst.status;
    statusBadge.className = "status-badge " + statusClass;

    // Wire up Configure Backup buttons
    document.getElementById("scheduleBtn").addEventListener("click", submitSchedule);
    document.getElementById("backupNowBtn").addEventListener("click", submitBackupNow);

    function setField(name, value) {
        const el = panel.querySelector(`[data-field="${name}"]`);
        if (el) el.textContent = value;
    }
}

/** Formats an ISO date string (or null) into a readable local string, or "-". */
function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

/** Submits the "Schedule Backup" form via AJAX to /api/backup/schedule. */
function submitSchedule() {
    const instanceId = document.getElementById("currentInstanceId").value;
    const backupLocation = document.getElementById("scheduleLocation").value;
    const backupPath = document.getElementById("schedulePath").value.trim();
    const backupDateTime = document.getElementById("scheduleDateTime").value.trim();

    const resultBox = document.getElementById("scheduleResult");

    if (!backupPath || !backupDateTime) {
        showResult(resultBox, "Please specify both path and date/time.", false);
        return;
    }

    fetch("/api/backup/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, backupLocation, backupPath, backupDateTime })
    })
    .then(res => res.json())
    .then(data => {
        showResult(resultBox, data.message, data.success);
    })
    .catch(err => {
        showResult(resultBox, "Error scheduling backup: " + err, false);
    });
}

/** Submits the "Backup Now" form via AJAX to /api/backup/now, then refreshes details. */
function submitBackupNow() {
    const instanceId = document.getElementById("currentInstanceId").value;
    const backupLocation = document.getElementById("nowLocation").value;
    const backupPath = document.getElementById("nowPath").value.trim();

    const resultBox = document.getElementById("backupNowResult");

    if (!backupPath) {
        showResult(resultBox, "Please specify a path.", false);
        return;
    }

    showResult(resultBox, "Backup in progress...", true);

    fetch("/api/backup/now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, backupLocation, backupPath })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showResult(resultBox, data.message + " (Duration: " + data.duration + ", Size: " + data.fileSize + ")", true);
            // Re-fetch instance list + details to show updated "Last Backup" info
            setTimeout(loadInstances, 800);
        } else {
            showResult(resultBox, data.message, false);
        }
    })
    .catch(err => {
        showResult(resultBox, "Error running backup: " + err, false);
    });
}

function showResult(element, message, success) {
    element.textContent = message;
    element.className = "action-result " + (success ? "success" : "error");
}
