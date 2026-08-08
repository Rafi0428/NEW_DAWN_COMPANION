const express = require('express');
const router = express.Router();
const db = require('../db/pool'); // Matches your existing database connection

// ==========================================
// PUBLIC GET ROUTE: Fetch all landing page data
// ==========================================
router.get('/public/landing-data', async (req, res) => {
    try {
        // Fetch all three tables simultaneously
        const teachers = await db.query('SELECT * FROM landing_teachers ORDER BY display_order ASC');
        const toppers = await db.query('SELECT * FROM landing_toppers ORDER BY batch_year DESC, percentage DESC');
        const settings = await db.query('SELECT * FROM landing_settings WHERE id = 1');

        // Send it all back as one clean JSON object
        res.status(200).json({
            teachers: teachers.rows,
            toppers: toppers.rows,
            settings: settings.rows[0] || {}
        });
    } catch (err) {
        console.error('Error fetching public landing data:', err);
        res.status(500).json({ error: 'Failed to load website data.' });
    }
});

module.exports = router;