const Database = require('better-sqlite3');

let db;

function initDb(dbPath) {
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasPassword = tableInfo.some((c) => c.name === 'password');
    const hasPasswordHash = tableInfo.some((c) => c.name === 'password_hash');
    if (hasPassword && !hasPasswordHash) {
      db.prepare('ALTER TABLE users RENAME COLUMN password TO password_hash').run();
    }
  } catch (_) {
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_resume_text TEXT NOT NULL,
      tailored_resume_text TEXT,
      job_description TEXT,
      ats_score INTEGER,
      cover_letter TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  try {
    const resumeInfo = db.prepare("PRAGMA table_info(resumes)").all();
    if (!resumeInfo.some((c) => c.name === 'missing_keywords')) {
      db.prepare('ALTER TABLE resumes ADD COLUMN missing_keywords TEXT').run();
    }
    if (!resumeInfo.some((c) => c.name === 'missing_skills')) {
      db.prepare('ALTER TABLE resumes ADD COLUMN missing_skills TEXT').run();
    }
  } catch (_) {}
}

function getDb() {
  if (!db) {
    throw new Error('Database has not been initialized');
  }
  return db;
}

module.exports = { initDb, getDb };
