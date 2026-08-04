const db = require('./db/pool');

async function upgradeDatabase() {
    try {
        console.log("Dropping the old restricted table...");
        await db.query(`DROP TABLE IF EXISTS study_materials CASCADE;`);

        console.log("Creating the new multi-file table...");
        // Updated data types to UUID to match your database architecture
        await db.query(`
            CREATE TABLE study_materials (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                content TEXT,
                created_by UUID,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Success! Your database is now ready for multiple files.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error updating database:", err);
        process.exit(1);
    }
}

upgradeDatabase();