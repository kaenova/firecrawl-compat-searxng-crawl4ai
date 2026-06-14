import { Database } from "bun:sqlite";

/**
 * Create and initialize a SQLite database with the activity_logs schema.
 */
export function createDb(dbPath: string = "activity.db"): Database {
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      request_body TEXT,
      response_body TEXT,
      error TEXT
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_timestamp
    ON activity_logs(timestamp)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_path
    ON activity_logs(path)
  `);

  return db;
}
