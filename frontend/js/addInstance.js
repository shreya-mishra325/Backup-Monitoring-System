let connectionChecked = false;

document.addEventListener("DOMContentLoaded", function () {
    initLayout("addInstance");
    document.getElementById("checkConnectionBtn").addEventListener("click", checkConnection);
    document.getElementById("addInstanceForm").addEventListener("submit", submitForm);

    const ipInput   = document.getElementById("instanceIp");
    const portInput = document.getElementById("portNumber");
    const ipError    = document.getElementById("instanceIpError");
    const portError  = document.getElementById("portNumberError");

    ipInput.addEventListener("input", () => clearFieldError(ipInput, ipError));
    portInput.addEventListener("input", () => clearFieldError(portInput, portError));

    document.getElementById("databaseType").addEventListener("change", function () {
        const defaults = { MySQL: 3306, Oracle: 1521, PostgreSQL: 5432, "SQL Server": 1433 };
        const port = document.getElementById("portNumber");
        if (!port.value || Object.values(defaults).includes(parseInt(port.value))) {
            port.value = defaults[this.value] || "";
        }
    });
});

function validateIpPortFields() {
    const ipInput    = document.getElementById("instanceIp");
    const portInput  = document.getElementById("portNumber");
    const ipError    = document.getElementById("instanceIpError");
    const portError  = document.getElementById("portNumberError");

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

function checkConnection() {
    if (!validateIpPortFields()) {
        showToast("Please fix the highlighted fields before checking connection.", false);
        return;
    }

    const ip   = document.getElementById("instanceIp").value.trim();
    const port = document.getElementById("portNumber").value.trim();

    showConnectionResult("Checking connection...", null);

    fetch(`/api/instances/check-connection?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`)
        .then(res => res.json())
        .then(data => {
            const ok = data.status === "Connected";
            showConnectionResult(
                ok ? "Connection successful — server is reachable."
                   : "Connection failed — server is not reachable on that IP/port.",
                ok
            );
            connectionChecked = true;
        })
        .catch(err => showConnectionResult("Error: " + err, false));
}

function submitForm(e) {
    e.preventDefault();

    if (!validateIpPortFields()) {
        showToast("Please fix the highlighted fields before submitting.", false);
        return;
    }

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
    showToast(msg, ok);
}

function showConnectionResult(msg, ok) {
    showToast(msg, ok);
}
