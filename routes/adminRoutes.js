const express = require('express');
const router = express.Router();
const db = require('../db/pool'); 
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// ============================================================
// ADMIN ACTIONS
// ============================================================

// UPDATE — PUT /api/admin/teachers/:teacherId/revoke
router.put(
    '/admin/teachers/:teacherId/revoke', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const userCheck = await db.query(
                'SELECT id, role FROM users WHERE id = $1', 
                [req.params.teacherId]
            );

            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'User not found.' });
            }

            if (userCheck.rows[0].role !== 'teacher') {
                return res.status(403).json({ error: 'Admins can only revoke approvals for teachers.' });
            }

            await db.query(
                `UPDATE users SET status = 'revoked' WHERE id = $1`, 
                [req.params.teacherId]
            );

            res.status(200).json({ message: 'Teacher approval successfully revoked.' });
            
        } catch (err) {
            console.error('Revoke teacher error:', err);
            res.status(500).json({ error: 'Failed to revoke teacher approval.' });
        }
    }
);

// ============================================================
// LANDING PAGE CMS ROUTES
// ============================================================

// 1. GET ALL LANDING TEACHERS (For Admin Dashboard List)
router.get(
    '/admin/landing/teachers',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM landing_teachers ORDER BY display_order ASC, id ASC');
            res.status(200).json(result.rows);
        } catch (err) {
            console.error('Fetch landing teachers error:', err);
            res.status(500).json({ error: 'Failed to fetch teachers.' });
        }
    }
);

// 2. ADD A NEW TEACHER TO LANDING PAGE
router.post(
    '/admin/landing/teachers', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const { name, role, display_order, image_url } = req.body;
            
            const query = `
                INSERT INTO landing_teachers (name, role, display_order, image_url)
                VALUES ($1, $2, $3, $4) RETURNING *;
            `;
            const values = [name, role, display_order || 0, image_url || null];
            
            const result = await db.query(query, values);
            res.status(201).json({ message: "Teacher added to landing page!", teacher: result.rows[0] });
        } catch (err) {
            console.error('Add landing teacher error:', err);
            res.status(500).json({ error: 'Failed to add teacher to landing page.' });
        }
    }
);

// 3. EDIT / UPDATE A TEACHER
router.put(
    '/admin/landing/teachers/:id',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, role, display_order, image_url } = req.body;

            const query = `
                UPDATE landing_teachers
                SET name = $1, role = $2, display_order = $3, image_url = $4
                WHERE id = $5
                RETURNING *;
            `;
            const values = [name, role, display_order || 0, image_url || null, id];

            const result = await db.query(query, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Teacher record not found.' });
            }

            res.status(200).json({ message: 'Teacher updated successfully!', teacher: result.rows[0] });
        } catch (err) {
            console.error('Update landing teacher error:', err);
            res.status(500).json({ error: 'Failed to update teacher.' });
        }
    }
);

// 4. REMOVE A TEACHER FROM LANDING PAGE
router.delete(
    '/admin/landing/teachers/:id', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM landing_teachers WHERE id = $1', [id]);
            res.json({ message: 'Teacher removed from landing page.' });
        } catch (err) {
            console.error('Remove landing teacher error:', err);
            res.status(500).json({ error: 'Failed to remove teacher from landing page.' });
        }
    }
);

// 5. ADD A NEW TOPPER
router.post(
    '/admin/landing/toppers', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const { name, percentage, batch_year, image_url } = req.body;
            
            const query = `
                INSERT INTO landing_toppers (name, percentage, batch_year, image_url)
                VALUES ($1, $2, $3, $4) RETURNING *;
            `;
            const values = [name, percentage, batch_year, image_url || null];
            
            const result = await db.query(query, values);
            res.status(201).json({ message: "Topper added to landing page!", topper: result.rows[0] });
        } catch (err) {
            console.error('Add landing topper error:', err);
            res.status(500).json({ error: 'Failed to add topper to landing page.' });
        }
    }
);

// 6. REMOVE A TOPPER
router.delete(
    '/admin/landing/toppers/:id', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM landing_toppers WHERE id = $1', [id]);
            res.json({ message: 'Topper removed from landing page.' });
        } catch (err) {
            console.error('Remove landing topper error:', err);
            res.status(500).json({ error: 'Failed to remove topper from landing page.' });
        }
    }
);

// 7. UPDATE CONTACT & LOCATION SETTINGS
router.put(
    '/admin/landing/settings', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const { 
                owner_email, owner_github, owner_linkedin, 
                educator_whatsapp, educator_email, location_url, map_embed_url 
            } = req.body;

            const query = `
                UPDATE landing_settings
                SET owner_email = $1, owner_github = $2, owner_linkedin = $3, 
                    educator_whatsapp = $4, educator_email = $5, location_url = $6, 
                    map_embed_url = $7, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                RETURNING *;
            `;
            const values = [
                owner_email, owner_github, owner_linkedin, 
                educator_whatsapp, educator_email, location_url, map_embed_url
            ];
            
            const result = await db.query(query, values);
            res.json({ message: "Landing page settings updated!", settings: result.rows[0] });
        } catch (err) {
            console.error('Update landing settings error:', err);
            res.status(500).json({ error: 'Failed to update landing page settings.' });
        }
    }
);
// 5a. GET ALL TOPPERS (For Admin Dashboard List)
router.get(
    '/admin/landing/toppers',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM landing_toppers ORDER BY batch_year DESC, percentage DESC');
            res.status(200).json(result.rows);
        } catch (err) {
            console.error('Fetch landing toppers error:', err);
            res.status(500).json({ error: 'Failed to fetch toppers.' });
        }
    }
);

// 5b. EDIT / UPDATE A TOPPER
router.put(
    '/admin/landing/toppers/:id',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, percentage, batch_year, image_url } = req.body;

            const query = `
                UPDATE landing_toppers
                SET name = $1, percentage = $2, batch_year = $3, image_url = $4
                WHERE id = $5
                RETURNING *;
            `;
            const values = [name, percentage, batch_year, image_url || null, id];

            const result = await db.query(query, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Topper record not found.' });
            }

            res.status(200).json({ message: 'Topper updated successfully!', topper: result.rows[0] });
        } catch (err) {
            console.error('Update landing topper error:', err);
            res.status(500).json({ error: 'Failed to update topper.' });
        }
    }
);
// ============================================================
// FAQ CMS ROUTES
// ============================================================

// 1. GET ALL FAQS
router.get('/admin/landing/faqs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM landing_faqs ORDER BY display_order ASC, id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch FAQs.' });
    }
});

// 2. ADD A NEW FAQ
router.post('/admin/landing/faqs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { question, answer, display_order } = req.body;
        const result = await db.query(
            'INSERT INTO landing_faqs (question, answer, display_order) VALUES ($1, $2, $3) RETURNING *',
            [question, answer, display_order || 0]
        );
        res.status(201).json({ message: "FAQ added!", faq: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add FAQ.' });
    }
});

// 3. EDIT A FAQ
router.put('/admin/landing/faqs/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { question, answer, display_order } = req.body;
        const result = await db.query(
            'UPDATE landing_faqs SET question = $1, answer = $2, display_order = $3 WHERE id = $4 RETURNING *',
            [question, answer, display_order || 0, req.params.id]
        );
        res.json({ message: 'FAQ updated successfully!', faq: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update FAQ.' });
    }
});

// 4. DELETE A FAQ
router.delete('/admin/landing/faqs/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await db.query('DELETE FROM landing_faqs WHERE id = $1', [req.params.id]);
        res.json({ message: 'FAQ deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete FAQ.' });
    }
});
module.exports = router;