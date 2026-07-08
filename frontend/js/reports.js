let pieChart = null;
let barChart = null;
let allSchedules = [];

document.addEventListener("DOMContentLoaded", async () => {
    const activeTab = document.body.dataset.activeTab || "backupHistory";
    await initLayout(activeTab);
    loadReports();

    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", () => {
            window.location.href = "/api/backup/export";
        });
    }
    const cancelRescheduleBtn = document.getElementById("cancelRescheduleBtn");
    if (cancelRescheduleBtn) cancelRescheduleBtn.addEventListener("click", closeRescheduleModal);

    const saveRescheduleBtn = document.getElementById("saveRescheduleBtn");
    if (saveRescheduleBtn) saveRescheduleBtn.addEventListener("click", saveReschedule);

    const closeCancelScheduleBtn = document.getElementById("closeCancelScheduleBtn");
    if (closeCancelScheduleBtn) closeCancelScheduleBtn.addEventListener("click", closeCancelScheduleModal);

    const confirmCancelScheduleBtn = document.getElementById("confirmCancelScheduleBtn");
    if (confirmCancelScheduleBtn) confirmCancelScheduleBtn.addEventListener("click", confirmCancelSchedule);

    const rescheduleDateTimeInput = document.getElementById("rescheduleDateTime");
    if (rescheduleDateTimeInput) {
        rescheduleDateTimeInput.min = toDatetimeLocalValue(new Date());
        rescheduleDateTimeInput.addEventListener("input", () =>
            clearFieldError(rescheduleDateTimeInput, document.getElementById("rescheduleDateTimeError"))
        );
    }
});

async function loadReports() {
    try {
        const res = await fetch("/api/backup/reports");
        const data = await res.json();
        renderSummary(data.summary);
        renderInstanceSummary(data.instanceSummary);
        renderRecentActivity(data.recentActivity);
        renderPieChart(data.summary);
        renderBarChart(data.instanceSummary);
    } catch (err) {
        console.error(err);
    }
    loadScheduledBackups();
}

async function loadScheduledBackups() {
    const tbody = document.getElementById("scheduledBackupsBody");
    if (!tbody) return;
    try {
        const res = await fetch("/api/backup/schedules");
        const schedules = await res.json();
        allSchedules = schedules;
        renderScheduledBackups(schedules);
    } catch (err) {
        console.error(err);
        tbody.innerHTML =
            `<tr><td colspan="6" style="text-align:center;">Failed to load scheduled backup history.</td></tr>`;
    }
}

function renderScheduledBackups(schedules) {
    const tbody = document.getElementById("scheduledBackupsBody");
    if (!tbody) return;
    if (!schedules.length) {
        tbody.innerHTML =
            `<tr><td colspan="6" style="text-align:center;">No Scheduled Backups Found</td></tr>`;
        return;
    }
    tbody.innerHTML = schedules.map(s => {
        const statusClass =
            s.status === "Completed" ? "connected" :
            (s.status === "Failed" || s.status === "Cancelled") ? "disconnected" :
            s.status === "Scheduled" ? "scheduled" : "";

        const canManage = s.status === "Scheduled";

        return `
            <tr>
                <td>${escapeHtml(s.instanceName)}</td>
                <td>${escapeHtml(s.backupLocation)}</td>
                <td>${formatDateTime(s.backupDatetime)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${escapeHtml(s.status)}
                    </span>
                </td>
                <td>${formatDateTime(s.createdAt)}</td>
                <td>
                    ${canManage ? `
                        <div class="table-actions">
                            <button class="icon-btn edit-btn" title="Edit / Reschedule" onclick="openRescheduleModal(${s.scheduleId})">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="icon-btn delete-btn" title="Cancel" onclick="openCancelScheduleModal(${s.scheduleId})">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    ` : `<span style="color:var(--text-faint);font-size:12px;">-</span>`}
                </td>
            </tr>
        `;
    }).join("");
}

function renderSummary(summary) {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText("totalInstances", summary.totalInstances);
    setText("totalBackups", summary.totalBackups);
    setText("successfulBackups", summary.successfulBackups);
    setText("failedBackups", summary.failedBackups);
    setText("successRate", summary.successRate);
    setText("averageBackupSize", summary.averageBackupSize);
}

function renderInstanceSummary(instances) {
    const tbody = document.getElementById("instanceSummaryBody");
    if (!tbody) return;
    if (!instances.length) {
        tbody.innerHTML =
            `<tr><td colspan="4" style="text-align:center;">No Data Available</td></tr>`;
        return;
    }
    tbody.innerHTML = instances.map(inst => `
        <tr>
            <td>${escapeHtml(inst.instanceName)}</td>
            <td>${inst.total}</td>
            <td>${inst.success}</td>
            <td>${inst.failed}</td>
        </tr>
    `).join("");
}

function renderRecentActivity(backups) {
    const tbody = document.getElementById("recentActivityBody");
    if (!tbody) return;
    if (!backups.length) {
        tbody.innerHTML =
            `<tr><td colspan="5" style="text-align:center;">No Backup History Found</td></tr>`;
        return;
    }
    tbody.innerHTML = backups.map(b => {
        const badgeClass =
            b.status === "SUCCESS" ? "connected" : "disconnected";

        const canDownload = b.status === "SUCCESS" && b.fileName;

        return `
            <tr>
                <td>${formatDateTime(b.backupDate)}</td>
                <td>${escapeHtml(b.instanceName)}</td>
                <td>
                    <span class="status-badge ${badgeClass}">
                        ${b.status}
                    </span>
                </td>
                <td>${escapeHtml(b.remark)}</td>
                <td>
                    ${canDownload ? `
                        <button class="icon-btn edit-btn" title="Download backup file" onclick="downloadBackup(${b.historyId})">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    ` : `<span style="color:var(--text-faint);font-size:12px;">-</span>`}
                </td>
            </tr>
        `;
    }).join("");
}

function downloadBackup(historyId) {
    window.location.href = `/api/backup/download/${historyId}`;
}

function formatDateTime(value) {
    if (!value)
        return "-";

    const d = new Date(value);

    if (isNaN(d))
        return "-";
    return d.toLocaleString();
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


function openRescheduleModal(scheduleId) {
    const schedule = allSchedules.find(s => s.scheduleId === scheduleId);
    if (!schedule) return;

    document.getElementById("rescheduleId").value = schedule.scheduleId;
    document.getElementById("rescheduleLocation").value = schedule.backupLocation;
    document.getElementById("reschedulePath").value = schedule.backupPath;

    const dt = new Date(schedule.backupDatetime);
    const dateTimeInput = document.getElementById("rescheduleDateTime");
    dateTimeInput.value = isNaN(dt.getTime()) ? "" : toDatetimeLocalValue(dt);
    clearFieldError(dateTimeInput, document.getElementById("rescheduleDateTimeError"));

    document.getElementById("rescheduleModal").classList.add("show");
}

function closeRescheduleModal() {
    document.getElementById("rescheduleModal").classList.remove("show");
}

function saveReschedule() {
    const scheduleId = document.getElementById("rescheduleId").value;
    const backupLocation = document.getElementById("rescheduleLocation").value;
    const backupPath = document.getElementById("reschedulePath").value.trim();
    const dateTimeInput = document.getElementById("rescheduleDateTime");
    const dateTimeError = document.getElementById("rescheduleDateTimeError");
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
        return;
    }
    if (selectedDate.getTime() <= Date.now()) {
        setFieldError(dateTimeInput, dateTimeError, "Please select a future date and time.");
        return;
    }
    clearFieldError(dateTimeInput, dateTimeError);

    const backupDateTime = formatForBackendSchedule(rawDateTime);
    const saveBtn = document.getElementById("saveRescheduleBtn");
    saveBtn.disabled = true;

    fetch(`/api/backup/schedule/${scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupLocation, backupPath, backupDateTime })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, data.success);
        if (data.success) {
            closeRescheduleModal();
            loadScheduledBackups();
        }
    })
    .catch(err => showToast("Error updating schedule: " + err, false))
    .finally(() => { saveBtn.disabled = false; });
}

let scheduleIdPendingCancel = null;

function openCancelScheduleModal(scheduleId) {
    scheduleIdPendingCancel = scheduleId;
    document.getElementById("cancelScheduleModal").classList.add("show");
}

function closeCancelScheduleModal() {
    scheduleIdPendingCancel = null;
    document.getElementById("cancelScheduleModal").classList.remove("show");
}

function confirmCancelSchedule() {
    if (!scheduleIdPendingCancel) return;

    fetch(`/api/backup/schedule/${scheduleIdPendingCancel}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            showToast(data.message, data.success);
            if (data.success) {
                closeCancelScheduleModal();
                loadScheduledBackups();
            }
        })
        .catch(err => showToast("Error cancelling schedule: " + err, false));
}


function renderPieChart(summary) {

    const canvas = document.getElementById("statusPieChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (pieChart)
        pieChart.destroy();

    pieChart = new Chart(ctx, {

        type: "doughnut",

        data: {

            labels: [
                "Successful",
                "Failed"
            ],

            datasets: [{
                data: [
                    summary.successfulBackups,
                    summary.failedBackups
                ],
                backgroundColor: [
                    "#22b056",
                    "#ea2222"
                ],
                borderWidth: 0
            }]
        },

        options: {
        responsive: true,
        maintainAspectRatio: false,
        radius: "100%",
        layout: {
            padding: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        },
        cutout: "68%",
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

    renderDonutLegend(summary);
}

function renderDonutLegend(summary) {
    const legend = document.getElementById("donutLegend");
    if (!legend) return;

    const success = summary.successfulBackups || 0;
    const failed = summary.failedBackups || 0;
    const total = success + failed;

    const successPct = total ? ((success * 100) / total).toFixed(1) : "0.0";
    const failedPct = total ? ((failed * 100) / total).toFixed(1) : "0.0";

    legend.innerHTML = `
        <div class="donut-legend-item">
            <span class="donut-legend-dot" style="background:#22c55e;"></span>
            <div>
                <div class="donut-legend-label">Successful</div>
                <div class="donut-legend-value">${successPct}% (${success})</div>
            </div>
        </div>
        <div class="donut-legend-item">
            <span class="donut-legend-dot" style="background:#ef4444;"></span>
            <div>
                <div class="donut-legend-label">Failed</div>
                <div class="donut-legend-value">${failedPct}% (${failed})</div>
            </div>
        </div>
    `;
}

function renderBarChart(instances) {
    const canvas = document.getElementById("instanceBarChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (barChart)
        barChart.destroy();
    barChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: instances.map(i => i.instanceName),
            datasets: [{
                label: "Total Backups",
                data: instances.map(i => i.total),
                backgroundColor: "#0d8fe6"
            }]
        },
        options: {
            responsive: true,
            indexAxis: "y",
            scales: {
                x: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}
