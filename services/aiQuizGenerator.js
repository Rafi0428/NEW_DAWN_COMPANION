// ============================================================
// services/aiQuizGenerator.js
// Calls the Groq API to turn a Chapter's Study Material into
// a finite, multiple-choice quiz — with explanations generated
// in the same call so they stay grounded in the same context.
// ============================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-70b-versatile'; // Rock-solid Groq model

const SYSTEM_PROMPT = `You are a quiz-generation engine for an educational platform. You will be given a single piece of Study Material text.

STRICT RULES — violating any of these makes your output unusable:
1. Every question, every correct answer, and every explanation MUST be derivable strictly from the provided Study Material text. Do not use outside knowledge, even if you know it to be true.
2. Do NOT invent facts, dates, names, formulas, or examples that are not present in the Study Material.
3. If the Study Material does not contain enough distinct, testable facts to generate the requested number of questions, generate FEWER questions rather than inventing content to fill the quota. Never pad with fabricated questions.
4. Each question must have exactly 4 answer options (A, B, C, D), exactly one of which is correct.
5. Incorrect options (distractors) must be plausible but must not themselves be true statements found elsewhere in the text out of context.
6. Each explanation must justify the correct answer by referring to what the Study Material actually says — do not add external elaboration, examples, or context beyond the source text.
7. Output ONLY valid JSON matching the schema below. No markdown, no commentary, no code fences, no text before or after the JSON.

OUTPUT SCHEMA:
{
  "questions": [
    {
      "question_text": "string",
      "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
      "correct_option": "A",
      "explanation": "string"
    }
  ]
}`;

/**
 * Generates a quiz from study material text.
 * @param {string} studyMaterialText - the chapter's study material content
 * @param {number} requestedCount - desired number of questions (may return fewer)
 * @returns {Promise<Array<{question_text, options, correct_option, explanation}>>}
 */
async function generateQuizFromStudyMaterial(studyMaterialText, requestedCount = 5) {
    if (!studyMaterialText || studyMaterialText.trim().length < 50) {
        throw new Error('Study material is too short to generate a meaningful quiz from.');
    }

    const userPrompt = `Study Material:
"""
${studyMaterialText}
"""

Generate up to ${requestedCount} multiple-choice questions strictly from the Study Material above, following your system instructions exactly. Respond with JSON only.`;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Now correctly using the Groq API key (with a 'q')
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}` 
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ]
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent) {
        throw new Error('No text content returned from the model.');
    }

    let parsed;
    try {
        let rawText = textContent.trim();
        if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (rawText.startsWith('```')) {
            rawText = rawText.replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        parsed = JSON.parse(rawText);
    } catch (err) {
        throw new Error('Model did not return valid JSON — aborting quiz generation.');
    }

    if (!Array.isArray(parsed.questions)) {
        throw new Error('Malformed quiz response — missing questions array.');
    }

    const validQuestions = parsed.questions.filter(q =>
        validateQuestionShape(q) && validateQuestionGrounding(q, studyMaterialText)
    );

    if (validQuestions.length === 0) {
        throw new Error('No valid, grounded questions could be generated from this study material.');
    }

    return validQuestions;
}

function validateQuestionShape(q) {
    if (!q || typeof q.question_text !== 'string' || !q.question_text.trim()) return false;
    if (!q.options || typeof q.options !== 'object') return false;
    const keys = ['A', 'B', 'C', 'D'];
    if (!keys.every(k => typeof q.options[k] === 'string' && q.options[k].trim())) return false;
    if (!keys.includes(q.correct_option)) return false;
    if (typeof q.explanation !== 'string' || !q.explanation.trim()) return false;
    return true;
}

function validateQuestionGrounding(question, sourceText) {
    const sourceWords = new Set(
        sourceText.toLowerCase().match(/\b[a-z]{4,}\b/g) || []
    );
    const questionWords = (question.question_text.toLowerCase().match(/\b[a-z]{4,}\b/g) || []);

    if (questionWords.length === 0) return true;

    const overlap = questionWords.filter(w => sourceWords.has(w)).length;
    const overlapRatio = overlap / questionWords.length;

    return overlapRatio >= 0.2;
}

module.exports = { generateQuizFromStudyMaterial };