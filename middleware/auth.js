// ============================================================
// middleware/auth.js
// Verifies the JWT on every request and attaches the decoded
// payload (user id + role) to req.user. Every RBAC check downstream
// trusts req.user — nothing else.
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; // never hardcode this

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Authentication token missing.' });
    }

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }

        // payload should have been signed at login time with:
        // { id: user.id, role: user.role, status: user.status }
        if (payload.status !== 'approved') {
            return res.status(403).json({ error: 'Account not approved yet.' });
        }

        req.user = {
            id: payload.id,
            role: payload.role,
        };

        next();
    });
}

module.exports = { authenticateToken };
