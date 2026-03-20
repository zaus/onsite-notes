import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import type { LogEntry } from './parser';

export class Database {
  private db!: SqlJsDatabase;
  private dbPath: string;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /** Factory — must be used instead of `new Database()` because init is async */
  static async create(dbPath: string): Promise<Database> {
    const instance = new Database(dbPath);
    await instance.init(dbPath);
    return instance;
  }

  private async init(dbPath: string) {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ids (
        id TEXT PRIMARY KEY,
        type TEXT CHECK(type IN ('tag','mention')),
        first_seen TEXT,
        last_seen TEXT,
        project TEXT
      );
      CREATE TABLE IF NOT EXISTS links (
        id TEXT,
        date_file TEXT,
        line_number INTEGER,
        context TEXT,
        PRIMARY KEY (id, date_file, line_number)
      );
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT,
        date_file TEXT,
        state TEXT,
        text TEXT,
        line_number INTEGER,
        PRIMARY KEY (id, date_file, line_number)
      );
    `);
    this.persist();
  }

  /** Write the in-memory database back to disk */
  private persist() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, buffer);
  }

  /** Convert sql.js query results into an array of plain objects */
  private toObjects<T>(results: ReturnType<SqlJsDatabase['exec']>): T[] {
    if (!results || results.length === 0) return [];
    const first = results[0];
    if (!first) return [];

    const { columns, values } = first;
    return values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
      return obj as T;
    });
  }

  indexEntries(dateFile: string, entries: LogEntry[]) {
    this.db.run('BEGIN');
    try {
      this.db.run('DELETE FROM links WHERE date_file = ?', [dateFile]);
      this.db.run('DELETE FROM todos WHERE date_file = ?', [dateFile]);

      for (const entry of entries) {
        if (entry.id) {
          const idType = entry.type === 'tag' ? 'tag' : 'mention';

          this.db.run(`
            INSERT INTO ids (id, type, first_seen, last_seen, project)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              last_seen = excluded.last_seen,
              project = COALESCE(excluded.project, project)
          `, [entry.id, idType, entry.date, entry.date, entry.project ?? null]);

          this.db.run(`
            INSERT OR REPLACE INTO links (id, date_file, line_number, context)
            VALUES (?, ?, ?, ?)
          `, [entry.id, dateFile, entry.lineNumber, entry.details.slice(0, 200)]);

          for (const todo of entry.todos) {
            this.db.run(`
              INSERT OR REPLACE INTO todos (id, date_file, state, text, line_number)
              VALUES (?, ?, ?, ?, ?)
            `, [entry.id, dateFile, todo.state, todo.text.slice(0, 500), entry.lineNumber]);
          }
        }
      }

      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    this.persist();
  }

  searchIds(prefix: string, type?: string): Array<{ id: string; type: string; project: string | null }> {
    const params: string[] = [`${prefix}%`];
    let query = 'SELECT id, type, project FROM ids WHERE id LIKE ?';
    if (type === 'tag' || type === 'mention') {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY last_seen DESC LIMIT 10';
    return this.toObjects(this.db.exec(query, params));
  }

  getLinks(id: string): Array<{ date_file: string; line_number: number; context: string }> {
    return this.toObjects(
      this.db.exec('SELECT date_file, line_number, context FROM links WHERE id = ? ORDER BY date_file DESC', [id])
    );
  }
}
