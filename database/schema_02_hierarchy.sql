-- ============================================================
-- NEW_DAWN_COMPANION — Migration 02: Educational Hierarchy
-- Classes -> Subjects -> Chapters
-- Depends on: schema.sql (Part 1)
-- Database: PostgreSQL 14+
-- ============================================================

-- ------------------------------------------------------------
-- SUBJECTS
-- Belongs to exactly one Class. Only the owning Teacher (or an
-- Admin) can create/edit subjects under that class — enforced
-- in the API layer via authorizeClassAccess, and backed here by
-- the FK to classes.
-- ------------------------------------------------------------
CREATE TABLE subjects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (class_id, name) -- no duplicate subject names within the same class
);

CREATE INDEX idx_subjects_class ON subjects(class_id);

-- ------------------------------------------------------------
-- CHAPTERS
-- Belongs to exactly one Subject. This is the leaf node of the
-- hierarchy — content (materials, assignments, etc. in later
-- parts) will hang off Chapters.
-- ------------------------------------------------------------
CREATE TABLE chapters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    content_body    TEXT,               -- lesson text / notes; swap for a richer content model later if needed
    sequence_order  INTEGER NOT NULL DEFAULT 0, -- for ordering chapters within a subject
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chapters_subject ON chapters(subject_id, sequence_order);

-- ------------------------------------------------------------
-- Keep updated_at fresh on edits (reused for both tables)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subjects_updated_at
BEFORE UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chapters_updated_at
BEFORE UPDATE ON chapters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Defense in depth: created_by must be a Teacher or Admin
-- (Students never get write access to the hierarchy at all —
--  this is enforced primarily by RBAC middleware, but we back
--  it up here in case something ever writes directly to the DB.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_hierarchy_author_role()
RETURNS TRIGGER AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.created_by;
    IF r NOT IN ('teacher', 'admin') THEN
        RAISE EXCEPTION 'created_by must reference a Teacher or Admin';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subjects_author_role
BEFORE INSERT OR UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION enforce_hierarchy_author_role();

CREATE TRIGGER trg_chapters_author_role
BEFORE INSERT OR UPDATE ON chapters
FOR EACH ROW EXECUTE FUNCTION enforce_hierarchy_author_role();

-- ------------------------------------------------------------
-- Convenience view: full hierarchy in one query, useful for the
-- Teacher dashboard and for read-only Student views alike.
-- ------------------------------------------------------------
CREATE VIEW hierarchy_view AS
SELECT
    c.id            AS class_id,
    c.name          AS class_name,
    c.teacher_id,
    s.id            AS subject_id,
    s.name          AS subject_name,
    ch.id           AS chapter_id,
    ch.title        AS chapter_title,
    ch.sequence_order
FROM classes c
LEFT JOIN subjects s ON s.class_id = c.id
LEFT JOIN chapters ch ON ch.subject_id = s.id
ORDER BY c.name, s.name, ch.sequence_order;
