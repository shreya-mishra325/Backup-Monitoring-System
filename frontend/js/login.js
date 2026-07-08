document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("loginForm");
    const errorBox = document.getElementById("errorBox");
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    togglePassword.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        togglePassword.innerHTML = isHidden
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>';
    });

    fetch("/api/session")
        .then(res => res.json())
        .then(data => {
            if (data.loggedIn) {
                window.location.href = "home.html";
            }
        })
        .catch(() => {});

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
        if (typeof showToast === "function") {
            showToast(message, false);
        }
    }
});
