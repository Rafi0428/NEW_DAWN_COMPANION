const express = require('express');
const router = express.Router();
const db = require('../db/pool'); // Matches your existing database connection

// ==========================================
// PUBLIC GET ROUTE: Fetch all landing page data
// ==========================================
router.get('/public/landing-data', async (req, res) => {
    try {
        // Fetch all data for the landing page
        const teachers = await db.query('SELECT * FROM landing_teachers ORDER BY display_order ASC');
        const toppers = await db.query('SELECT * FROM landing_toppers ORDER BY batch_year DESC, percentage DESC');
        const settings = await db.query('SELECT * FROM landing_settings WHERE id = 1');
        const faqs = await db.query('SELECT * FROM landing_faqs ORDER BY display_order ASC'); // <-- ADD THIS LINE

        res.json({
            teachers: teachers.rows,
            toppers: toppers.rows,
            settings: settings.rows[0] || {},
            faqs: faqs.rows // <-- ADD THIS LINE TO THE RESPONSE
        });
    } catch (err) {
        console.error("Error fetching public landing data:", err);
        res.status(500).json({ error: "Failed to load website data." });
    }
});
module.exports = router;