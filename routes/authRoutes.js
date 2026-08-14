// ============================================================
// routes/authRoutes.js
// Signup, login, token refresh, and the two-tier approval chain:
//   Admin approves Teachers
//   Teacher approves Students (and assigns them to a class in
//   the same action, per the platform's requirements)
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/pool');

const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches default above

const BCRYPT_ROUNDS = 12;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function signAccessToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role, status: user.status },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function signRefreshToken(user) {
    return jwt.sign(
        { id: user.id, tokenType: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_EXPIRES_IN }
    );
}

function setRefreshCookie(res, token) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS,
        path: '/api/auth', // only sent back to auth endpoints
    });
}

function publicUser(row) {
    return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role,
        status: row.status,
    };
}

// ------------------------------------------------------------
// POST /api/auth/signup
// Public. Only 'teacher' and 'student' may self-register —
// Admins are seeded directly in the database (see schema.sql),
// never created through this endpoint.
// ------------------------------------------------------------
router.post('/signup', async (req, res) => {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
        return res.status(400).json({ error: 'fullName, email, password, and role are required.' });
    }

    if (!['teacher', 'student'].includes(role)) {
        return res.status(400).json({ error: 'role must be either "teacher" or "student".' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const { rows } = await db.query(
            `INSERT INTO users (full_name, email, password_hash, role, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id, full_name, email, role, status`,
            [fullName.trim(), email.toLowerCase().trim(), passwordHash, role]
        );

        res.status(201).json({
            message: role === 'teacher'
                ? 'Account created. An Admin must approve your account before you can log in.'
                : 'Account created. A Teacher must approve your account before you can log in.',
            user: publicUser(rows[0]),
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Failed to create account.' });
    }
});

// ------------------------------------------------------------
// POST /api/auth/login
// Public. Rejects unapproved/rejected accounts explicitly so
// the frontend can show the right message.
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required.' });
    }

    try {
        const { rows } = await db.query(
            'SELECT id, full_name, email, password_hash, role, status FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        );

        // Deliberately generic message — don't reveal whether the
        // email exists at all.
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = rows[0];
        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is still pending approval.' });
        }
        if (user.status === 'rejected') {
            return res.status(403).json({ error: 'Your account application was not approved.' });
        }
        if (user.status === 'revoked') {
            return res.status(403).json({ error: 'Your teacher account has been revoked by an admin.' });
        }

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);
        setRefreshCookie(res, refreshToken);

        res.json({ accessToken, user: publicUser(user) });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Failed to log in.' });
    }
});

// ------------------------------------------------------------
// POST /api/auth/refresh
// Reads the httpOnly refresh cookie and issues a new access
// token. Re-checks status against the DB (not just the token
// payload) so a revoked/rejected user is cut off immediately
// even mid-refresh-token lifetime.
// ------------------------------------------------------------
router.post('/refresh', async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token) {
        return res.status(401).json({ error: 'No refresh token provided.' });
    }

    try {
        const payload = jwt.verify(token, JWT_REFRESH_SECRET);

        const { rows } = await db.query(
            'SELECT id, role, status FROM users WHERE id = $1',
            [payload.id]
        );
        if (rows.length === 0 || rows[0].status !== 'approved') {
            res.clearCookie('refreshToken', { path: '/api/auth' });
            return res.status(403).json({ error: 'Account no longer active.' });
        }

        const accessToken = signAccessToken(rows[0]);
        res.json({ accessToken });
    } catch (err) {
        res.clearCookie('refreshToken', { path: '/api/auth' });
        return res.status(403).json({ error: 'Invalid or expired refresh token.' });
    }
});

// ------------------------------------------------------------
// POST /api/auth/logout
// ------------------------------------------------------------
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.status(204).send();
});

// ------------------------------------------------------------
// GET /api/auth/me
// Returns the current authenticated user's fresh profile.
// ------------------------------------------------------------
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT id, full_name, email, role, status FROM users WHERE id = $1',
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json(publicUser(rows[0]));
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// ============================================================
// ADMIN -> TEACHER APPROVAL CHAIN
// ============================================================

// GET /api/auth/admin/teachers/pending
router.get(
    '/admin/teachers/pending',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, full_name, email, created_at 
                 FROM users 
                 WHERE role = 'teacher' AND status IN ('pending', 'rejected') 
                 ORDER BY created_at ASC`
            );
            res.json(rows);
        } catch (err) {
            console.error('List pending teachers error:', err);
            res.status(500).json({ error: 'Failed to fetch pending teachers.' });
        }
    }
);

// ------------------------------------------------------------
// NEW: GET /api/auth/admin/teachers/approved
// Fetches all active/approved teachers so the admin can manage or revoke them
// ------------------------------------------------------------
router.get(
    '/admin/teachers/approved',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, full_name, email, approved_at
                 FROM users WHERE role = 'teacher' AND status = 'approved'
                 ORDER BY approved_at DESC`
            );
            res.json(rows);
        } catch (err) {
            console.error('List approved teachers error:', err);
            res.status(500).json({ error: 'Failed to fetch approved teachers.' });
        }
    }
);

// POST /api/auth/admin/teachers/:teacherId/approve
router.post(
    '/admin/teachers/:teacherId/approve',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `UPDATE users
                 SET status = 'approved', approved_by = $1, approved_at = now()
                 WHERE id = $2 AND role = 'teacher' AND status IN ('pending', 'rejected')
                 RETURNING id, full_name, email, status`,
                [req.user.id, req.params.teacherId]
            );
            // Note: the enforce_approval_chain trigger from schema.sql double-checks
            // that req.user.id actually belongs to an admin — this query would fail
            // at the DB level even if the requireRole check above were ever bypassed.
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Pending or rejected teacher not found.' });
            }
            res.json({ message: 'Teacher approved.', user: rows[0] });
        } catch (err) {
            console.error('Approve teacher error:', err);
            res.status(500).json({ error: 'Failed to approve teacher.' });
        }
    }
);

// POST /api/auth/admin/teachers/:teacherId/reject
router.post(
    '/admin/teachers/:teacherId/reject',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `UPDATE users SET status = 'rejected'
                 WHERE id = $1 AND role = 'teacher' AND status = 'pending'
                 RETURNING id, full_name, email, status`,
                [req.params.teacherId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Pending teacher not found.' });
            }
            res.json({ message: 'Teacher application rejected.', user: rows[0] });
        } catch (err) {
            console.error('Reject teacher error:', err);
            res.status(500).json({ error: 'Failed to reject teacher.' });
        }
    }
);

// ------------------------------------------------------------
// NEW: POST /api/auth/admin/teachers/:teacherId/revoke
// Allows an admin to revoke access for an already approved teacher
// ------------------------------------------------------------
router.post(
    '/admin/teachers/:teacherId/revoke',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `UPDATE users SET status = 'pending'
                 WHERE id = $1 AND role = 'teacher'
                 RETURNING id, full_name, email, status`,
                [req.params.teacherId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Teacher not found.' });
            }
            res.json({ message: 'Teacher approval successfully revoked.', user: rows[0] });
        } catch (err) {
            console.error('Revoke teacher error:', err);
            res.status(500).json({ error: 'Failed to revoke teacher approval.' });
        }
    }
);

// ============================================================
// TEACHER -> STUDENT APPROVAL CHAIN
// Approval and class assignment happen together: a Teacher
// approves a Student directly into one of their own classes.
// ============================================================

// GET /api/auth/teacher/students/pending
// Shows all pending student applications platform-wide — any
// approved Teacher can review and claim one into their class.
router.get(
    '/teacher/students/pending',
    authenticateToken,
    requireRole('teacher'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, full_name, email, created_at
                 FROM users WHERE role = 'student' AND status = 'pending'
                 ORDER BY created_at ASC`
            );
            res.json(rows);
        } catch (err) {
            console.error('List pending students error:', err);
            res.status(500).json({ error: 'Failed to fetch pending students.' });
        }
    }
);

// ------------------------------------------------------------
// NEW: GET /api/auth/teacher/students/approved
// Fetches all approved students for the dashboard
// ------------------------------------------------------------
router.get(
    '/teacher/students/approved',
    authenticateToken,
    requireRole('teacher', 'admin'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, full_name, email FROM users 
                 WHERE role = 'student' AND status = 'approved'
                 ORDER BY full_name ASC`
            );
            res.json(rows);
        } catch (err) {
            console.error('Fetch approved students error:', err);
            res.status(500).json({ error: 'Failed to fetch approved students.' });
        }
    }
);

// POST /api/auth/teacher/students/:studentId/approve
// Body: { classId } — required. Approves the student's account
// AND creates their enrollment in one atomic transaction, so a
// student is never left "approved" without a class, or enrolled
// without an approved account.
router.post(
    '/teacher/students/:studentId/approve',
    authenticateToken,
    requireRole('teacher'),
    async (req, res) => {
        const { studentId } = req.params;
        const { classId } = req.body;

        if (!classId) {
            return res.status(400).json({ error: 'classId is required to approve and assign a student.' });
        }

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Ownership check: this teacher must own the class they're assigning into.
            const { rows: classRows } = await client.query(
                'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
                [classId, req.user.id]
            );
            if (classRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'You do not own this class.' });
            }

            const { rows: studentRows } = await client.query(
                `UPDATE users
                 SET status = 'approved', approved_by = $1, approved_at = now()
                 WHERE id = $2 AND role = 'student' AND status = 'pending'
                 RETURNING id, full_name, email, status`,
                [req.user.id, studentId]
            );
            if (studentRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Pending student not found.' });
            }

            await client.query(
                `INSERT INTO enrollments (student_id, class_id, status, assigned_by)
                 VALUES ($1, $2, 'approved', $3)`,
                [studentId, classId, req.user.id]
            );

            await client.query('COMMIT');
            res.json({ message: 'Student approved and assigned to class.', user: studentRows[0], classId });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Approve student error:', err);
            res.status(500).json({ error: 'Failed to approve student.' });
        } finally {
            client.release();
        }
    }
);

// POST /api/auth/teacher/students/:studentId/reject
router.post(
    '/teacher/students/:studentId/reject',
    authenticateToken,
    requireRole('teacher'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `UPDATE users SET status = 'rejected'
                 WHERE id = $1 AND role = 'student' AND status = 'pending'
                 RETURNING id, full_name, email, status`,
                [req.params.studentId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Pending student not found.' });
            }
            res.json({ message: 'Student application rejected.', user: rows[0] });
        } catch (err) {
            console.error('Reject student error:', err);
            res.status(500).json({ error: 'Failed to reject student.' });
        }
    }
);

// ------------------------------------------------------------
// NEW: POST /api/auth/teacher/students/:studentId/revoke
// Moves an approved student back to the pending list and removes their class access
// ------------------------------------------------------------
router.post(
    '/teacher/students/:studentId/revoke',
    authenticateToken,
    requireRole('teacher'),
    async (req, res) => {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // 1. Change user status back to pending
            const { rows } = await client.query(
                `UPDATE users SET status = 'pending', approved_by = NULL, approved_at = NULL
                 WHERE id = $1 AND role = 'student' AND status = 'approved'
                 RETURNING id, full_name, email, status`,
                [req.params.studentId]
            );

            if (rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Approved student not found.' });
            }

            // 2. Delete their class enrollment so they lose access to chapter materials
            await client.query(
                'DELETE FROM enrollments WHERE student_id = $1',
                [req.params.studentId]
            );

            await client.query('COMMIT');
            res.json({ message: 'Approval revoked. Student moved back to pending list.' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Revoke student error:', err);
            res.status(500).json({ error: 'Failed to revoke student.' });
        } finally {
            client.release();
        }
    }
);

module.exports = router;