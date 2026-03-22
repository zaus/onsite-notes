import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (date: string) => ipcRenderer.invoke('read-file', date),
  writeFile: (date: string, content: string) => ipcRenderer.invoke('write-file', date, content),
  openFileNatively: (date: string) => ipcRenderer.invoke('open-file-natively', date),
  listFiles: () => ipcRenderer.invoke('list-files'),
  listOlderDates: (beforeDate: string, limit: number) => ipcRenderer.invoke('list-older-dates', beforeDate, limit),
  getAutocomplete: (prefix: string, type: string) => ipcRenderer.invoke('get-autocomplete', prefix, type),
  indexContent: (date: string, content: string) => ipcRenderer.invoke('index-content', date, content),
  analyze: (startDate: string, endDate: string, format: 'text' | 'html' = 'text') => ipcRenderer.invoke('analyze', startDate, endDate, format),
  setNotebook: (name: string) => ipcRenderer.invoke('set-notebook', name),
  listNotebooks: () => ipcRenderer.invoke('list-notebooks'),
  setPriorDays: (days: number) => ipcRenderer.invoke('set-prior-days', days),
  setLoadMoreDays: (days: number) => ipcRenderer.invoke('set-load-more-days', days),
  onNotebookChanged: (callback: (payload: { currentNotebook: string; notebooks: string[] }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { currentNotebook: string; notebooks: string[] }) => {
      callback(payload);
    };
    ipcRenderer.on('notebook-changed', listener);
    return () => ipcRenderer.removeListener('notebook-changed', listener);
  },
  onCreateNotebookRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('create-notebook-requested', listener);
    return () => ipcRenderer.removeListener('create-notebook-requested', listener);
  },
  onSetLoadMoreDaysRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('set-load-more-chunk-requested', listener);
    return () => ipcRenderer.removeListener('set-load-more-chunk-requested', listener);
  },
  onSetPriorDaysRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('set-prior-days-requested', listener);
    return () => ipcRenderer.removeListener('set-prior-days-requested', listener);
  },
  onViewDaySourceRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('view-day-source-requested', listener);
    return () => ipcRenderer.removeListener('view-day-source-requested', listener);
  },
  getConfig: () => ipcRenderer.invoke('get-config')
});

contextBridge.exposeInMainWorld('electron', {
  llmChat: {
    startSession: (scope: 'loaded' | 'full') => ipcRenderer.invoke('llm:start-session', scope),
    sendMessage: (sessionId: string, userMessage: string) => ipcRenderer.invoke('llm:send-message', sessionId, userMessage),
    closeSession: (sessionId: string) => ipcRenderer.invoke('llm:close-session', sessionId),
    checkLLMHealth: () => ipcRenderer.invoke('llm:health-check'),
    onChunk: (callback: (sessionId: string, chunk: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, sessionId: string, chunk: any) => callback(sessionId, chunk);
      ipcRenderer.on('llm:chunk', listener);
      return () => ipcRenderer.removeListener('llm:chunk', listener);
    },
  },
});
