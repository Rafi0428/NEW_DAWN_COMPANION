-- ============================================================
-- NEW_DAWN_COMPANION — Core Schema (Part 1: Users, Classes, Security)
-- Database: PostgreSQL 14+
-- ============================================================

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- ------------------------------------------------------------
-- USERS
-- One table for all roles keeps auth logic (login, password
-- reset, JWT issuance) in one place. Role-specific fields are
-- split into satellite tables below to avoid a wide, nullable mess.
-- ------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,

    -- Approval workflow: Admins approve Teachers, Teachers approve Students.
    -- Admins are seeded directly (status = 'approved') and never need approval.
    status          approval_status NOT NULL DEFAULT 'pending',
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_users_email ON users(email);

-- ------------------------------------------------------------
-- CHECK: enforce the approval chain at the DB level
-- - A teacher can only be approved_by an admin
-- - A student can only be approved_by a teacher
-- (Enforced via trigger below, since CHECK constraints can't
--  subquery another table.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_approval_chain()
RETURNS TRIGGER AS $$
DECLARE
    approver_role user_role;
BEGIN
    IF NEW.approved_by IS NOT NULL THEN
        SELECT role INTO approver_role FROM users WHERE id = NEW.approved_by;

        IF NEW.role = 'teacher' AND approver_role <> 'admin' THEN
            RAISE EXCEPTION 'Teachers must be approved by an Admin';
        END IF;

        IF NEW.role = 'student' AND approver_role <> 'teacher' THEN
            RAISE EXCEPTION 'Students must be approved by a Teacher';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_approval_chain
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_approval_chain();

-- ------------------------------------------------------------
-- CLASSES
-- Every class is owned by exactly one Teacher.
-- ------------------------------------------------------------
CREATE TABLE classes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_teacher_role CHECK (
        -- Defense in depth: validated again via trigger below,
        -- since a plain CHECK can't see the users table.
        TRUE
    )
);

CREATE INDEX idx_classes_teacher ON classes(teacher_id);

-- Ensure teacher_id actually refers to a user with role = 'teacher'
CREATE OR REPLACE FUNCTION enforce_class_teacher_role()
RETURNS TRIGGER AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.teacher_id;
    IF r IS DISTINCT FROM 'teacher' THEN
        RAISE EXCEPTION 'classes.teacher_id must reference a user with role = teacher';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_class_teacher_role
BEFORE INSERT OR UPDATE ON classes
FOR EACH ROW EXECUTE FUNCTION enforce_class_teacher_role();

-- ------------------------------------------------------------
-- ENROLLMENTS
-- Links a Student to a Class. Modeled as its own table (rather
-- than a single class_id column on users) so that:
--   1. A Teacher's "assign student to class" action is an
--      explicit, auditable, approvable event.
--   2. The RBAC middleware has ONE authoritative place to check
--      "does this student belong to this class?"
-- ------------------------------------------------------------
CREATE TABLE enrollments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    status          approval_status NOT NULL DEFAULT 'pending',
    assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL, -- the Teacher who assigned them
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (student_id, class_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id, status);
CREATE INDEX idx_enrollments_class ON enrollments(class_id, status);

-- Ensure student_id actually refers to a user with role = 'student'
CREATE OR REPLACE FUNCTION enforce_enrollment_student_role()
RETURNS TRIGGER AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM users WHERE id = NEW.student_id;
    IF r IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'enrollments.student_id must reference a user with role = student';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_enrollment_student_role
BEFORE INSERT OR UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_student_role();

-- ------------------------------------------------------------
-- Seed an initial Admin (change password_hash before running in prod!)
-- Generate the hash with bcrypt, e.g.: bcrypt.hashSync('changeme', 12)
-- ------------------------------------------------------------
-- INSERT INTO users (full_name, email, password_hash, role, status)
-- VALUES ('Root Admin', 'admin@newdawn.local', '<bcrypt-hash-here>', 'admin', 'approved');


-- ============================================================
-- LANDING PAGE CMS TABLES
-- ============================================================

-- 1. Teachers / Faculty Directory
CREATE TABLE IF NOT EXISTS landing_teachers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,          -- e.g., "Head Educator" or "Mathematics Faculty"
    image_url TEXT,                      -- Link to their uploaded profile picture
    display_order INTEGER DEFAULT 0,     -- Allows admin to easily sort who appears first
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Toppers / Student Success Showcase
CREATE TABLE IF NOT EXISTS landing_toppers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,    -- Allows precise marks like 98.50
    batch_year INTEGER NOT NULL,         -- e.g., 2026, 2025 (used to group them in the UI)
    image_url TEXT,                      
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Contact & Platform Settings
-- This table is designed to hold only ONE row that the admin updates over time
CREATE TABLE IF NOT EXISTS landing_settings (
    id SERIAL PRIMARY KEY,
    owner_email VARCHAR(255),            
    owner_github VARCHAR(255),
    owner_linkedin VARCHAR(255),
    educator_whatsapp VARCHAR(50),       -- Includes country code, e.g., +917998403188
    educator_email VARCHAR(255),
    location_url TEXT,                   -- The clickable Google Maps link
    map_embed_url TEXT,                  -- The secure iframe source link we generated
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default row into settings so the admin always has something to edit
INSERT INTO landing_settings (id, owner_email, educator_whatsapp, updated_at) 
VALUES (1, 'mdrafiahmed0137@gmail.com', '+917998403188', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;