require('dotenv').config();
const db = require('./db/pool');

async function createFaqTable() {
    try {
        console.log("Connecting to database to create FAQ table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS landing_faqs (
                id SERIAL PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ FAQ Table created successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating table:", err);
        process.exit(1);
    }
}
createFaqTable();