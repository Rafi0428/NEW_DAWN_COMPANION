// ============================================================
// middleware/auth.js
// Verifies the JWT on every request, does a LIVE database check 
// to ensure the user wasn't revoked, and attaches the payload.
// ============================================================

const jwt = require('jsonwebtoken');
const db = require('../db/pool'); // ADDED: We need the database to do a live check

const JWT_SECRET = process.env.JWT_SECRET; // never hardcode this

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Authentication token missing.' });
    }

    // Notice the 'async' added here so we can await the database
    jwt.verify(token, JWT_SECRET, async (err, payload) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }

        try {
            // 1. THE INSTANT LOCKOUT: Check the live database, not just the token!
            const userCheck = await db.query('SELECT role, status FROM users WHERE id = $1', [payload.id]);
            
            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'User no longer exists.' });
            }

            const liveUser = userCheck.rows[0];

            // 2. If the admin changed them to 'pending' or 'rejected', slam the door shut.
            if (liveUser.status !== 'approved') {
                return res.status(403).json({ error: 'Account access has been revoked or is pending.' });
            }

            // 3. STUDENT TEACHER-CHECK NOTE: 
            // If your students lose access when a teacher is revoked, it is likely because 
            // the student's dashboard API routes (like fetching their classes) are configured 
            // to check the teacher's status before sending the class data back. 

            req.user = {
                id: payload.id,
                role: liveUser.role,
            };

            next();
        } catch (dbErr) {
            console.error('Middleware Live Check Error:', dbErr);
            return res.status(500).json({ error: 'Database verification failed.' });
        }
    });
}

module.exports = { authenticateToken };