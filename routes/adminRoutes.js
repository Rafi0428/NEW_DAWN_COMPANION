const express = require('express');
const router = express.Router();
const db = require('../db/pool'); 
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// ============================================================
// ADMIN ACTIONS (APP)
// ============================================================
router.put(
    '/admin/teachers/:teacherId/revoke', 
    authenticateToken, 
    requireRole('admin'), 
    async (req, res) => {
        try {
            const userCheck = await db.query('SELECT id, role FROM users WHERE id = $1', [req.params.teacherId]);
            if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
            if (userCheck.rows[0].role !== 'teacher') return res.status(403).json({ error: 'Admins can only revoke approvals for teachers.' });

            await db.query(`UPDATE users SET status = 'revoked' WHERE id = $1`, [req.params.teacherId]);
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

// --- TEACHERS ---
router.get('/admin/landing/teachers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM landing_teachers ORDER BY display_order ASC, id ASC');
        res.status(200).json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch teachers.' }); }
});

router.post('/admin/landing/teachers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, role, display_order, image_url } = req.body;
        const result = await db.query(
            'INSERT INTO landing_teachers (name, role, display_order, image_url) VALUES ($1, $2, $3, $4) RETURNING *;',
            [name, role, display_order || 0, image_url || null]
        );
        res.status(201).json({ message: "Teacher added!", teacher: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to add teacher.' }); }
});

router.put('/admin/landing/teachers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, role, display_order, image_url } = req.body;
        const result = await db.query(
            'UPDATE landing_teachers SET name = $1, role = $2, display_order = $3, image_url = $4 WHERE id = $5 RETURNING *;',
            [name, role, display_order || 0, image_url || null, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found.' });
        res.status(200).json({ message: 'Teacher updated!', teacher: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to update teacher.' }); }
});

router.delete('/admin/landing/teachers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await db.query('DELETE FROM landing_teachers WHERE id = $1', [req.params.id]);
        res.json({ message: 'Teacher removed.' });
    } catch (err) { res.status(500).json({ error: 'Failed to remove teacher.' }); }
});

// --- TOPPERS ---
router.get('/admin/landing/toppers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM landing_toppers ORDER BY batch_year DESC, percentage DESC');
        res.status(200).json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch toppers.' }); }
});

router.post('/admin/landing/toppers', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, percentage, batch_year, image_url } = req.body;
        const result = await db.query(
            'INSERT INTO landing_toppers (name, percentage, batch_year, image_url) VALUES ($1, $2, $3, $4) RETURNING *;',
            [name, percentage, batch_year, image_url || null]
        );
        res.status(201).json({ message: "Topper added!", topper: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to add topper.' }); }
});

router.put('/admin/landing/toppers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, percentage, batch_year, image_url } = req.body;
        const result = await db.query(
            'UPDATE landing_toppers SET name = $1, percentage = $2, batch_year = $3, image_url = $4 WHERE id = $5 RETURNING *;',
            [name, percentage, batch_year, image_url || null, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Topper not found.' });
        res.status(200).json({ message: 'Topper updated!', topper: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to update topper.' }); }
});

router.delete('/admin/landing/toppers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await db.query('DELETE FROM landing_toppers WHERE id = $1', [req.params.id]);
        res.json({ message: 'Topper removed.' });
    } catch (err) { res.status(500).json({ error: 'Failed to remove topper.' }); }
});

// --- FAQS ---
router.get('/admin/landing/faqs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM landing_faqs ORDER BY display_order ASC, id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch FAQs.' }); }
});

router.post('/admin/landing/faqs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { question, answer, display_order } = req.body;
        const result = await db.query(
            'INSERT INTO landing_faqs (question, answer, display_order) VALUES ($1, $2, $3) RETURNING *',
            [question, answer, display_order || 0]
        );
        res.status(201).json({ message: "FAQ added!", faq: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to add FAQ.' }); }
});

router.put('/admin/landing/faqs/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { question, answer, display_order } = req.body;
        const result = await db.query(
            'UPDATE landing_faqs SET question = $1, answer = $2, display_order = $3 WHERE id = $4 RETURNING *',
            [question, answer, display_order || 0, req.params.id]
        );
        res.json({ message: 'FAQ updated!', faq: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to update FAQ.' }); }
});

router.delete('/admin/landing/faqs/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await db.query('DELETE FROM landing_faqs WHERE id = $1', [req.params.id]);
        res.json({ message: 'FAQ deleted.' });
    } catch (err) { res.status(500).json({ error: 'Failed to delete FAQ.' }); }
});

// --- PRICING ---
router.get('/admin/landing/pricing', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM landing_pricing ORDER BY display_order ASC, id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch pricing.' }); }
});

router.post('/admin/landing/pricing', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { plan_name, price, duration, features, is_highlighted, display_order } = req.body;
        const result = await db.query(
            'INSERT INTO landing_pricing (plan_name, price, duration, features, is_highlighted, display_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [plan_name, price, duration, features, is_highlighted || false, display_order || 0]
        );
        res.status(201).json({ message: "Plan added!", plan: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to add plan.' }); }
});

router.put('/admin/landing/pricing/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { plan_name, price, duration, features, is_highlighted, display_order } = req.body;
        const result = await db.query(
            'UPDATE landing_pricing SET plan_name = $1, price = $2, duration = $3, features = $4, is_highlighted = $5, display_order = $6 WHERE id = $7 RETURNING *',
            [plan_name, price, duration, features, is_highlighted || false, display_order || 0, req.params.id]
        );
        res.json({ message: 'Plan updated!', plan: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to update plan.' }); }
});

router.delete('/admin/landing/pricing/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await db.query('DELETE FROM landing_pricing WHERE id = $1', [req.params.id]);
        res.json({ message: 'Plan deleted.' });
    } catch (err) { res.status(500).json({ error: 'Failed to delete plan.' }); }
});

// --- SETTINGS ---
router.put('/admin/landing/settings', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { 
            owner_name, owner_email, owner_github, owner_linkedin, 
            educator_name, educator_whatsapp, educator_email, location_url, map_embed_url 
        } = req.body;

        const query = `
            UPDATE landing_settings
            SET owner_name = $1, owner_email = $2, owner_github = $3, owner_linkedin = $4, 
                educator_name = $5, educator_whatsapp = $6, educator_email = $7, location_url = $8, 
                map_embed_url = $9, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            RETURNING *;
        `;
        const values = [
            owner_name, owner_email, owner_github, owner_linkedin, 
            educator_name, educator_whatsapp, educator_email, location_url, map_embed_url
        ];
        
        const result = await db.query(query, values);
        res.json({ message: "Landing page settings updated!", settings: result.rows[0] });
    } catch (err) {
        console.error('Update landing settings error:', err);
        res.status(500).json({ error: 'Failed to update landing page settings.' });
    }
});

module.exports = router;