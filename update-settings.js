require('dotenv').config();
const db = require('./db/pool');

async function updateSettingsTable() {
    try {
        console.log("Adding name columns to settings table...");
        await db.query(`ALTER TABLE landing_settings ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);`);
        await db.query(`ALTER TABLE landing_settings ADD COLUMN IF NOT EXISTS educator_name VARCHAR(255);`);
        
        console.log("✅ Settings table successfully updated!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error updating table:", err);
        process.exit(1);
    }
}
updateSettingsTable();