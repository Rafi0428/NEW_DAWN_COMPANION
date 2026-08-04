const bcrypt = require('bcrypt');
const db = require('./db/pool');

async function setupPermanentAdmin() {
    const email = 'mdrafiahmed0137@gmail.com';
    const password = 'Rafi@0428';
    const fullName = 'Muhammad Rafi Ahmed';
    const role = 'admin';

    try {
        console.log('Starting admin configuration...');
        
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (rows.length > 0) {
            console.log(`Account ${email} already exists!`);
            console.log('Updating password and ensuring top-level admin permissions...');
            
            // Fixed: Changed "password" to "password_hash"
            await db.query(
                `UPDATE users SET password_hash = $1, role = $2, full_name = $3 WHERE email = $4`,
                [hashedPassword, role, fullName, email]
            );
            console.log('✅ Admin credentials successfully updated!');
        } else {
            console.log(`Account ${email} not found.`);
            console.log('Creating a brand new permanent admin account...');
            
            // Fixed: Changed "password" to "password_hash"
            await db.query(
                `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
                [fullName, email, hashedPassword, role]
            );
            console.log('✅ Permanent admin account successfully created!');
        }
    } catch (error) {
        console.error('❌ Error setting up admin:', error);
    } finally {
        process.exit();
    }
}

setupPermanentAdmin();