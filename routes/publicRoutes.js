const express = require('express');
const router = express.Router();
const db = require('../db/pool'); // Matches your existing database connection

// ==========================================
// PUBLIC GET ROUTE: Fetch all landing page data
// ==========================================
router.get('/public/landing-data', async (req, res) => {
    try {
        const teachers = await db.query('SELECT * FROM landing_teachers ORDER BY display_order ASC');
        const toppers = await db.query('SELECT * FROM landing_toppers ORDER BY batch_year DESC, percentage DESC');
        const settings = await db.query('SELECT * FROM landing_settings WHERE id = 1');
        const faqs = await db.query('SELECT * FROM landing_faqs ORDER BY display_order ASC');
        const pricing = await db.query('SELECT * FROM landing_pricing ORDER BY display_order ASC'); // <-- NEW

        res.json({
            teachers: teachers.rows,
            toppers: toppers.rows,
            settings: settings.rows[0] || {},
            faqs: faqs.rows,
            pricing: pricing.rows // <-- NEW
        });
    } catch (err) {
        // This will now expose the exact PostgreSQL error in your Vercel logs and browser console!
        console.error('Landing page data fetch error:', err); 
        res.status(500).json({ error: "Failed to load website data.", details: err.message });
    }
});

module.exports = router;