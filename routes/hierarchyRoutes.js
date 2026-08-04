// ============================================================
// routes/hierarchyRoutes.js
// CRUD for Classes, Semesters, and Subjects — the hierarchy levels
// above Chapters (which live in chapterRoutes.js).
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../db/pool');

const { authenticateToken } = require('../middleware/auth');
const { requireRole, authorizeClassAccess } = require('../middleware/rbac');

// ============================================================
// CLASSES
// ============================================================

// CREATE — POST /api/classes
router.post(
    '/classes',
    authenticateToken,
    requireRole('teacher'),
    async (req, res) => {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Class name is required.' });
        }

        // Generate a random 6-character uppercase alphanumeric code
        const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        try {
            const { rows } = await db.query(
                `INSERT INTO classes (name, description, teacher_id, join_code)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, name, description, teacher_id, join_code, created_at`,
                [name.trim(), description || null, req.user.id, joinCode]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            console.error('Create class error:', err);
            res.status(500).json({ error: 'Failed to create class.' });
        }
    }
);

// READ (list) — GET /api/classes
router.get(
    '/classes',
    authenticateToken,
    requireRole('admin', 'teacher', 'student'),
    async (req, res) => {
        try {
            let query, params;

            if (req.user.role === 'admin') {
                // Admins see all classes and their join codes
                query = `SELECT id, name, description, teacher_id, join_code, created_at FROM classes ORDER BY created_at DESC`;
                params = [];
            } else if (req.user.role === 'teacher') {
                // Teachers see their classes and their join codes
                query = `SELECT id, name, description, teacher_id, join_code, created_at
                          FROM classes WHERE teacher_id = $1 ORDER BY created_at DESC`;
                params = [req.user.id];
            } else {
                // Students see the classes they are enrolled in
                query = `SELECT c.id, c.name, c.description, c.teacher_id, c.created_at
                          FROM classes c
                          JOIN enrollments e ON e.class_id = c.id
                          WHERE e.student_id = $1 AND e.status = 'approved'
                          ORDER BY c.created_at DESC`;
                params = [req.user.id];
            }

            const { rows } = await db.query(query, params);
            res.json(rows);
        } catch (err) {
            console.error('List classes error:', err);
            res.status(500).json({ error: 'Failed to fetch classes.' });
        }
    }
);

// READ (single) — GET /api/classes/:classId
router.get(
    '/classes/:classId',
    authenticateToken,
    requireRole('admin', 'teacher', 'student'),
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, name, description, teacher_id, join_code, created_at FROM classes WHERE id = $1`,
                [req.params.classId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Class not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error('Get class error:', err);
            res.status(500).json({ error: 'Failed to fetch class.' });
        }
    }
);

// UPDATE — PUT /api/classes/:classId
router.put(
    '/classes/:classId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    authorizeClassAccess,
    async (req, res) => {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Class name is required.' });
        }

        try {
            const { rows } = await db.query(
                `UPDATE classes SET name = $1, description = $2 WHERE id = $3
                 RETURNING id, name, description, teacher_id, join_code, created_at`,
                [name.trim(), description || null, req.params.classId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Class not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error('Update class error:', err);
            res.status(500).json({ error: 'Failed to update class.' });
        }
    }
);

// DELETE — DELETE /api/classes/:classId
router.delete(
    '/classes/:classId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rowCount } = await db.query('DELETE FROM classes WHERE id = $1', [req.params.classId]);
            if (rowCount === 0) {
                return res.status(404).json({ error: 'Class not found.' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Delete class error:', err);
            res.status(500).json({ error: 'Failed to delete class.' });
        }
    }
);


// ============================================================
// SEMESTERS (NEW LAYER)
// ============================================================

// CREATE — POST /api/classes/:classId/semesters
router.post(
    '/classes/:classId/semesters',
    authenticateToken,
    requireRole('teacher', 'admin'),
    authorizeClassAccess,
    async (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Semester name is required.' });
        }

        try {
            const { rows } = await db.query(
                `INSERT INTO semesters (class_id, name)
                 VALUES ($1, $2)
                 RETURNING *`,
                [req.params.classId, name.trim()]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            console.error('Create semester error:', err);
            res.status(500).json({ error: 'Failed to create semester.' });
        }
    }
);

// READ (list) — GET /api/classes/:classId/semesters
router.get(
    '/classes/:classId/semesters',
    authenticateToken,
    requireRole('admin', 'teacher', 'student'),
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT * FROM semesters WHERE class_id = $1 ORDER BY created_at ASC`,
                [req.params.classId]
            );
            res.json(rows);
        } catch (err) {
            console.error('List semesters error:', err);
            res.status(500).json({ error: 'Failed to fetch semesters.' });
        }
    }
);

// DELETE — DELETE /api/semesters/:semesterId
router.delete(
    '/semesters/:semesterId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    async (req, res) => {
        try {
            const { rowCount } = await db.query('DELETE FROM semesters WHERE id = $1', [req.params.semesterId]);
            if (rowCount === 0) {
                return res.status(404).json({ error: 'Semester not found.' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Delete semester error:', err);
            res.status(500).json({ error: 'Failed to delete semester.' });
        }
    }
);


// ============================================================
// SUBJECTS
// ============================================================

// CREATE — POST /api/semesters/:semesterId/subjects
router.post(
    '/semesters/:semesterId/subjects',
    authenticateToken,
    requireRole('teacher', 'admin'),
    async (req, res) => {
        const { name, description } = req.body;
        const classId = req.query.classId;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Subject name is required.' });
        }
        if (!classId) {
            return res.status(400).json({ error: 'classId query parameter is required.' });
        }

        try {
            const { rows: classCheck } = await db.query(
                `SELECT c.id FROM classes c 
                 JOIN semesters s ON s.class_id = c.id 
                 WHERE s.id = $1 AND c.teacher_id = $2`,
                [req.params.semesterId, req.user.id]
            );

            if (classCheck.length === 0 && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Unauthorized access to this semester.' });
            }

            const { rows } = await db.query(
                `INSERT INTO subjects (class_id, semester_id, name, description, created_by)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, class_id, semester_id, name, description, created_at`,
                [classId, req.params.semesterId, name.trim(), description || null, req.user.id]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') { 
                return res.status(409).json({ error: 'A subject with this name already exists in this semester.' });
            }
            console.error('Create subject error:', err);
            res.status(500).json({ error: 'Failed to create subject.' });
        }
    }
);

// READ (list) — GET /api/semesters/:semesterId/subjects
router.get(
    '/semesters/:semesterId/subjects',
    authenticateToken,
    requireRole('admin', 'teacher', 'student'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, class_id, semester_id, name, description, created_at, updated_at
                 FROM subjects WHERE semester_id = $1 ORDER BY created_at ASC`,
                [req.params.semesterId]
            );
            res.json(rows);
        } catch (err) {
            console.error('List subjects error:', err);
            res.status(500).json({ error: 'Failed to fetch subjects.' });
        }
    }
);

// READ (single) — GET /api/subjects/:subjectId
router.get(
    '/subjects/:subjectId',
    authenticateToken,
    requireRole('admin', 'teacher', 'student'),
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, class_id, semester_id, name, description, created_at, updated_at
                 FROM subjects WHERE id = $1`,
                [req.params.subjectId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Subject not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error('Get subject error:', err);
            res.status(500).json({ error: 'Failed to fetch subject.' });
        }
    }
);

// UPDATE — PUT /api/subjects/:subjectId
router.put(
    '/subjects/:subjectId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    async (req, res) => {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Subject name is required.' });
        }

        try {
            const { rows } = await db.query(
                `UPDATE subjects SET name = $1, description = $2 WHERE id = $3
                 RETURNING id, class_id, semester_id, name, description, updated_at`,
                [name.trim(), description || null, req.params.subjectId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Subject not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'A subject with this name already exists in this semester.' });
            }
            console.error('Update subject error:', err);
            res.status(500).json({ error: 'Failed to update subject.' });
        }
    }
);

// DELETE — DELETE /api/subjects/:subjectId
router.delete(
    '/subjects/:subjectId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    async (req, res) => {
        try {
            const { rowCount } = await db.query('DELETE FROM subjects WHERE id = $1', [req.params.subjectId]);
            if (rowCount === 0) {
                return res.status(404).json({ error: 'Subject not found.' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Delete subject error:', err);
            res.status(500).json({ error: 'Failed to delete subject.' });
        }
    }
);

// ------------------------------------------------------------
// GET /api/classes/:classId/gradebook
// Fetches all student quiz attempts for a specific class
// ------------------------------------------------------------
router.get('/classes/:classId/gradebook', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const classId = req.params.classId;

        const query = `
            SELECT 
                qa.id AS attempt_id,
                u.full_name AS student_name,
                u.email AS student_email,
                'Practice Quiz' AS quiz_title, 
                qa.score,
                10 AS total_questions, 
                CURRENT_TIMESTAMP AS submitted_at
            FROM quiz_attempts qa
            JOIN users u ON qa.student_id = u.id
            JOIN quizzes q ON qa.quiz_id = q.id
            JOIN chapters c ON q.chapter_id = c.id
            JOIN subjects sub ON c.subject_id = sub.id
            JOIN semesters sem ON sub.semester_id = sem.id
            WHERE sem.class_id = $1
            ORDER BY qa.id DESC
        `;

        const { rows } = await db.query(query, [classId]);
        
        res.json(rows);
    } catch (err) {
        console.error('Fetch gradebook error:', err);
        res.status(500).json({ error: 'Failed to load gradebook data.' });
    }
});


// ============================================================
// ENROLLMENTS - SELF JOIN (NEW ROUTE)
// ============================================================

// JOIN — POST /api/enrollments/join
router.post('/enrollments/join', authenticateToken, requireRole('student'), async (req, res) => {
    const { joinCode } = req.body;

    if (!joinCode) {
        return res.status(400).json({ error: 'Join code is required.' });
    }

    try {
        // 1. Find the class by its join code
        const classResult = await db.query('SELECT id, name FROM classes WHERE join_code = $1', [joinCode.toUpperCase()]);
        
        if (classResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid join code. Class not found.' });
        }
        
        const classId = classResult.rows[0].id;

        // 2. Check if the student is already enrolled to prevent duplicates
        const checkEnrollment = await db.query(
            'SELECT * FROM enrollments WHERE student_id = $1 AND class_id = $2',
            [req.user.id, classId]
        );

        if (checkEnrollment.rows.length > 0) {
            return res.status(400).json({ error: 'You are already enrolled in this class.' });
        }

        // 3. Enroll the student (Auto-approved for seamless access)
        await db.query(
            `INSERT INTO enrollments (student_id, class_id, status) VALUES ($1, $2, 'approved')`,
            [req.user.id, classId]
        );

        res.status(200).json({ message: `Successfully joined ${classResult.rows[0].name}!` });

    } catch (err) {
        console.error('Join class error:', err);
        res.status(500).json({ error: 'Failed to join class.' });
    }
});


// THIS MUST BE THE VERY LAST LINE IN THE FILE!
module.exports = router;