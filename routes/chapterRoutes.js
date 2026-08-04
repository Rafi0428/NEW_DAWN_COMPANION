// ============================================================
// routes/chapters.js
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const multer = require('multer'); 
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { authenticateToken } = require('../middleware/auth');
const { requireRole, authorizeClassAccess } = require('../middleware/rbac');
const { resolveClassFromSubject, resolveClassFromChapter } = require('../middleware/hierarchy');

// 1. Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Set up the Cloudinary Storage Engine for Multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'new_dawn_companion/study_materials',
        resource_type: 'auto', // <--- THIS MUST BE 'auto'
        public_id: (req, file) => {
            const cleanName = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
            return `${Date.now()}_${cleanName}`;
        }
    },
});

const upload = multer({ storage: storage });

// ------------------------------------------------------------
// CREATE — POST /api/subjects/:subjectId/chapters
// ------------------------------------------------------------
router.post(
    '/subjects/:subjectId/chapters',
    authenticateToken,
    requireRole('teacher', 'admin'),
    resolveClassFromSubject,
    authorizeClassAccess,
    async (req, res) => {
        const { subjectId } = req.params;
        const { title, content_body, sequence_order } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Chapter title is required.' });
        }

        try {
            const { rows } = await db.query(
                `INSERT INTO chapters (subject_id, title, content_body, sequence_order, created_by)
                 VALUES ($1, $2, $3, COALESCE($4, 0), $5)
                 RETURNING id, subject_id, title, content_body, sequence_order, created_at`,
                [subjectId, title.trim(), content_body || null, sequence_order, req.user.id]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            console.error('Create chapter error:', err);
            res.status(500).json({ error: 'Failed to create chapter.' });
        }
    }
);

// ------------------------------------------------------------
// READ (list) — GET /api/subjects/:subjectId/chapters
// ------------------------------------------------------------
router.get(
    '/subjects/:subjectId/chapters',
    authenticateToken,
    requireRole('teacher', 'admin', 'student'),
    resolveClassFromSubject,
    authorizeClassAccess, 
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, subject_id, title, content_body, sequence_order, created_at, updated_at
                 FROM chapters
                 WHERE subject_id = $1
                 ORDER BY sequence_order ASC`,
                [req.params.subjectId]
            );
            res.json(rows);
        } catch (err) {
            console.error('List chapters error:', err);
            res.status(500).json({ error: 'Failed to fetch chapters.' });
        }
    }
);

// ------------------------------------------------------------
// READ (single) — GET /api/chapters/:chapterId
// ------------------------------------------------------------
router.get(
    '/chapters/:chapterId',
    authenticateToken,
    requireRole('teacher', 'admin', 'student'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, subject_id, title, content_body, sequence_order, created_at, updated_at
                 FROM chapters WHERE id = $1`,
                [req.params.chapterId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Chapter not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error('Get chapter error:', err);
            res.status(500).json({ error: 'Failed to fetch chapter.' });
        }
    }
);

// ------------------------------------------------------------
// UPDATE — PUT /api/chapters/:chapterId
// ------------------------------------------------------------
router.put(
    '/chapters/:chapterId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        const { title, content_body, sequence_order } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Chapter title is required.' });
        }

        try {
            const { rows } = await db.query(
                `UPDATE chapters
                 SET title = $1, content_body = $2, sequence_order = COALESCE($3, sequence_order)
                 WHERE id = $4
                 RETURNING id, subject_id, title, content_body, sequence_order, updated_at`,
                [title.trim(), content_body || null, sequence_order, req.params.chapterId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Chapter not found.' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error('Update chapter error:', err);
            res.status(500).json({ error: 'Failed to update chapter.' });
        }
    }
);

// ------------------------------------------------------------
// DELETE — DELETE /api/chapters/:chapterId
// ------------------------------------------------------------
router.delete(
    '/chapters/:chapterId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rowCount } = await db.query(
                'DELETE FROM chapters WHERE id = $1',
                [req.params.chapterId]
            );
            if (rowCount === 0) {
                return res.status(404).json({ error: 'Chapter not found.' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Delete chapter error:', err);
            res.status(500).json({ error: 'Failed to delete chapter.' });
        }
    }
);

// ============================================================
// STUDY MATERIAL (MULTI-FILE CLOUD ARCHITECTURE)
// ============================================================

// READ — GET /api/chapters/:chapterId/study-material
router.get(
    '/chapters/:chapterId/study-material',
    authenticateToken,
    requireRole('teacher', 'admin', 'student'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rows } = await db.query(
                `SELECT id, chapter_id, title, content, created_at, updated_at
                 FROM study_materials WHERE chapter_id = $1
                 ORDER BY created_at ASC`,
                [req.params.chapterId]
            );
            res.json(rows);
        } catch (err) {
            console.error('Get study material error:', err);
            res.status(500).json({ error: 'Failed to fetch study material.' });
        }
    }
);

// CREATE — POST /api/chapters/:chapterId/study-material
// Uploads directly to Cloudinary and saves secure URL to database
router.post(
    '/chapters/:chapterId/study-material',
    authenticateToken,
    requireRole('teacher', 'admin'),
    resolveClassFromChapter,
    authorizeClassAccess,
    upload.array('material_files', 10), // Limit to 10 files per batch
    async (req, res) => {
        if (!req.files || req.files.length === 0) {
             return res.status(400).json({ error: 'Please upload at least one file.' });
        }

        try {
            const insertedMaterials = [];
            
            // Loop through the uploaded files and save the Cloudinary URL to the database
            for (const file of req.files) {
                const cloudUrl = file.path; // This is the secure URL generated by Cloudinary
                
                const { rows } = await db.query(
                    `INSERT INTO study_materials (chapter_id, title, content, created_by)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id, chapter_id, title, content, created_at`,
                    [req.params.chapterId, file.originalname, cloudUrl, req.user.id]
                );
                insertedMaterials.push(rows[0]);
            }
            
            res.status(201).json(insertedMaterials);
        } catch (err) {
            console.error('Create study material error:', err);
            res.status(500).json({ error: 'Failed to save files securely to the cloud.' });
        }
    }
);

// DELETE — DELETE /api/chapters/:chapterId/study-material/:materialId
router.delete(
    '/chapters/:chapterId/study-material/:materialId',
    authenticateToken,
    requireRole('teacher', 'admin'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        try {
            const { rowCount } = await db.query(
                'DELETE FROM study_materials WHERE id = $1 AND chapter_id = $2',
                [req.params.materialId, req.params.chapterId]
            );
            if (rowCount === 0) {
                return res.status(404).json({ error: 'File not found.' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Delete study material error:', err);
            res.status(500).json({ error: 'Failed to delete file.' });
        }
    }
);

module.exports = router;