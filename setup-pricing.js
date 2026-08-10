require('dotenv').config();
const db = require('./db/pool');

async function createPricingTable() {
    try {
        console.log("Creating Pricing table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS landing_pricing (
                id SERIAL PRIMARY KEY,
                plan_name VARCHAR(255) NOT NULL,
                price VARCHAR(100) NOT NULL,
                duration VARCHAR(100),
                features TEXT,
                is_highlighted BOOLEAN DEFAULT false,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Pricing Table created successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating table:", err);
        process.exit(1);
    }
}
createPricingTable();