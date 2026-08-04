# 𝐍𝐞𝐰 𝐃𝐚𝐰𝐧 𝐂𝐨𝐦𝐩𝐚𝐧𝐢𝐨𝐧 🌅

A full-stack Learning Management System (LMS) designed to streamline the educational experience. It features AI-powered quiz generation, secure anti-cheat exam environments, and real-time grading for students and teachers.

## ✨ Features

### 👨‍🏫 For Teachers
* **AI-Powered Quiz Generation:** Upload a raw `.txt` question bank, and the integrated Groq API (Llama 3.3 70B) instantly parses, formats, and slices it into automated sets of 25-question quizzes.
* **Class & Chapter Management:** Organize students into classes, manage subjects, and structure content by semesters and chapters.
* **Resource Hosting:** Upload and distribute study materials directly to students.
* **Dynamic Time Limits:** Set custom countdown timers for each individual quiz assignment.

### 🎓 For Students
* **Seamless Enrollment:** Join classes instantly using secure 6-character class codes.
* **Secure Exam Environment:** Built-in anti-cheat mechanisms that block developer tools, prevent copy/pasting (keyboard shortcuts), and trigger auto-submission if the student switches tabs or minimizes the window.
* **Live Exam UI:** Features a sticky countdown timer that pulses red in the final 60 seconds, alongside a real-time progress bar.
* **Instant Grading:** Automated evaluation provides immediate scores, percentages, and correct answer explanations upon submission.

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Custom Theme), Vanilla JavaScript
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (with `pg-pool`)
* **AI Integration:** Groq API (`llama-3.3-70b-versatile` model)
* **Authentication:** JSON Web Tokens (JWT) & Role-Based Access Control (RBAC)
* **File Handling:** Multer (Memory Storage) & Cloudinary API

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [PostgreSQL](https://www.postgresql.org/) & pgAdmin
* A [Groq API Key](https://console.groq.com/keys)
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

# AI Integration (Groq API)
GROK_API_KEY=gsk_your_groq_api_key_here

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
  ALTER TABLE quizzes ADD COLUMN title VARCHAR(255) DEFAULT 'Practice Quiz';
ALTER TABLE quizzes ADD COLUMN time_limit_minutes INTEGER DEFAULT 25;
ALTER TABLE quizzes ALTER COLUMN study_material_id DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN source_snapshot DROP NOT NULL;
ALTER TABLE quizzes ALTER COLUMN question_count DROP NOT NULL;
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
