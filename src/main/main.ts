import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FileManager } from './fileManager';
import { Database } from './database';
import { Analyzer } from './analyzer';
import { parseEntries } from './parser';

const notesDir = path.join(os.homedir(), 'onsite-notes');
if (!fs.existsSync(notesDir)) {
  fs.mkdirSync(notesDir, { recursive: true });
}

const fileManager = new FileManager(notesDir);
const database = new Database(path.join(notesDir, 'notes.db'));
const analyzer = new Analyzer();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Onsite Notes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('read-file', async (_event, date: string) => {
  return fileManager.readFile(date);
});

ipcMain.handle('write-file', async (_event, date: string, content: string) => {
  return fileManager.writeFile(date, content);
});

ipcMain.handle('list-files', async () => {
  return fileManager.listFiles();
});

ipcMain.handle('get-autocomplete', async (_event, prefix: string, type: string) => {
  return database.searchIds(prefix, type);
});

ipcMain.handle('index-content', async (_event, date: string, content: string) => {
  const entries = parseEntries(content, date);
  database.indexEntries(date, entries);
  return true;
});

ipcMain.handle('analyze', async (_event, startDate: string, endDate: string) => {
  const files = fileManager.listFiles();
  const contents: Record<string, string> = {};
  for (const f of files) {
    const d = f.replace('.txt', '');
    if (d >= startDate && d <= endDate) {
      contents[d] = fileManager.readFile(d) || '';
    }
  }
  return analyzer.analyze(contents);
});

ipcMain.handle('get-config', async () => {
  return { priorDays: 3 };
});
