// ============================================================
// middleware/rbac.js
// Two layers of enforcement:
//   1. requireRole(...)      -> coarse: "is this user's role allowed here at all?"
//   2. authorizeClassAccess  -> fine-grained: "does THIS user have rights
//                                to THIS specific class_id?"
//
// The fine-grained check is what actually stops a Student from
// reading another class's data — it re-checks against the DB on
// every request rather than trusting anything in the JWT, because
// enrollment status can change after a token was issued.
// ============================================================

const db = require('../db/pool'); // your pg Pool instance

// ------------------------------------------------------------
// 1. Role gate — use on routes restricted to specific roles
//    e.g. router.post('/classes', authenticateToken, requireRole('admin','teacher'), handler)
// ------------------------------------------------------------
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }
        next();
    };
}

// ------------------------------------------------------------
// 2. Class-scoping gate — use on any route that reads/writes
//    data tied to a :classId param (e.g. /classes/:classId/assignments)
//
//    Rules:
//      - Admin        -> always allowed (full oversight)
//      - Teacher      -> allowed only if they own the class
//      - Student      -> allowed only if they have an APPROVED
//                        enrollment in that exact class
//      - anyone else  -> 403, no exceptions, fail closed
// ------------------------------------------------------------
async function authorizeClassAccess(req, res, next) {
    const { role, id: userId } = req.user;
    const classId = req.params.classId || req.body.classId || req.query.classId;

    if (!classId) {
        return res.status(400).json({ error: 'classId is required.' });
    }

    try {
        if (role === 'admin') {
            return next(); // admins bypass class scoping by design
        }

        if (role === 'teacher') {
            const { rows } = await db.query(
                'SELECT 1 FROM classes WHERE id = $1 AND teacher_id = $2',
                [classId, userId]
            );
            if (rows.length === 0) {
                return res.status(403).json({ error: 'You do not own this class.' });
            }
            return next();
        }

        if (role === 'student') {
            const { rows } = await db.query(
                `SELECT 1 FROM enrollments
                 WHERE student_id = $1 AND class_id = $2 AND status = 'approved'`,
                [userId, classId]
            );
            if (rows.length === 0) {
                // Deliberately vague — don't reveal whether the class
                // exists at all to a user with no rights to it.
                return res.status(403).json({ error: 'Access denied.' });
            }
            return next();
        }

        // Fail closed for any unrecognized role
        return res.status(403).json({ error: 'Access denied.' });

    } catch (err) {
        console.error('authorizeClassAccess error:', err);
        return res.status(500).json({ error: 'Internal server error during authorization check.' });
    }
}

module.exports = { requireRole, authorizeClassAccess };
