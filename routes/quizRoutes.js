const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireRole, authorizeClassAccess } = require('../middleware/rbac');
const { resolveClassFromChapter } = require('../middleware/hierarchy');

// Use memory storage for fast file reading without cluttering the server disk
const upload = multer({ storage: multer.memoryStorage() });

// ------------------------------------------------------------
// READ — GET /api/chapters/:chapterId/quizzes
// ------------------------------------------------------------
router.get(
    '/chapters/:chapterId/quizzes',
    authenticateToken,
    requireRole('teacher', 'admin', 'student'),
    resolveClassFromChapter,
    authorizeClassAccess,
    async (req, res) => {
        try {
            // Removed the hardcoded fallbacks to use the real database columns!
            const { rows } = await db.query(
                `SELECT id, chapter_id, time_limit_minutes, created_at, title
                 FROM quizzes 
                 WHERE chapter_id = $1
                 ORDER BY created_at ASC`,
                [req.params.chapterId]
            );
            res.json(rows);
        } catch (err) {
            console.error('Fetch quizzes error:', err);
            res.status(500).json({ error: 'Failed to fetch quizzes.' });
        }
    }
);

// ------------------------------------------------------------
// PUT /api/quizzes/:quizId/time-limit
// Allows teachers to modify the specific time limits whenever they want
// ------------------------------------------------------------
router.put('/quizzes/:quizId/time-limit', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { timeLimit } = req.body;
        await db.query(
            'UPDATE quizzes SET time_limit_minutes = $1 WHERE id = $2',
            [timeLimit, req.params.quizId]
        );
        res.json({ message: 'Time limit updated successfully.' });
    } catch (err) {
        console.error('Update time limit error:', err);
        res.status(500).json({ error: 'Failed to update time limit.' });
    }
});

// ------------------------------------------------------------
// POST /api/chapters/:chapterId/quiz/import-bank
// The Core Parser Engine (Powered by Groq): Cleans input and segments into chunks of 25
// ------------------------------------------------------------
router.post('/chapters/:chapterId/quiz/import-bank', authenticateToken, requireRole('teacher'), upload.single('question_bank'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No text file uploaded.' });
    }

    const rawText = req.file.buffer.toString('utf-8');
    const apiKey = process.env.GROK_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API Key missing from environment configurations.' });
    }

    try {
        // Fetch the chapter title so our sets name themselves nicely (e.g., "Cold War - Set 1")
        const chapterRes = await db.query('SELECT title FROM chapters WHERE id = $1', [req.params.chapterId]);
        const chapterTitle = chapterRes.rows[0]?.title || 'Chapter Quiz';
        
        const promptSystem = `
            You are an advanced LMS backend parser. Your task is to extract multiple-choice questions from the raw unstructured text file provided by a teacher.
            Convert the text into a perfectly valid JSON array of objects.
            
            Each question object MUST strictly have these exact keys:
            - "question_text": The question statement
            - "option_a": Option A text
            - "option_b": Option B text
            - "option_c": Option C text
            - "option_d": Option D text
            - "correct_option": Must strictly be a single character string: either "A", "B", "C", or "D". Locate this from the answers section provided by the teacher.
            - "explanation": The correction explanation statement provided for that item. If the teacher did not include one, generate a brief factual explanation explaining why the correct option is true.

            Return ONLY the valid raw JSON array. Do not wrap it in markdown code fences (like \`\`\`json), do not include any explanatory introduction text, just output the pure clean parsable JSON text array.
        `;

        // Point to the Groq API
        const targetUrl = 'https://api.groq.com/openai/v1/chat/completions';

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // This uses your gsk_ key!
            },
            body: JSON.stringify({
                // Use Groq's incredibly fast Llama 3.3 model
                model: "llama-3.3-70b-versatile", 
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: `Here is the teacher's text:\n${rawText}` }
                ],
                temperature: 0.1,
                max_tokens: 8000
            })
        });

        const apiData = await response.json();

        if (!response.ok) {
            console.error('Groq API Error:', apiData);
            return res.status(500).json({ error: 'AI processing failed. Check server terminal for details.' });
        }

        let cleanJsonText = apiData.choices?.[0]?.message?.content?.trim();

        if (!cleanJsonText) {
            return res.status(500).json({ error: 'AI processing returned an empty payload structure.' });
        }

        // Strip out accidental markdown backticks if the model ignores system parameters
        if (cleanJsonText.startsWith('```')) {
            cleanJsonText = cleanJsonText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }

        let parsedQuestions;
        try {
            parsedQuestions = JSON.parse(cleanJsonText);
        } catch (parseError) {
            console.error('Failed to parse Groq output as JSON:', cleanJsonText);
            return res.status(500).json({ error: 'AI output was not valid JSON.' });
        }

        if (!Array.isArray(parsedQuestions)) {
            return res.status(500).json({ error: 'Parsed output failed to form a valid structural array.' });
        }

        // --- CHUNKING INTO BATCHES OF 25 ---
        const chunkSize = 25;
        let setCounter = 1;
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            for (let i = 0; i < parsedQuestions.length; i += chunkSize) {
                const currentChunk = parsedQuestions.slice(i, i + chunkSize);
                const quizTitle = `${chapterTitle} — Set ${setCounter}`;

                // 1. Save the new Quiz set container
                const quizInsert = await client.query(
                    `INSERT INTO quizzes (chapter_id, title, time_limit_minutes) 
                     VALUES ($1, $2, 25) RETURNING id`,
                    [req.params.chapterId, quizTitle]
                );
                const newQuizId = quizInsert.rows[0].id;

                // 2. Insert all questions belonging to this set container sequentially
                for (let orderIndex = 0; orderIndex < currentChunk.length; orderIndex++) {
                    const q = currentChunk[orderIndex];
                    await client.query(
                        `INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, sequence_order)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            newQuizId,
                            q.question_text,
                            q.option_a,
                            q.option_b,
                            q.option_c,
                            q.option_d,
                            q.correct_option.toUpperCase(),
                            q.explanation || 'No explanation provided.',
                            orderIndex + 1
                        ]
                    );
                }
                setCounter++;
            }

            await client.query('COMMIT');
            res.json({ message: `Successfully split ${parsedQuestions.length} questions across ${setCounter - 1} quiz sets.` });

        } catch (transactionError) {
            await client.query('ROLLBACK');
            throw transactionError;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Import bank runtime error:', err);
        res.status(500).json({ error: 'Failed to process file. Ensure the structure is clearly readable.' });
    }
});

// ------------------------------------------------------------
// GET /api/quizzes/:quizId/take
// Fetches a quiz for a student (HIDES answers and explanations)
// ------------------------------------------------------------
router.get('/quizzes/:quizId/take', authenticateToken, async (req, res) => {
    try {
        // Fetch quiz metadata
        const quizRes = await db.query(
            'SELECT id, title, time_limit_minutes FROM quizzes WHERE id = $1',
            [req.params.quizId]
        );
        
        if (quizRes.rows.length === 0) {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        
        const quiz = quizRes.rows[0];

        // Fetch questions, explicitly omitting correct_option and explanation
        const qRes = await db.query(
            `SELECT id, question_text, option_a, option_b, option_c, option_d, sequence_order 
             FROM questions WHERE quiz_id = $1 ORDER BY sequence_order ASC`,
            [req.params.quizId]
        );

        res.json({ quiz, questions: qRes.rows });
    } catch (err) {
        console.error('Fetch quiz for taking error:', err);
        res.status(500).json({ error: 'Failed to load quiz.' });
    }
});

// ------------------------------------------------------------
// POST /api/quizzes/:quizId/grade
// Evaluates answers, saves score to quiz_attempts, returns results
// ------------------------------------------------------------
router.post('/quizzes/:quizId/grade', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body; // Expected format: { "question_id": "A", "question_id2": "C" }
        const quizId = req.params.quizId;
        const studentId = req.user.id; // User ID attached via authenticateToken middleware

        // 1. Fetch the correct answers and explanations from the database
        const qRes = await db.query(
            'SELECT id, correct_option, explanation FROM questions WHERE quiz_id = $1',
            [quizId]
        );
        
        const questions = qRes.rows;
        if (questions.length === 0) {
            return res.status(404).json({ error: 'No questions found for this quiz.' });
        }

        // 2. Calculate the score and generate feedback
        let score = 0;
        const totalQuestions = questions.length;
        const feedback = [];

        questions.forEach(q => {
            // Compare the student's string answer to the DB string answer
            const studentAnswer = answers[q.id];
            const isCorrect = studentAnswer === q.correct_option;
            
            if (isCorrect) score++;

            // Package the feedback for the results screen
            feedback.push({
                question_id: q.id,
                submitted_answer: studentAnswer || null,
                correct_option: q.correct_option,
                is_correct: isCorrect,
                explanation: q.explanation
            });
        });

        // 3. Save the attempt to the newly created quiz_attempts table
        await db.query(
            `INSERT INTO quiz_attempts (student_id, quiz_id, score, total_questions) 
             VALUES ($1, $2, $3, $4)`,
            [studentId, quizId, score, totalQuestions]
        );

        // 4. Return the final payload back to the student frontend
        res.json({
            score,
            totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            feedback
        });

    } catch (err) {
        console.error('Grade quiz error:', err);
        res.status(500).json({ error: 'Failed to grade the quiz.' });
    }
});

// ------------------------------------------------------------
// GET /api/student/attempts
// Fetches the logged-in student's past quiz attempts
// ------------------------------------------------------------
// ------------------------------------------------------------
// GET /api/student/attempts
// Fetches the logged-in student's past quiz attempts
// ------------------------------------------------------------
router.get('/student/attempts', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const query = `
            SELECT 
                qa.id AS attempt_id,
                q.title AS quiz_title, 
                c.title AS chapter_title,
                qa.score,
                qa.total_questions, 
                CURRENT_TIMESTAMP AS submitted_at
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.id
            JOIN chapters c ON q.chapter_id = c.id
            WHERE qa.student_id = $1
            ORDER BY qa.id DESC
        `;

        const { rows } = await db.query(query, [req.user.id]);
        
        res.json(rows);
    } catch (err) {
        console.error('Fetch student attempts error:', err);
        res.status(500).json({ error: 'Failed to load grade history.' });
    }
});

module.exports = router;