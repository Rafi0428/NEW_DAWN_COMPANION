-- ============================================================
-- NEW_DAWN_COMPANION — Migration 03: Content, Quizzes & Results
-- Depends on: schema.sql, schema_02_hierarchy.sql
-- Database: PostgreSQL 14+
-- ============================================================

-- ------------------------------------------------------------
-- STUDY MATERIAL
-- The theory/notes a Teacher writes for a Chapter. Kept as its
-- own table (rather than just chapters.content_body) so it can
-- be versioned/regenerated independently of the chapter record,
-- and so the AI quiz generator has one unambiguous source text
-- to ground itself in.
-- ------------------------------------------------------------
CREATE TABLE study_materials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id      UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,          -- the theory/notes text — this is the ONLY
                                             -- source of truth the quiz generator may use
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (chapter_id) -- one active study material per chapter; edit in place to "version" it
);

CREATE TRIGGER trg_study_materials_updated_at
BEFORE UPDATE ON study_materials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- QUIZZES
-- Generated from a specific study_material snapshot. Storing
-- source_snapshot lets you always answer "what text was this
-- quiz actually generated from?" even if the study material is
-- edited later — important for the explanation feature, and for
-- debugging hallucination reports.
-- ------------------------------------------------------------
CREATE TABLE quizzes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id          UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    study_material_id   UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    source_snapshot     TEXT NOT NULL,       -- copy of study_materials.content at generation time
    question_count      INTEGER NOT NULL,
    generated_by_model  VARCHAR(100),        -- e.g. 'claude-sonnet-5', for audit/debugging
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quizzes_chapter ON quizzes(chapter_id);

-- ------------------------------------------------------------
-- QUIZ QUESTIONS
-- Multiple choice, 4 options. Explanation is generated ALONGSIDE
-- the question (same AI call) so it's grounded in the same
-- context — not generated later, disconnected from the source.
-- ------------------------------------------------------------
CREATE TABLE quiz_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    sequence_order  INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    options         JSONB NOT NULL,      -- e.g. {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_option  CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
    explanation     TEXT NOT NULL,       -- AI-generated, shown for every question in Results
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id, sequence_order);

-- ------------------------------------------------------------
-- QUIZ ATTEMPTS
-- One row per Student's attempt at a Quiz.
-- ------------------------------------------------------------
CREATE TYPE attempt_status AS ENUM ('in_progress', 'completed');

CREATE TABLE quiz_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          attempt_status NOT NULL DEFAULT 'in_progress',
    score           INTEGER,             -- correct count, filled on completion
    total_questions INTEGER NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_quiz_attempts_student ON quiz_attempts(student_id, quiz_id);

-- Defense in depth: student_id must actually be a student, and
-- must be enrolled in the class that owns this quiz's chapter.
CREATE OR REPLACE FUNCTION enforce_attempt_student_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    r user_role;
    is_enrolled BOOLEAN;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.student_id;
    IF r IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'quiz_attempts.student_id must reference a user with role = student';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM quizzes q
        JOIN chapters ch ON ch.id = q.chapter_id
        JOIN subjects s ON s.id = ch.subject_id
        JOIN enrollments e ON e.class_id = s.class_id
        WHERE q.id = NEW.quiz_id
          AND e.student_id = NEW.student_id
          AND e.status = 'approved'
    ) INTO is_enrolled;

    IF NOT is_enrolled THEN
        RAISE EXCEPTION 'Student is not enrolled in the class this quiz belongs to';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_attempt_student_enrollment
BEFORE INSERT ON quiz_attempts
FOR EACH ROW EXECUTE FUNCTION enforce_attempt_student_enrollment();

-- ------------------------------------------------------------
-- QUIZ ATTEMPT ANSWERS
-- One row per question per attempt — this is what the Results
-- Section renders (student's answer vs. correct answer vs.
-- the pre-generated explanation).
-- ------------------------------------------------------------
CREATE TABLE quiz_attempt_answers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_option CHAR(1) CHECK (selected_option IN ('A','B','C','D')),
    is_correct      BOOLEAN NOT NULL,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_attempt_answers_attempt ON quiz_attempt_answers(attempt_id);
