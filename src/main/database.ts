import Database3 from 'better-sqlite3';
import { LogEntry } from './parser';

export class Database {
  private db: Database3.Database;

  constructor(dbPath: string) {
    this.db = new Database3(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
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
  }

  indexEntries(dateFile: string, entries: LogEntry[]) {
    const upsertId = this.db.prepare(`
      INSERT INTO ids (id, type, first_seen, last_seen, project)
      VALUES (@id, @type, @date, @date, @project)
      ON CONFLICT(id) DO UPDATE SET
        last_seen = @date,
        project = COALESCE(@project, project)
    `);

    const upsertLink = this.db.prepare(`
      INSERT OR REPLACE INTO links (id, date_file, line_number, context)
      VALUES (@id, @dateFile, @lineNumber, @context)
    `);

    const upsertTodo = this.db.prepare(`
      INSERT OR REPLACE INTO todos (id, date_file, state, text, line_number)
      VALUES (@id, @dateFile, @state, @text, @lineNumber)
    `);

    const tx = this.db.transaction(() => {
      // Clear existing entries for this date
      this.db.prepare('DELETE FROM links WHERE date_file = ?').run(dateFile);
      this.db.prepare('DELETE FROM todos WHERE date_file = ?').run(dateFile);

      for (const entry of entries) {
        if (entry.id) {
          const idType = entry.type === 'tag' ? 'tag' : 'mention';
          upsertId.run({
            id: entry.id,
            type: idType,
            date: entry.date,
            project: entry.project
          });

          upsertLink.run({
            id: entry.id,
            dateFile,
            lineNumber: entry.lineNumber,
            context: entry.details.slice(0, 200)
          });

          for (const todo of entry.todos) {
            upsertTodo.run({
              id: entry.id,
              dateFile,
              state: todo.state,
              text: todo.text.slice(0, 500),
              lineNumber: entry.lineNumber
            });
          }
        }
      }
    });

    tx();
  }

  searchIds(prefix: string, type?: string): Array<{ id: string; type: string; project: string | null }> {
    let query = 'SELECT id, type, project FROM ids WHERE id LIKE ? ';
    const params: string[] = [`${prefix}%`];
    if (type && (type === 'tag' || type === 'mention')) {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY last_seen DESC LIMIT 10';
    return this.db.prepare(query).all(...params) as Array<{ id: string; type: string; project: string | null }>;
  }

  getLinks(id: string): Array<{ date_file: string; line_number: number; context: string }> {
    return this.db.prepare(
      'SELECT date_file, line_number, context FROM links WHERE id = ? ORDER BY date_file DESC'
    ).all(id) as Array<{ date_file: string; line_number: number; context: string }>;
  }
}
