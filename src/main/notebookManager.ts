import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { FileManager } from './fileManager';
import { Database } from './database';
import { parseEntries } from './parser';

type NotebookContext = {
  name: string;
  notesDir: string;
  fileManager: FileManager;
  database: Database;
};

export class NotebookManager {
  private notebooksRootDir = '';
  private currentNotebook = 'default';
  private contexts = new Map<string, NotebookContext>();

  async init(defaultNotebook = 'default'): Promise<void> {
    this.notebooksRootDir = path.join(app.getPath('userData'), 'notebooks');
    this.ensureDirExists(this.notebooksRootDir);
    await this.setCurrentNotebook(defaultNotebook);
  }

  getCurrentNotebook(): string {
    return this.currentNotebook;
  }

  getNotebooksRootDir(): string {
    return this.notebooksRootDir;
  }

  listNotebooks(): string[] {
    this.ensureDirExists(this.notebooksRootDir);
    return fs.readdirSync(this.notebooksRootDir)
      .filter(entry => {
        const entryPath = path.join(this.notebooksRootDir, entry);
        return fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory();
      })
      .sort();
  }

  async setCurrentNotebook(name: string): Promise<string> {
    const normalized = this.normalizeNotebookName(name);
    await this.getContext(normalized);
    this.currentNotebook = normalized;
    return this.currentNotebook;
  }

  async readFile(date: string): Promise<string | null> {
    const context = await this.getCurrentContext();
    return context.fileManager.readFile(date);
  }

  async writeFile(date: string, content: string): Promise<void> {
    const context = await this.getCurrentContext();
    context.fileManager.writeFile(date, content);
  }

  async getLocalPath(date: string): Promise<string> {
    const context = await this.getCurrentContext();
    return context.fileManager.getPath(date);
  }

  async listFiles(): Promise<string[]> {
    const context = await this.getCurrentContext();
    return context.fileManager.listFiles();
  }

  async listOlderDates(beforeDate: string, limit: number): Promise<string[]> {
    const context = await this.getCurrentContext();
    const files = context.fileManager.listFiles();
    const maxItems = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
    if (maxItems <= 0) {
      return [];
    }

    const olderDates = files
      .filter(fileName => fileName.endsWith('.txt'))
      .map(fileName => fileName.replace('.txt', ''))
      .filter(date => date < beforeDate);

    return olderDates.slice(-maxItems);
  }

  async searchIds(prefix: string, type: string): Promise<Array<{ id: string; type: string; project: string | null }>> {
    const context = await this.getCurrentContext();
    return context.database.searchIds(prefix, type);
  }

  async indexContent(date: string, content: string): Promise<void> {
    const context = await this.getCurrentContext();
    const entries = parseEntries(content, date);
    context.database.indexEntries(date, entries);
  }

  async getContentsInRange(startDate: string, endDate: string): Promise<Record<string, string>> {
    const context = await this.getCurrentContext();
    const files = context.fileManager.listFiles();
    const contents: Record<string, string> = {};

    for (const fileName of files) {
      const date = fileName.replace('.txt', '');
      if (date >= startDate && date <= endDate) {
        contents[date] = context.fileManager.readFile(date) || '';
      }
    }

    return contents;
  }

  private normalizeNotebookName(name: string): string {
    const normalized = (name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
    return normalized || 'default';
  }

  private ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private async getCurrentContext(): Promise<NotebookContext> {
    return this.getContext(this.currentNotebook);
  }

  private async getContext(notebookName: string): Promise<NotebookContext> {
    const normalized = this.normalizeNotebookName(notebookName);
    const existing = this.contexts.get(normalized);
    if (existing) {
      return existing;
    }

    const notesDir = path.join(this.notebooksRootDir, normalized);
    this.ensureDirExists(notesDir);

    const context: NotebookContext = {
      name: normalized,
      notesDir,
      fileManager: new FileManager(notesDir),
      database: await Database.create(path.join(notesDir, 'notes.db'))
    };

    this.contexts.set(normalized, context);
    return context;
  }
}