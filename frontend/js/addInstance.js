let connectionChecked = false;

document.addEventListener("DOMContentLoaded", function () {
    initLayout("addInstance");
    document.getElementById("checkConnectionBtn").addEventListener("click", checkConnection);
    document.getElementById("addInstanceForm").addEventListener("submit", submitForm);

    document.getElementById("databaseType").addEventListener("change", function () {
        const defaults = { MySQL: 3306, Oracle: 1521, PostgreSQL: 5432, "SQL Server": 1433 };
        const port = document.getElementById("portNumber");
        if (!port.value || Object.values(defaults).includes(parseInt(port.value))) {
            port.value = defaults[this.value] || "";
        }
    });
});

function checkConnection() {
    const ip   = document.getElementById("instanceIp").value.trim();
    const port = document.getElementById("portNumber").value.trim();
    const box  = document.getElementById("connectionResult");

    if (!ip || !port) {
        showConnectionResult("Please enter Instance IP and Port Number first.", false);
        return;
    }

    showConnectionResult("Checking connection...", null);

    fetch(`/api/instances/check-connection?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`)
        .then(res => res.json())
        .then(data => {
            const ok = data.status === "Connected";
            showConnectionResult(
                ok ? "✔ Connection successful — server is reachable."
                   : "✘ Connection failed — server is not reachable on that IP/port.",
                ok
            );
            connectionChecked = true;
        })
        .catch(err => showConnectionResult("Error: " + err, false));
}

function submitForm(e) {
    e.preventDefault();

    const payload = {
        action:       connectionChecked ? "checkAndAdd" : "add",
        instanceName: document.getElementById("instanceName").value.trim(),
        databaseType: document.getElementById("databaseType").value,
        instanceIp:   document.getElementById("instanceIp").value.trim(),
        portNumber:   document.getElementById("portNumber").value.trim(),
        dbUsername:   document.getElementById("dbUsername").value.trim(),
        dbPassword:   document.getElementById("dbPassword").value,
    };

    if (!payload.instanceName || !payload.instanceIp || !payload.portNumber) {
        showAddResult("Please fill in all required fields.", false);
        return;
    }

    fetch("/api/instances", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAddResult("Instance added successfully! Redirecting...", true);
            document.getElementById("addInstanceForm").reset();
            connectionChecked = false;
            document.getElementById("connectionResult").style.display = "none";
            setTimeout(() => {
                window.location.href = "home.html?id=" + data.instance.instanceId;
            }, 900);
        } else {
            showAddResult(data.message || "Failed to add instance.", false);
        }
    })
    .catch(err => showAddResult("Error: " + err, false));
}

function showAddResult(msg, ok) {
    const el = document.getElementById("addResult");
    el.textContent = msg;
    el.className   = "action-result " + (ok === true ? "success" : ok === false ? "error" : "");
}

function showConnectionResult(msg, ok) {
    const el = document.getElementById("connectionResult");
    el.textContent = msg;
    el.style.display = "block";
    el.className = "connection-result " + (ok === true ? "success" : ok === false ? "error" : "");
}