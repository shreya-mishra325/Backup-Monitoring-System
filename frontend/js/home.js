let allInstances = [];
let selectedInstanceId = null;

document.addEventListener("DOMContentLoaded", function () {
    initLayout("home").then(() => {
        loadInstances();
        document.getElementById("cancelEditBtn").onclick = closeEditModal;
        document.getElementById("saveEditBtn").onclick = saveInstanceChanges;
        document.getElementById("cancelDeleteBtn").onclick = closeDeleteModal;
        document.getElementById("confirmDeleteBtn").onclick = confirmDelete;

        const editIp   = document.getElementById("editInstanceIp");
        const editPort = document.getElementById("editPortNumber");
        editIp.addEventListener("input", () => clearFieldError(editIp, document.getElementById("editInstanceIpError")));
        editPort.addEventListener("input", () => clearFieldError(editPort, document.getElementById("editPortNumberError")));

        document.getElementById("progressCloseBtn").onclick = closeProgressModal;
        setInterval(refreshStatuses, 10000);
    });
});

async function refreshStatuses() {
    try {
        await fetch("/api/instances/refresh-status");
        const res = await fetch("/api/instances");
        const instances = await res.json();
        allInstances = instances;
        renderInstanceList();
        updateDetailsStatusOnly();
    } catch (err) {
        console.error("Failed to refresh statuses:", err);
    }
}

function updateDetailsStatusOnly() {
    if (selectedInstanceId == null) return;
    const inst = allInstances.find(i => i.instanceId === selectedInstanceId);
    if (!inst) return;

    const panel = document.getElementById("instanceDetailsPanel");
    const statusBadge = panel.querySelector('[data-field="statusBadge"]');
    if (!statusBadge) return; 

    const statusClass = (inst.status === "Connected") ? "connected" : "disconnected";
    statusBadge.textContent = inst.status;
    statusBadge.className = "status-badge " + statusClass;

    const readOnlyFields = {
        lastBackupDuration: inst.lastBackupDuration || "-",
        lastBackupFileSize: inst.lastBackupFileSize || "-",
        lastBackupRemark: inst.lastBackupRemark || "-",
        lastDownTime: formatDateTime(inst.lastDownTime),
        lastBackupDate: formatDateTime(inst.lastBackupDate),
        lastBackupLocation: inst.lastBackupLocation || "-",
    };

    Object.entries(readOnlyFields).forEach(([field, value]) => {
        const el = panel.querySelector(`[data-field="${field}"]`);
        if (el) el.textContent = value;
    });
}

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

    clearFieldError(document.getElementById("editInstanceIp"), document.getElementById("editInstanceIpError"));
    clearFieldError(document.getElementById("editPortNumber"), document.getElementById("editPortNumberError"));

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

    const scheduleDateTimeInput = document.getElementById("scheduleDateTime");
    if (scheduleDateTimeInput) {
        scheduleDateTimeInput.min = toDatetimeLocalValue(new Date());
        scheduleDateTimeInput.addEventListener("input", () =>
            clearFieldError(scheduleDateTimeInput, document.getElementById("scheduleDateTimeError"))
        );
    }

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

function toDatetimeLocalValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatForBackendSchedule(datetimeLocalValue) {
    const date = new Date(datetimeLocalValue);
    if (isNaN(date.getTime())) return null;

    const pad = (n) => String(n).padStart(2, "0");
    let hours = date.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(hours)}:${pad(date.getMinutes())} ${ampm}`;
}

function submitSchedule() {
    const instanceId = document.getElementById("currentInstanceId").value;
    const backupLocation = document.getElementById("scheduleLocation").value;
    const backupPath = document.getElementById("schedulePath").value.trim();
    const dateTimeInput = document.getElementById("scheduleDateTime");
    const dateTimeError = document.getElementById("scheduleDateTimeError");
    const rawDateTime = dateTimeInput.value;

    if (!backupPath) {
        showToast("Please select a backup folder using Browse.", false);
        return;
    }
    if (!rawDateTime) {
        showToast("Please choose a date and time.", false);
        return;
    }

    const selectedDate = new Date(rawDateTime);
    if (isNaN(selectedDate.getTime())) {
        setFieldError(dateTimeInput, dateTimeError, "Please choose a valid date and time.");
        showToast("Please choose a valid date and time.", false);
        return;
    }

    if (selectedDate.getTime() <= Date.now()) {
        setFieldError(dateTimeInput, dateTimeError, "Please select a future date and time.");
        showToast("Scheduled time must be in the future.", false);
        return;
    }
    clearFieldError(dateTimeInput, dateTimeError);

    const backupDateTime = formatForBackendSchedule(rawDateTime);
    const scheduleBtn = document.getElementById("scheduleBtn");
    scheduleBtn.disabled = true;

    fetch("/api/backup/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, backupLocation, backupPath, backupDateTime })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, data.success);
        if (data.success) {
            document.getElementById("schedulePath").value = "";
            dateTimeInput.value = "";
        }
    })
    .catch(err => {
        showToast("Error scheduling backup: " + err, false);
    })
    .finally(() => {
        scheduleBtn.disabled = false;
    });
}

function submitBackupNow() {
    const instanceId = document.getElementById("currentInstanceId").value;
    const backupLocation = document.getElementById("nowLocation").value;
    const backupPath = document.getElementById("nowPath").value.trim();

    if (!backupPath) {
        showToast("Please select a backup folder using Browse.", false);
        return;
    }

    openProgressModal();

    fetch("/api/backup/now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, backupLocation, backupPath })
    })
    .then(res => res.json())
    .then(data => {
        finishProgressModal(data.success, data.message);
        if (data.success) {
            showToast(data.message + " (Duration: " + data.duration + ", Size: " + data.fileSize + ")", true);
            setTimeout(loadInstances, 800);
        } else {
            showToast(data.message, false);
        }
    })
    .catch(err => {
        finishProgressModal(false, "Error running backup: " + err);
        showToast("Error running backup: " + err, false);
    });
}

function closeEditModal() {
    document.getElementById("editModal").classList.remove("show");
}

function closeDeleteModal() {
    document.getElementById("deleteModal").classList.remove("show");
}

function validateEditFields() {
    const ipInput   = document.getElementById("editInstanceIp");
    const portInput = document.getElementById("editPortNumber");
    const ipError   = document.getElementById("editInstanceIpError");
    const portError = document.getElementById("editPortNumberError");

    let valid = true;

    const ip = ipInput.value.trim();
    if (!ip) {
        setFieldError(ipInput, ipError, "IP address is required.");
        valid = false;
    } else if (!isValidIPv4(ip)) {
        setFieldError(ipInput, ipError, "Enter a valid IPv4 address (each part 0-255).");
        valid = false;
    } else {
        clearFieldError(ipInput, ipError);
    }

    const port = portInput.value.trim();
    if (!port) {
        setFieldError(portInput, portError, "Port number is required.");
        valid = false;
    } else if (!isValidPort(port)) {
        setFieldError(portInput, portError, "Enter a valid port between 1 and 65535.");
        valid = false;
    } else {
        clearFieldError(portInput, portError);
    }

    return valid;
}

async function saveInstanceChanges() {
    if (!validateEditFields()) {
        showToast("Please fix the highlighted fields before saving.", false);
        return;
    }

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
        showToast(data.message || "Instance updated successfully.", true);
    } else {
        showToast(data.message || "Failed to update instance.", false);
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
        showToast("Instance deleted successfully.", true);
    } else {
        showToast(data.message || "Failed to delete instance.", false);
    }
}

function showResult(message, success) {
    showToast(message, success);
}

const PROGRESS_STAGES = ["init", "connect", "export", "compress", "save", "done"];
const PROGRESS_TARGETS = { init: 8, connect: 28, export: 58, compress: 80, save: 93, done: 100 };
let progressTimer = null;
let progressStageIndex = 0;

function openProgressModal() {
    document.getElementById("progressModalTitle").textContent = "Backup in Progress";
    document.getElementById("progressCloseBtn").style.display = "none";
    progressStageIndex = 0;
    setProgressBar(0);

    document.querySelectorAll("#progressStageList li").forEach(li => {
        li.classList.remove("active", "done");
    });

    document.getElementById("backupProgressModal").classList.add("show");

    advanceProgressStage();
    progressTimer = setInterval(advanceProgressStage, 900);
}

function advanceProgressStage() {
    if (progressStageIndex >= PROGRESS_STAGES.length - 1) {
        clearInterval(progressTimer);
        return;
    }
    const stage = PROGRESS_STAGES[progressStageIndex];
    markStage(stage, "active");
    setProgressBar(PROGRESS_TARGETS[stage]);
    progressStageIndex++;
}

function markStage(stageName, state) {
    const li = document.querySelector(`#progressStageList li[data-stage="${stageName}"]`);
    if (!li) return;
    if (state === "active") {
        li.classList.add("active");
        li.classList.remove("done");
    } else if (state === "done") {
        li.classList.remove("active");
        li.classList.add("done");
    }
}

function setProgressBar(percent) {
    document.getElementById("progressBarFill").style.width = percent + "%";
    document.getElementById("progressBarPercentage").textContent = percent + "%";
}

function finishProgressModal(success, message) {
    clearInterval(progressTimer);

    document.querySelectorAll("#progressStageList li").forEach(li => {
        if (li.dataset.stage !== "done") {
            li.classList.remove("active");
            li.classList.add("done");
        }
    });

    if (success) {
        markStage("done", "done");
        document.querySelector('#progressStageList li[data-stage="done"]').classList.add("active");
        setProgressBar(100);
        document.getElementById("progressModalTitle").textContent = "Backup Completed";
    } else {
        setProgressBar(100);
        document.getElementById("progressBarFill").classList.add("failed");
        document.getElementById("progressModalTitle").textContent = "Backup Failed";
    }

    document.getElementById("progressCloseBtn").style.display = "inline-flex";
}

function closeProgressModal() {
    document.getElementById("backupProgressModal").classList.remove("show");
    document.getElementById("progressBarFill").classList.remove("failed");
}

