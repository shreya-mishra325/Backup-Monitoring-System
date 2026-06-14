// app.js - shared logic for all authenticated pages (home, addInstance, three, four)
//
// Responsibilities:
//  - Verify the user is logged in (via /api/session); redirect to login.html if not
//  - Render the top bar (username + logout) and the tab navigation
//
// Each page must include <div id="topbar"></div> and <div id="tabs"></div>
// placeholders, and call initLayout("activeTabId") on load.

const NAV_TABS = [
    { id: "home",        label: "Home",             href: "home.html" },
    { id: "addInstance", label: "Add New Instance", href: "addInstance.html" },
    { id: "three",       label: "Three",            href: "three.html" },
    { id: "four",        label: "Four",             href: "four.html" }
];

/**
 * Checks the session, renders the top bar + tabs, and returns a Promise
 * that resolves with the username once the check completes.
 * Redirects to login.html if the user is not authenticated.
 */
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
}

function renderTabs(activeTabId) {
    const tabs = document.getElementById("tabs");
    if (!tabs) return;

    tabs.innerHTML = NAV_TABS.map(tab => {
        const activeClass = (tab.id === activeTabId) ? "active" : "";
        return `<a href="${tab.href}" class="${activeClass}">${tab.label}</a>`;
    }).join("");
}

/** Basic HTML-escaping helper used when injecting text into innerHTML. */
function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
