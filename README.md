# 𝐍𝐞𝐰 𝐃𝐚𝐰𝐧 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧 🌅

A full-stack Learning Management System (LMS) designed to streamline the educational experience. It features AI-powered quiz generation, secure anti-cheat exam environments, real-time grading, and a fully dynamic, database-driven landing page.

## ✨ Features

### 👨‍🏫 For Teachers & Admins
* **AI-Powered Quiz Generation:** Upload a raw `.txt` question bank, and the integrated Google Gemini API instantly parses, formats, and slices it into automated, incrementally numbered sets of 25-question quizzes.
* **Dynamic CMS Landing Page:** Manage website content directly from the admin dashboard, including Live Educators, Student Toppers, Pricing Plans, FAQs, and Contact/Map Settings.
* **Class & Chapter Management:** Organize students into classes, manage subjects, and structure content by semesters and chapters.
* **Comprehensive Gradebook:** View real-time student submissions, scores, and timestamps in a centralized dashboard.
* **Resource Hosting:** Upload and distribute study materials directly to students.

### 🎓 For Students
* **Seamless Enrollment:** Join classes instantly using secure 6-character class codes.
* **Secure Exam Environment:** Built-in anti-cheat mechanisms that block developer tools, prevent copy/pasting (keyboard shortcuts), and trigger auto-submission if the student switches tabs or minimizes the window.
* **Live Exam UI:** Features a sticky countdown timer that pulses red in the final 60 seconds, alongside a real-time progress bar.
* **Instant Grading:** Automated evaluation provides immediate scores, percentages, and correct answer explanations upon submission.

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Custom Theme), Vanilla JavaScript
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (Neon Serverless) via `pg-pool`
* **AI Integration:** Google Gemini API (`gemini-3.5-flash` model)
* **Authentication:** JSON Web Tokens (JWT) & Role-Based Access Control (RBAC)
* **File Handling:** Multer (Memory Storage) & Cloudinary API

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [PostgreSQL](https://www.postgresql.org/) (Local or Neon Serverless)
* A [Google Gemini API Key](https://aistudio.google.com/)
* A [Cloudinary Account](https://cloudinary.com/)

### 1. Clone & Install
```bash
git clone [https://github.com/Rafi0428/New_Dawn_Companion.git](https://github.com/Rafi0428/New_Dawn_Companion.git)
cd New_Dawn_Companion
npm install
```
### 2. Environment Setup
* Create a .env file in the root directory and configure the following variables:
```
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/new_dawn_db

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your_refresh_secret_key
REFRESH_TOKEN_EXPIRES_IN=7d

# AI Integration (Google Gemini API)
GEMINI_API_KEY=your_gemini_api_key_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Database Initialization
* Ensure your PostgreSQL server is running. Create a database named new_dawn_db and apply your base schema.

**Important schema notes for AI Quizzes:**
* If upgrading from a strict PDF-only setup to the AI-generated Question Bank setup, ensure your quizzes table has the following adjustments:
```
  -- Allow standalone quiz sets without forced file attachments
ALTER TABLE quizzes ALTER COLUMN study_material_id DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN source_snapshot DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN question_count DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN status DROP NOT NULL;

-- Ensure timestamps exist for the gradebook view
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
```
**Required Schema for the Dynamic CMS Landing Page:**
```
CREATE TABLE IF NOT EXISTS landing_teachers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, role VARCHAR(255) NOT NULL, image_url TEXT, display_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS landing_toppers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, percentage DECIMAL(5,2) NOT NULL, batch_year INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS landing_settings (id SERIAL PRIMARY KEY, owner_name VARCHAR(255), owner_email VARCHAR(255), owner_github VARCHAR(255), owner_linkedin VARCHAR(255), educator_name VARCHAR(255), educator_email VARCHAR(255), educator_whatsapp VARCHAR(255), map_embed_url TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS landing_faqs (id SERIAL PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, display_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS landing_pricing (id SERIAL PRIMARY KEY, plan_name VARCHAR(255) NOT NULL, price INTEGER NOT NULL, duration VARCHAR(50), features TEXT NOT NULL, is_highlighted BOOLEAN DEFAULT false, display_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
```

### 4. Run the Server
* npm start or for development:
```
node server.js
```
### 🔒 Security & Roles

The platform utilizes custom middleware to strictly enforce RBAC (Role-Based Access Control). Routes are protected via:
* authenticateToken: Verifies the validity of the user's JWT.
* requireRole('teacher', 'student', 'admin'): Restricts endpoint access based on account type.
* authorizeClassAccess: Ensures users can only access data belonging to their specific enrolled classes.

## 👨‍💻 Author

**𝐌𝐃 𝐑𝐀𝐅𝐈 𝐀𝐇𝐌𝐄𝐃**

*Built for educational advancement and modern learning management.*
