require('dotenv').config();
const db = require('./db/pool');

async function createTables() {
    try {
        console.log("Connecting to database to create CMS tables...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS landing_teachers (
                id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, role VARCHAR(255) NOT NULL, image_url TEXT, display_order INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS landing_toppers (
                id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, percentage DECIMAL(5,2) NOT NULL, batch_year INTEGER NOT NULL, image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS landing_settings (
                id SERIAL PRIMARY KEY, owner_email VARCHAR(255), owner_github VARCHAR(255), owner_linkedin VARCHAR(255), educator_whatsapp VARCHAR(50), educator_email VARCHAR(255), location_url TEXT, map_embed_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO landing_settings (id, owner_email, educator_whatsapp) 
            VALUES (1, 'mdrafiahmed0137@gmail.com', '+917998403188') ON CONFLICT (id) DO NOTHING;
        `);
        console.log("✅ CMS Tables created successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating tables:", err);
        process.exit(1);
    }
}
createTables();