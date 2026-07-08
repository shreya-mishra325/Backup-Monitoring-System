document.addEventListener("DOMContentLoaded", function () {
    initLayout("settings").then((username) => {
        const name = username || window.__bmsUsername || "Admin";
        document.getElementById("settingsUsername").textContent = name;
        document.getElementById("settingsAvatar").textContent = name.charAt(0).toUpperCase();
    });

    const compactSidebarToggle = document.getElementById("compactSidebarToggle");
    try {
        compactSidebarToggle.checked = localStorage.getItem("bms_compact_sidebar") === "1";
    } catch (e) {}

    compactSidebarToggle.addEventListener("change", function () {
        try {
            if (this.checked) {
                localStorage.setItem("bms_compact_sidebar", "1");
                document.documentElement.setAttribute("data-compact-sidebar", "true");
            } else {
                localStorage.removeItem("bms_compact_sidebar");
                document.documentElement.removeAttribute("data-compact-sidebar");
            }
        } catch (e) {}
    });

    document.getElementById("changePasswordForm").addEventListener("submit", submitChangePassword);
    ["currentPassword", "newPassword", "confirmNewPassword"].forEach((id) => {
        const input = document.getElementById(id);
        input.addEventListener("input", () => clearFieldError(input, document.getElementById(id + "Error")));
    });
});

function submitChangePassword(e) {
    e.preventDefault();
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmNewPassword");
    const currentPasswordError = document.getElementById("currentPasswordError");
    const newPasswordError = document.getElementById("newPasswordError");
    const confirmError = document.getElementById("confirmNewPasswordError");
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmInput.value;

    let valid = true;

    if (!currentPassword) {
        setFieldError(currentPasswordInput, currentPasswordError, "Current password is required.");
        valid = false;
    } else {
        clearFieldError(currentPasswordInput, currentPasswordError);
    }

    if (!newPassword || newPassword.length < 6) {
        setFieldError(newPasswordInput, newPasswordError, "New password must be at least 6 characters.");
        valid = false;
    } else {
        clearFieldError(newPasswordInput, newPasswordError);
    }

    if (newPassword !== confirmNewPassword) {
        setFieldError(confirmInput, confirmError, "Passwords do not match.");
        valid = false;
    } else if (valid) {
        clearFieldError(confirmInput, confirmError);
    }

    if (!valid) {
        showToast("Please fix the highlighted fields.", false);
        return;
    }

    const btn = document.getElementById("changePasswordBtn");
    btn.disabled = true;

    fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, data.success);
        if (data.success) {
            document.getElementById("changePasswordForm").reset();
        }
    })
    .catch(err => {
        showToast("Error updating password: " + err, false);
    })
    .finally(() => {
        btn.disabled = false;
    });
}
