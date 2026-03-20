import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { Analyzer } from './analyzer';
import { NotebookManager } from './notebookManager';

const safeMode = process.env.ELECTRON_SAFE_MODE === '1';
if (safeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('no-sandbox');
}

const analyzer = new Analyzer();
const notebookManager = new NotebookManager();

function notifyNotebookChanged(win: BrowserWindow): void {
  win.webContents.send('notebook-changed', {
    currentNotebook: notebookManager.getCurrentNotebook(),
    notebooks: notebookManager.listNotebooks()
  });
}

function buildAppMenu(win: BrowserWindow): void {
  const current = notebookManager.getCurrentNotebook();
  const notebooks = notebookManager.listNotebooks();

  const notebookItems: MenuItemConstructorOptions[] = notebooks.map(name => ({
    label: name,
    type: 'radio',
    checked: name === current,
    click: async () => {
      await notebookManager.setCurrentNotebook(name);
      buildAppMenu(win);
      notifyNotebookChanged(win);
    }
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Notebook...',
          click: () => {
            win.webContents.send('create-notebook-requested');
          }
        },
        {
          label: 'Switch Notebook',
          submenu: notebookItems
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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
  buildAppMenu(win);
  return win;
}

app.whenReady().then(async () => {
  await notebookManager.init('default');

  ipcMain.handle('read-file', async (_event: IpcMainInvokeEvent, date: string) => {
    return notebookManager.readFile(date);
  });

  ipcMain.handle('write-file', async (_event: IpcMainInvokeEvent, date: string, content: string) => {
    await notebookManager.writeFile(date, content);
    return true;
  });

  ipcMain.handle('list-files', async () => {
    return notebookManager.listFiles();
  });

  ipcMain.handle('get-autocomplete', async (_event: IpcMainInvokeEvent, prefix: string, type: string) => {
    return notebookManager.searchIds(prefix, type);
  });

  ipcMain.handle('index-content', async (_event: IpcMainInvokeEvent, date: string, content: string) => {
    await notebookManager.indexContent(date, content);
    return true;
  });

  ipcMain.handle('analyze', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string, format: 'text' | 'html' = 'text') => {
    const contents = await notebookManager.getContentsInRange(startDate, endDate);
    return format === 'html' ? analyzer.analyzeHtml(contents) : analyzer.analyze(contents);
  });

  ipcMain.handle('set-notebook', async (_event: IpcMainInvokeEvent, notebookName: string) => {
    const selected = await notebookManager.setCurrentNotebook(notebookName);
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
      buildAppMenu(focused);
      notifyNotebookChanged(focused);
    }
    return {
      currentNotebook: selected,
      notebooks: notebookManager.listNotebooks()
    };
  });

  ipcMain.handle('list-notebooks', async () => {
    return notebookManager.listNotebooks();
  });

  ipcMain.handle('get-config', async () => {
    return {
      priorDays: 3,
      currentNotebook: notebookManager.getCurrentNotebook(),
      notebooks: notebookManager.listNotebooks(),
      notebooksRootDir: notebookManager.getNotebooksRootDir()
    };
  });

  const win = createWindow();
  win.webContents.once('did-finish-load', () => {
    notifyNotebookChanged(win);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
