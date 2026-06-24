let pieChart = null;
let barChart = null;

document.addEventListener("DOMContentLoaded", async () => {
    await initLayout("backupHistory");
    loadReports();
    document.getElementById("exportCsvBtn").addEventListener("click", () => {
        window.location.href = "/api/backup/export";
    });
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
}

function renderSummary(summary) {
    document.getElementById("totalInstances").textContent = summary.totalInstances;
    document.getElementById("totalBackups").textContent = summary.totalBackups;
    document.getElementById("successfulBackups").textContent = summary.successfulBackups;
    document.getElementById("failedBackups").textContent = summary.failedBackups;
    document.getElementById("successRate").textContent = summary.successRate;
    document.getElementById("averageBackupSize").textContent = summary.averageBackupSize;
}

function renderInstanceSummary(instances) {
    const tbody = document.getElementById("instanceSummaryBody");
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
    if (!backups.length) {
        tbody.innerHTML =
            `<tr><td colspan="4" style="text-align:center;">No Backup History Found</td></tr>`;
        return;
    }
    tbody.innerHTML = backups.map(b => {
        const badgeClass =
            b.status === "SUCCESS" ? "connected" : "disconnected";
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
            </tr>
        `;
    }).join("");
}

function formatDateTime(value) {
    if (!value)
        return "-";

    const d = new Date(value);

    if (isNaN(d))
        return "-";
    return d.toLocaleString();
}

function escapeHtml(str) {
    if (str == null)
        return "";

    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderPieChart(summary) {

    const ctx = document
        .getElementById("statusPieChart")
        .getContext("2d");

    if (pieChart)
        pieChart.destroy();

    pieChart = new Chart(ctx, {

        type: "pie",

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
                    "#519330",
                    "#de301d"
                ]
            }]
        },

        options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom"
            }
        }
    }
    });
}

function renderBarChart(instances) {

    const ctx = document
        .getElementById("instanceBarChart")
        .getContext("2d");

    if (barChart)
        barChart.destroy();

    barChart = new Chart(ctx, {

        type: "bar",

        data: {

            labels: instances.map(i => i.instanceName),

            datasets: [{

                label: "Total Backups",

                data: instances.map(i => i.total),

                backgroundColor: "#3498db"

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