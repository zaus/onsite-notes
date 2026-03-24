import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { Analyzer } from './analyzer';
import { AppSettingsStore } from './appSettings';
import type { AppSettingKey, AppSettings } from './appSettings';
import { LLMProviderConfig, type LLMSession } from './llmProvider';
import { NotebookManager } from './notebookManager';
import { createLLMProvider } from './llmProviderFactory';
import { NotebookRetriever } from './retrievalService';

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

  const settingMenuItems: Array<{ label: string; key: AppSettingKey }> = [
    { label: 'Set Prior Days...', key: 'priorDays' },
    { label: 'Set Load More Days...', key: 'loadMoreDays' },
    { label: 'Set LLM Provider...', key: 'llmProvider' },
    { label: 'Set LLM Base URL...', key: 'llmBaseUrl' },
    { label: 'Set LLM Model...', key: 'llmModel' },
    { label: 'Set LLM Search Scope...', key: 'llmSearchScope' },
    { label: 'Set LLM Context Before...', key: 'llmContextBefore' },
    { label: 'Set LLM Context After...', key: 'llmContextAfter' },
    { label: 'Set LLM Embedding Model...', key: 'llmEmbeddingModel' },
    { label: 'Set LLM Citation Min Score...', key: 'llmCitationMinScore' }
  ];

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Notebook...', click: () => win.webContents.send('create-notebook-requested') },
        { label: 'Switch Notebook', submenu: notebookItems },
        {
          label: 'Reload Current Notebook',
          click: async () => {
            const current = notebookManager.getCurrentNotebook();
            if (current) {
              await notebookManager.setCurrentNotebook(current);
              notifyNotebookChanged(win);
            }
          }
        },
        { type: 'separator' },
        { label: 'View Day Source', click: () => win.webContents.send('view-day-source-requested') },
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
      label: 'Settings',
      submenu: settingMenuItems.map(({ label, key }) => ({
        label,
        click: () => win.webContents.send('app-setting-requested', key)
      }))
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
  const appSettingsStore = new AppSettingsStore(app.getPath('userData'));
  const embeddingCache = new Map<string, number[]>();
  let embeddingsUnavailableUntil = 0;

  function hashText(input: string): string {
    let hash = 2166136261;
    for (let idx = 0; idx < input.length; idx++) {
      hash ^= input.charCodeAt(idx);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return `${(hash >>> 0).toString(36)}_${input.length}`;
  }

  function putEmbeddingInCache(key: string, embedding: number[]): void {
    embeddingCache.set(key, embedding);
    if (embeddingCache.size > 3000) {
      const oldest = embeddingCache.keys().next().value;
      if (oldest) {
        embeddingCache.delete(oldest);
      }
    }
  }

  async function embedWithProvider(session: LLMSession, input: string): Promise<number[] | null> {
    if (Date.now() < embeddingsUnavailableUntil) {
      return null;
    }

    if (!session.provider || !session.providerConfig.provider) {
      return null;
    }

    const cacheKey = LLMProviderConfig.getCacheKey(session.providerConfig, hashText(input));
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const embedding = await session.provider.embed(input);
      if (embedding && embedding.length > 0) {
        putEmbeddingInCache(cacheKey, embedding);
        return embedding;
      }
    } catch {
      // Ignore transient embedding errors and use keyword fallback
    }

    embeddingsUnavailableUntil = Date.now() + 15_000;
    return null;
  }

  function createNotebookRetriever(notebookPath: string): NotebookRetriever {
    return new NotebookRetriever(
      notebookPath,
      appSettingsStore.getLLMContextBefore(),
      appSettingsStore.getLLMContextAfter()
    );
  }

  function getLLMProviderConfig(): LLMProviderConfig {
    return {
      provider: appSettingsStore.getLLMProvider(),
      baseUrl: appSettingsStore.getLLMBaseUrl(),
      model: appSettingsStore.getLLMModel(),
      embeddingModel: appSettingsStore.getLLMEmbeddingModel(),
    };
  }

  function normalizeLoadedFiles(loadedFiles?: string[]): string[] {
    return Array.from(new Set(
      (loadedFiles ?? [])
        .map(file => file.trim())
        .filter(file => file.length > 0)
        .map(file => file.endsWith('.txt') ? file : `${file}.txt`)
    )).sort();
  }

  async function resolveRetrievalFiles(scope: 'loaded' | 'full', loadedFiles?: string[]): Promise<string[]> {
    if (scope === 'loaded') {
      return normalizeLoadedFiles(loadedFiles);
    }

    return notebookManager.listFiles();
  }

  async function reloadSessionDocuments(session: LLMSession): Promise<void> {
    const notebookPath = await notebookManager.getCurrentNotebookPath();
    const retriever = createNotebookRetriever(notebookPath);
    const retrievalFiles = await resolveRetrievalFiles(session.scope, session.loadedFiles);
    session.retrieved = await retriever.loadNotebook(retrievalFiles);
    session.context = '';
  }

  async function syncSessionWithSettings(session: LLMSession): Promise<void> {
    const latestProviderConfig = getLLMProviderConfig();
    if (!LLMProviderConfig.isSame(session.providerConfig, latestProviderConfig)) {
      session.provider = createLLMProvider(latestProviderConfig);
      session.providerConfig = latestProviderConfig;
      session.context = '';
    }

    
    if (session.retrieved.length === 0) {
      await reloadSessionDocuments(session);
    }

    const latestContextBefore = appSettingsStore.getLLMContextBefore();
    const latestContextAfter = appSettingsStore.getLLMContextAfter();

    if (!session.contextWindow || !session.contextWindow.length || session.contextWindow[0] !== latestContextBefore || session.contextWindow[1] !== latestContextAfter) {
      session.contextWindow = [latestContextBefore, latestContextAfter];
      session.context = '';
    }

  }

  ipcMain.handle('read-file', async (_event: IpcMainInvokeEvent, date: string) => {
    return notebookManager.readFile(date);
  });

  ipcMain.handle('write-file', async (_event: IpcMainInvokeEvent, date: string, content: string) => {
    await notebookManager.writeFile(date, content);
    return true;
  });

  ipcMain.handle('open-file-natively', async (_event: IpcMainInvokeEvent, date: string) => {
    const path = await notebookManager.getLocalPath(date);
    shell.openPath(path);
  });

  ipcMain.handle('list-files', async () => {
    return notebookManager.listFiles();
  });

  ipcMain.handle('list-older-dates', async (_event: IpcMainInvokeEvent, beforeDate: string, limit: number) => {
    return notebookManager.listOlderDates(beforeDate, limit);
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

  ipcMain.handle('set-app-setting', async (
    _event: IpcMainInvokeEvent,
    key: AppSettingKey,
    value: AppSettings[AppSettingKey]
  ) => {
    const parsed = appSettingsStore.setAppSetting(key, value as never);
    return {
      key,
      value: parsed
    };
  });

  ipcMain.handle('get-config', async () => {
    const priorDays = appSettingsStore.getPriorDays();
    const loadMoreDays = appSettingsStore.getLoadMoreDays(priorDays);

    return {
      priorDays,
      loadMoreDays,
      llmProvider: appSettingsStore.getLLMProvider(),
      llmBaseUrl: appSettingsStore.getLLMBaseUrl(),
      llmModel: appSettingsStore.getLLMModel(),
      llmSearchScope: appSettingsStore.getLLMSearchScope(),
      llmContextBefore: appSettingsStore.getLLMContextBefore(),
      llmContextAfter: appSettingsStore.getLLMContextAfter(),
      llmEmbeddingModel: appSettingsStore.getLLMEmbeddingModel(),
      llmCitationMinScore: appSettingsStore.getLLMCitationMinScore(),
      currentNotebook: notebookManager.getCurrentNotebook(),
      notebooks: notebookManager.listNotebooks(),
      notebooksRootDir: notebookManager.getNotebooksRootDir()
    };
  });

  // LLM Chat Session Management
  const llmSessions = new Map<string, LLMSession>();

  function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ipcMain.handle('llm:health-check', async () => {
    try {
      const provider = createLLMProvider(getLLMProviderConfig());
      return await provider.checkHealth();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        error: `LLM check failed: ${errorMsg}`,
        setupGuide: 'Please ensure Ollama is running on your system.',
      };
    }
  });

  ipcMain.handle('llm:start-session', async (
    _event: IpcMainInvokeEvent,
    scope?: 'loaded' | 'full',
    loadedFiles?: string[]
  ) => {
    const sessionId = generateSessionId();
    const resolvedScope = scope === 'full' || scope === 'loaded'
      ? scope
      : appSettingsStore.getLLMSearchScope();
    
    try {
      const providerConfig = getLLMProviderConfig();
      const provider = createLLMProvider(providerConfig);

      // Load notebook files for retrieval
      const notebookPath = await notebookManager.getCurrentNotebookPath();
      const retriever = createNotebookRetriever(notebookPath);
      const retrievalFiles = await resolveRetrievalFiles(resolvedScope, loadedFiles);
      const documents = await retriever.loadNotebook(retrievalFiles);

      llmSessions.set(sessionId, {
        context: '',
        provider,
        providerConfig,
        scope: resolvedScope,
        loadedFiles: retrievalFiles,
        contextWindow: [appSettingsStore.getLLMContextBefore(), appSettingsStore.getLLMContextAfter()],
        messages: [],
        retrieved: documents,
      });

      return { sessionId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to start LLM session: ${errorMsg}`);
    }
  });

  ipcMain.handle('llm:send-message', async (
    event: IpcMainInvokeEvent,
    sessionId: string,
    userMessage: string
  ) => {
    const session = llmSessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    try {
      await syncSessionWithSettings(session);

      // Add user message to history
      session.messages.push({ role: 'user', content: userMessage });

      // Perform retrieval when context is missing (new session or scope changed)
      if (!session.context) {
        const notebookPath = await notebookManager.getCurrentNotebookPath();
        const retriever = createNotebookRetriever(notebookPath);
        const chunks = await retriever.rankAndChunkHybrid(userMessage, session.retrieved, 5, {
          embedText: (input) => embedWithProvider(session, input),
        });
        session.context = retriever.buildContext(chunks);
      }

      // Stream tokens back via push events — async iterables cannot cross IPC
      const tokenGenerator = session.provider.chat(session.messages, session.context);

      (async () => {
        let fullResponse = '';
        try {
          for await (const token of tokenGenerator) {
            // first time we get a token, send a "start" event to allow UI to reset answer area
            if (fullResponse === '') event.sender.send('llm:chunk', sessionId, { type: 'start' });

            fullResponse += token;
            event.sender.send('llm:chunk', sessionId, { type: 'token', content: token });
          }

          session.messages.push({ role: 'assistant', content: fullResponse });

          const notebookPath = await notebookManager.getCurrentNotebookPath();
          const retriever = createNotebookRetriever(notebookPath);
          const chunks = await retriever.rankAndChunkHybrid(userMessage, session.retrieved, 3, {
            embedText: (input) => embedWithProvider(session, input),
            minScore: appSettingsStore.getLLMCitationMinScore(),
            requireKeywordMatch: true,
          });
          event.sender.send('llm:chunk', sessionId, {
            type: 'citations',
            citations: chunks.map(c => ({ date: c.date, snippet: c.snippet })),
          });

          event.sender.send('llm:chunk', sessionId, { type: 'done' });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          event.sender.send('llm:chunk', sessionId, { type: 'error', content: errorMsg });
        }
      })();

      return { started: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM message failed: ${errorMsg}`);
    }
  });

  ipcMain.handle('llm:close-session', async (_event: IpcMainInvokeEvent, sessionId: string) => {
    llmSessions.delete(sessionId);
    return true;
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
