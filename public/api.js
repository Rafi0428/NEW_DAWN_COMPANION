// ============================================================
// public/js/api.js
// Shared helper loaded by every page. Handles:
//   - access token storage
//   - authenticated fetch() with automatic refresh-on-401
//   - route guarding by role
//   - logout
// ============================================================

const API_BASE = '/api';

const Auth = {
    getToken() {
        return localStorage.getItem('ndc_accessToken');
    },
    setToken(token) {
        localStorage.setItem('ndc_accessToken', token);
    },
    clearToken() {
        localStorage.removeItem('ndc_accessToken');
        localStorage.removeItem('ndc_user');
    },
    getUser() {
        const raw = localStorage.getItem('ndc_user');
        return raw ? JSON.parse(raw) : null;
    },
    setUser(user) {
        localStorage.setItem('ndc_user', JSON.stringify(user));
    },
    async logout() {
        try {
            await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (_) { /* best-effort */ }
        this.clearToken();
        window.location.href = 'index.html';
    },
};

/**
 * Authenticated fetch wrapper. Attaches the bearer token, retries
 * once via /auth/refresh on a 401/403 (in case the access token
 * simply expired), and redirects to login if that also fails.
 */
async function apiFetch(path, options = {}) {
    const doFetch = () => fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(Auth.getToken() ? { Authorization: `Bearer ${Auth.getToken()}` } : {}),
            ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let res = await doFetch();

    if (res.status === 401 || res.status === 403) {
        const refreshed = await tryRefresh();
        if (refreshed) {
            res = await doFetch();
        }
    }

    return res;
}

async function tryRefresh() {
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!res.ok) return false;
        const data = await res.json();
        Auth.setToken(data.accessToken);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Call at the top of every protected page.
 * Redirects to index.html if not logged in, or to the correct
 * dashboard if logged in but with the wrong role.
 */
function requireAuth(allowedRoles) {
    const user = Auth.getUser();
    const token = Auth.getToken();

    if (!user || !token) {
        window.location.href = 'index.html';
        return null;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = dashboardPathFor(user.role);
        return null;
    }

    return user;
}

function dashboardPathFor(role) {
    if (role === 'admin') return 'admin-dashboard.html';
    if (role === 'teacher') return 'teacher-dashboard.html';
    return 'student-dashboard.html';
}

// Small helper for showing inline error/success banners consistently.
function showBanner(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `banner ${type}`;
    el.style.display = 'block';
}

function hideBanner(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = 'none';
}
