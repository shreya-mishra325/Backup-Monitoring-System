let connectionChecked = false; 

document.addEventListener("DOMContentLoaded", function () {
    initLayout("addInstance");
    document.getElementById("checkConnectionBtn").addEventListener("click", checkConnection);
    document.getElementById("addInstanceForm").addEventListener("submit", submitForm);
});

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
