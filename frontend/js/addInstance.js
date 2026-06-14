// addInstance.js - handles "Check Connection" and "Submit" on the Add New Instance page

let connectionChecked = false; // tracks whether Check Connection was used before Submit

document.addEventListener("DOMContentLoaded", function () {
    initLayout("addInstance");

    document.getElementById("checkConnectionBtn").addEventListener("click", checkConnection);
    document.getElementById("addInstanceForm").addEventListener("submit", submitForm);
});

/**
 * Calls /api/instances/check-connection?ip=...&port=... to test
 * whether the given instance is reachable, and displays the result.
 */
function checkConnection() {
    const ip = document.getElementById("instanceIp").value.trim();
    const port = document.getElementById("portNumber").value.trim();
    const resultBox = document.getElementById("connectionResult");

    if (!ip || !port) {
        resultBox.textContent = "Please enter Instance IP and Port Number first.";
        resultBox.className = "connection-result error";
        resultBox.style.display = "block";
        return;
    }

    resultBox.textContent = "Checking connection...";
    resultBox.className = "connection-result";
    resultBox.style.display = "block";

    fetch(`/api/instances/check-connection?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "Connected") {
                resultBox.textContent = "Connection successful! Instance is reachable.";
                resultBox.className = "connection-result success";
            } else {
                resultBox.textContent = "Connection failed. Instance is not reachable.";
                resultBox.className = "connection-result error";
            }
            connectionChecked = true;
        })
        .catch(err => {
            resultBox.textContent = "Error checking connection: " + err;
            resultBox.className = "connection-result error";
        });
}

/**
 * Submits the new instance form via AJAX to POST /api/instances.
 * Uses action=checkAndAdd if Check Connection was used, otherwise action=add.
 */
function submitForm(e) {
    e.preventDefault();

    const instanceName = document.getElementById("instanceName").value.trim();
    const databaseType = document.getElementById("databaseType").value;
    const instanceIp = document.getElementById("instanceIp").value.trim();
    const portNumber = document.getElementById("portNumber").value.trim();

    const addResult = document.getElementById("addResult");

    if (!instanceName || !databaseType || !instanceIp || !portNumber) {
        showAddResult("Please fill in all fields.", false);
        return;
    }

    const action = connectionChecked ? "checkAndAdd" : "add";

    fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, instanceName, databaseType, instanceIp, portNumber })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAddResult("Instance added successfully!", true);
            document.getElementById("addInstanceForm").reset();
            connectionChecked = false;
            document.getElementById("connectionResult").style.display = "none";

            // Redirect to home page showing the new instance after a short delay
            setTimeout(() => {
                window.location.href = "home.html?id=" + data.instance.instanceId;
            }, 1000);
        } else {
            showAddResult(data.message || "Failed to add instance.", false);
        }
    })
    .catch(err => {
        showAddResult("Error adding instance: " + err, false);
    });

    function showAddResult(message, success) {
        addResult.textContent = message;
        addResult.className = "action-result " + (success ? "success" : "error");
    }
}
