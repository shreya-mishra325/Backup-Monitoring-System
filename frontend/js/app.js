const NAV_TABS = [
    { id: "home",        label: "Home",             href: "home.html" },
    { id: "addInstance", label: "Add New Instance", href: "addInstance.html" },
    { id: "three",       label: "Backup History",            href: "three.html" },
    { id: "four",        label: "Four",             href: "four.html" }
];

function renderTopbar() {
    const topbar = document.getElementById("topbar");

    topbar.innerHTML = `
        <button class="mobile-menu-btn" id="mobileMenuBtn">
            ☰
        </button>
        <div class="brand">Backup Monitoring System</div>
        <div class="user-info">
            <a href="#" id="logoutBtn">Logout</a>
        </div>
    `;
}

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
    tabs.innerHTML = NAV_TABS.map(tab => {
        const activeClass = (tab.id === activeTabId) ? "active" : "";
        return `<a href="${tab.href}" class="${activeClass}">${tab.label}</a>`;
    }).join("");
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
