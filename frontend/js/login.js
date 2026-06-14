// login.js - handles the login form via the /api/login JSON endpoint

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("loginForm");
    const errorBox = document.getElementById("errorBox");

    // If already logged in, skip straight to the dashboard
    fetch("/api/session")
        .then(res => res.json())
        .then(data => {
            if (data.loggedIn) {
                window.location.href = "home.html";
            }
        })
        .catch(() => { /* ignore - show login form as normal */ });

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value.trim();

        if (!username || !password) {
            showError("Please enter both username and password.");
            return;
        }

        fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                window.location.href = "home.html";
            } else {
                showError(data.message || "Invalid username or password.");
            }
        })
        .catch(err => {
            showError("Login failed: " + err);
        });
    });

    function showError(message) {
        errorBox.textContent = message;
        errorBox.style.display = "block";
    }
});
