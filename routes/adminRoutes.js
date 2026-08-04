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