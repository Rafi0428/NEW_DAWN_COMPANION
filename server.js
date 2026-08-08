// ============================================================
// server.js
// Entry point — wires together middleware, routes, and static
// file serving for NEW_DAWN_COMPANION.
// ============================================================

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Core middleware & Static Routing
// ------------------------------------------------------------
app.use(express.json());
app.use(cookieParser());

// 1. MUST COME FIRST: Intercept the root URL and serve landing.html
// (If this comes after express.static, Express will auto-serve index.html instead)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// 2. Serve all other static assets (CSS, images, admin-dashboard.html, etc.) from /public
app.use(express.static(path.join(__dirname, 'public')));


// ------------------------------------------------------------
// Routes
//
// A NOTE ON WHERE AUTH/RBAC IS APPLIED:
// authenticateToken, requireRole, and authorizeClassAccess are
// NOT applied here at the app-level. They're applied per-route
// INSIDE each router file (as built in Parts 1-3), because
// different routes on the same resource need different rules —
// e.g. GET /chapters/:chapterId/materials allows students,
// PUT does not. Applying one blanket middleware here would be
// too coarse for that. This file only decides which base path
// each router is mounted under.
// ------------------------------------------------------------
const authRoutes = require('./routes/authRoutes');           // login, signup, admin/teacher approval
const hierarchyRoutes = require('./routes/hierarchyRoutes'); // Class / Subject CRUD
const chapterRoutes = require('./routes/chapterRoutes');     // Chapter CRUD + study material
const quizRoutes = require('./routes/quizRoutes');           // AI quiz generation, attempts, results

// Auth routes are intentionally NOT wrapped in authenticateToken —
// login/signup have to be reachable by unauthenticated users.
// (Approval endpoints inside authRoutes.js apply their own
// authenticateToken + requireRole('admin'|'teacher') per-route.)
app.use('/api/auth', authRoutes);

// These are all internally protected per-route — see the note above.
app.use('/api', hierarchyRoutes);
app.use('/api', chapterRoutes);
app.use('/api', quizRoutes);

// ------------------------------------------------------------
// Health check (handy for uptime monitors / load balancers)
// ------------------------------------------------------------
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ------------------------------------------------------------
// 404 handler — for unmatched API routes
// ------------------------------------------------------------
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Route not found.' });
});

// ------------------------------------------------------------
// Centralized error handler — catches anything passed to next(err)
// or thrown synchronously in a route that isn't already caught.
// ------------------------------------------------------------
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error.'
            : err.message,
    });
});

app.listen(PORT, () => {
    console.log(`NEW_DAWN_COMPANION server running on http://localhost:${PORT}`);
});