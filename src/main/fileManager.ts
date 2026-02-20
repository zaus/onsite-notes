import * as fs from 'fs';
import * as path from 'path';

export class FileManager {
  constructor(private notesDir: string) {}

  readFile(date: string): string | null {
    const filePath = path.join(this.notesDir, `${date}.txt`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeFile(date: string, content: string): void {
    const filePath = path.join(this.notesDir, `${date}.txt`);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  listFiles(): string[] {
    if (!fs.existsSync(this.notesDir)) return [];
    return fs.readdirSync(this.notesDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
      .sort();
  }
}
