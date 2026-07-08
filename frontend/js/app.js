(function applyStoredPreferences() {
    try {
        if (localStorage.getItem("bms_compact_sidebar") === "1") {
            document.documentElement.setAttribute("data-compact-sidebar", "true");
        }
    } catch (e) {}
})();

const NAV_TABS = [
    { id: "home",             label: "Dashboard",        href: "home.html",             icon: "fa-solid fa-gauge-high" },
    { id: "addInstance",      label: "Add New Instance", href: "addInstance.html",      icon: "fa-solid fa-database" },
    { id: "reports",          label: "Reports",          href: "reports.html",          icon: "fa-solid fa-chart-pie" },
    { id: "backupHistory",    label: "Backup History",   href: "backupHistory.html",    icon: "fa-solid fa-clock-rotate-left" },
    { id: "scheduledBackups", label: "Scheduled Backups", href: "scheduledBackups.html", icon: "fa-solid fa-calendar-days" },
    { id: "settings",         label: "Settings",         href: "settings.html",         icon: "fa-solid fa-gear" }
];

function initLayout(activeTabId) {
    return fetch("/api/session")
        .then(res => res.json())
        .then(data => {
            if (!data.loggedIn) {
                window.location.href = "login.html";
                return Promise.reject("not logged in");
            }
            renderTopbar(data.username);
            renderTabs(activeTabId);
            return data.username;
        })
        .catch(err => {
            console.error("Session check failed:", err);
        });
}

function renderTopbar(username) {
    const topbar = document.getElementById("topbar");
    if (!topbar) return;

    topbar.innerHTML = `
        <button class="mobile-menu-btn" id="mobileMenuBtn">
            ☰
        </button>

        <div class="brand">Backup Monitoring System</div>

        <div class="user-info">
            <span>Welcome, ${escapeHtml(username)}</span>
            <a href="#" id="logoutLink">Logout</a>
        </div>
    `;

    window.__bmsUsername = username;

    document.getElementById("logoutLink").addEventListener("click", function (e) {
        e.preventDefault();
        fetch("/api/logout")
            .then(() => { window.location.href = "login.html"; })
            .catch(() => { window.location.href = "login.html"; });
    });

    const menuBtn = document.getElementById("mobileMenuBtn");
    const tabs = document.getElementById("tabs");

    if (menuBtn && tabs) {
        menuBtn.addEventListener("click", () => {
            tabs.classList.toggle("show");
        });
    }
}

function renderTabs(activeTabId) {
    const tabs = document.getElementById("tabs");
    if (!tabs) return;
    const links = NAV_TABS.map(tab => {
        const activeClass = (tab.id === activeTabId) ? "active" : "";
        const icon = tab.icon ? `<i class="nav-icon ${tab.icon}"></i>` : "";
        return `<a href="${tab.href}" class="${activeClass}">${icon}<span>${tab.label}</span></a>`;
    }).join("");
    tabs.innerHTML = links + `<div class="sidebar-footer">© ${new Date().getFullYear()} East Coast Railway</div>`;
}

function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function showToast(message, status) {
    if (!message) return;

    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const type = status === true ? "success" : status === false ? "error" : "info";
    const iconClass = type === "success"
        ? "fa-solid fa-circle-check"
        : type === "error"
            ? "fa-solid fa-circle-xmark"
            : "fa-solid fa-circle-info";

    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML = `<i class="${iconClass}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 250);
    }, 4200);
}

function isValidIPv4(value) {
    if (!value) return false;
    const parts = value.trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every(part => {
        if (!/^\d{1,3}$/.test(part)) return false;
        const n = Number(part);
        return n >= 0 && n <= 255;
    });
}

function isValidPort(value) {
    if (value === "" || value == null) return false;
    if (!/^\d+$/.test(String(value).trim())) return false;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function setFieldError(inputEl, errorEl, message) {
    if (inputEl) inputEl.classList.add("invalid");
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add("show");
    }
}

function clearFieldError(inputEl, errorEl) {
    if (inputEl) inputEl.classList.remove("invalid");
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.remove("show");
    }
}

let folderBrowserTargetInputId = null;
let folderBrowserCurrentPath = null;

document.addEventListener("DOMContentLoaded", function () {
    const cancelBtn = document.getElementById("folderBrowserCancelBtn");
    const upBtn = document.getElementById("folderBrowserUpBtn");
    const selectBtn = document.getElementById("folderBrowserSelectBtn");
    const goBtn = document.getElementById("folderBrowserGoBtn");
    const pathInput = document.getElementById("folderBrowserPath");

    if (cancelBtn) cancelBtn.addEventListener("click", closeFolderBrowser);
    if (upBtn) upBtn.addEventListener("click", folderBrowserGoUp);
    if (selectBtn) selectBtn.addEventListener("click", folderBrowserSelectCurrent);
    if (goBtn) goBtn.addEventListener("click", folderBrowserGoToTypedPath);
    if (pathInput) {
        pathInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                folderBrowserGoToTypedPath();
            }
        });
    }
});

function openFolderBrowser(targetInputId) {
    if (!document.getElementById("folderBrowserModal")) return;
    folderBrowserTargetInputId = targetInputId;
    folderBrowserCurrentPath = null;

    const existingValue = targetInputId ? document.getElementById(targetInputId).value.trim() : "";

    document.getElementById("folderBrowserModal").classList.add("show");
    loadFolderBrowserPath(existingValue || null);
}

function closeFolderBrowser() {
    const modal = document.getElementById("folderBrowserModal");
    if (modal) modal.classList.remove("show");
}

function folderBrowserGoToTypedPath() {
    const pathEl = document.getElementById("folderBrowserPath");
    const typed = pathEl.value.trim();
    if (!typed) {
        showToast("Type a folder path first.", false);
        return;
    }
    loadFolderBrowserPath(typed);
}

async function loadFolderBrowserPath(targetPath) {
    const listEl = document.getElementById("folderBrowserList");
    const pathEl = document.getElementById("folderBrowserPath");
    const upBtn = document.getElementById("folderBrowserUpBtn");

    listEl.innerHTML = `<div class="folder-browser-message">Loading...</div>`;

    try {
        const url = targetPath
            ? `/api/filesystem/list?path=${encodeURIComponent(targetPath)}`
            : `/api/filesystem/list`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            listEl.innerHTML = `<div class="folder-browser-message">${escapeHtml(data.error || "Failed to load folder.")}</div>`;
            if (targetPath) {
                folderBrowserCurrentPath = targetPath;
            }
            return;
        }

        folderBrowserCurrentPath = data.path;
        pathEl.value = data.path || "";
        pathEl.placeholder = "Type a full path, e.g. C:\\Users\\yourname\\Downloads";
        upBtn.disabled = !data.parent;
        upBtn.dataset.parent = data.parent || "";

        if (!data.directories.length) {
            listEl.innerHTML = `<div class="folder-browser-message">No subfolders here.</div>`;
            return;
        }

        listEl.innerHTML = data.directories.map(dir => `
            <div class="folder-browser-item" data-path="${escapeHtml(dir.path)}">
                <i class="fa-solid fa-folder"></i>
                <span>${escapeHtml(dir.name)}</span>
            </div>
        `).join("");

        listEl.querySelectorAll(".folder-browser-item").forEach(item => {
            item.addEventListener("dblclick", () => loadFolderBrowserPath(item.dataset.path));
            item.addEventListener("click", () => {
                listEl.querySelectorAll(".folder-browser-item").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
                folderBrowserCurrentPath = item.dataset.path;
                pathEl.value = item.dataset.path;
            });
        });

    } catch (err) {
        listEl.innerHTML = `<div class="folder-browser-message">Failed to load folder: ${escapeHtml(String(err))}</div>`;
    }
}

function folderBrowserGoUp() {
    const upBtn = document.getElementById("folderBrowserUpBtn");
    if (upBtn.dataset.parent) {
        loadFolderBrowserPath(upBtn.dataset.parent);
    } else {
        loadFolderBrowserPath(null);
    }
}

function folderBrowserSelectCurrent() {
    const pathEl = document.getElementById("folderBrowserPath");
    const typedPath = pathEl.value.trim();
    const finalPath = typedPath || folderBrowserCurrentPath;

    if (!finalPath) {
        showToast("Please choose or type a folder first.", false);
        return;
    }
    if (folderBrowserTargetInputId) {
        document.getElementById(folderBrowserTargetInputId).value = finalPath;
    }
    closeFolderBrowser();
}

