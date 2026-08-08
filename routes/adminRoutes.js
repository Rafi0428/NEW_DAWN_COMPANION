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
            // 1. Verify the user exists and is actually a teacher
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

            // 2. Update the teacher's status to 'revoked'
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

// 1. ADD A NEW TEACHER TO LANDING PAGE
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

// 2. REMOVE A TEACHER FROM LANDING PAGE
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

// 3. ADD A NEW TOPPER
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

// 4. REMOVE A TOPPER
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

// 5. UPDATE CONTACT & LOCATION SETTINGS
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
module.exports = router;