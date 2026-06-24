let allInstances = [];
let selectedInstanceId = null;

document.addEventListener("DOMContentLoaded", function () {
    initLayout("home").then(() => {
        loadInstances();
        document.getElementById("cancelEditBtn").onclick = closeEditModal;
        document.getElementById("saveEditBtn").onclick = saveInstanceChanges;
        document.getElementById("cancelDeleteBtn").onclick = closeDeleteModal;
        document.getElementById("confirmDeleteBtn").onclick = confirmDelete;
        setInterval(async () => {
        await refreshStatuses();
    }, 10000);
    });
});

function loadInstances() {
    fetch("/api/instances")
        .then(res => res.json())
        .then(instances => {
            allInstances = instances;
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

            <div class="instance-info">
                <span class="status-dot ${statusClass}"></span>
                <div class="instance-text">
                    <div class="instance-name">${escapeHtml(inst.instanceName)}</div>
                    <div class="instance-ip">${escapeHtml(inst.instanceIp)}</div>
                </div>
        </div>

    <div class="instance-actions">
        <button
            class="icon-btn edit-btn"
            onclick="event.stopPropagation(); editInstance(${inst.instanceId})"
            title="Edit Instance">
            <i class="fa-solid fa-pen-to-square"></i>
        </button>

        <button
            class="icon-btn delete-btn"
            onclick="event.stopPropagation(); deleteInstance(${inst.instanceId})"
            title="Delete Instance">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    </div>
</div>
`;
    }).join("");

    listEl.querySelectorAll(".instance-item[data-id]").forEach(item => {
        item.addEventListener("click", function () {
            const id = parseInt(this.getAttribute("data-id"), 10);
            selectedInstanceId = id;
            const url = new URL(window.location.href);
            url.searchParams.set("id", id);
            window.history.replaceState({}, "", url);

            renderInstanceList();
            renderDetailsPanel();
        });
    });
}

async function editInstance(id) {
    const inst = allInstances.find(i => i.instanceId === id);
    if (!inst) return;

    document.getElementById("editInstanceId").value = inst.instanceId;
    document.getElementById("editInstanceName").value = inst.instanceName;
    document.getElementById("editDatabaseType").value = inst.databaseType;
    document.getElementById("editInstanceIp").value = inst.instanceIp;
    document.getElementById("editPortNumber").value = inst.portNumber;
    document.getElementById("editDbUsername").value = inst.dbUsername || "";
    document.getElementById("editDbPassword").value = "";

    document.getElementById("editModal").classList.add("show");
}

function deleteInstance(id) {
    const inst = allInstances.find(i => i.instanceId === id);
    if (!inst) return;

    document.getElementById("deleteInstanceName").textContent = inst.instanceName;
    document.getElementById("confirmDeleteBtn").dataset.id = id;

    document.getElementById("deleteModal").classList.add("show");
}

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

    const template = document.getElementById("detailsTemplate");
    panel.innerHTML = "";
    panel.appendChild(template.content.cloneNode(true));

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
    setField("dbUsername", inst.dbUsername || "-");

    const statusBadge = panel.querySelector('[data-field="statusBadge"]');
    const statusClass = (inst.status === "Connected") ? "connected" : "disconnected";
    statusBadge.textContent = inst.status;
    statusBadge.className = "status-badge " + statusClass;

    document.getElementById("scheduleBtn").addEventListener("click", submitSchedule);
    document.getElementById("backupNowBtn").addEventListener("click", submitBackupNow);

    function setField(name, value) {
        const el = panel.querySelector(`[data-field="${name}"]`);
        if (el) el.textContent = value;
    }
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

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
            setTimeout(loadInstances, 800);
        } else {
            showResult(resultBox, data.message, false);
        }
    })
    .catch(err => {
        showResult(resultBox, "Error running backup: " + err, false);
    });
}

function closeEditModal() {
    document.getElementById("editModal").classList.remove("show");
}

function closeDeleteModal() {
    document.getElementById("deleteModal").classList.remove("show");
}

async function saveInstanceChanges() {
    const id = document.getElementById("editInstanceId").value;

    const body = {
        instanceName: document.getElementById("editInstanceName").value.trim(),
        instanceIp: document.getElementById("editInstanceIp").value.trim(),
        portNumber: document.getElementById("editPortNumber").value.trim(),
        dbUsername: document.getElementById("editDbUsername").value.trim(),
        dbPassword: document.getElementById("editDbPassword").value
    };

    const res = await fetch(`/api/instances/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();

    if (data.success) {
        closeEditModal();
        loadInstances();
    } else {
        alert(data.message);
    }
}

async function confirmDelete() {
    const id = document.getElementById("confirmDeleteBtn").dataset.id;

    const res = await fetch(`/api/instances/${id}`, {
        method: "DELETE"
    });

    const data = await res.json();

    if (data.success) {
        closeDeleteModal();
        loadInstances();
    } else {
        alert(data.message);
    }
}

function showResult(element, message, success) {
    element.textContent = message;
    element.className = "action-result " + (success ? "success" : "error");
}