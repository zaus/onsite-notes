import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (date: string) => ipcRenderer.invoke('read-file', date),
  writeFile: (date: string, content: string) => ipcRenderer.invoke('write-file', date, content),
  openFileNatively: (date: string) => ipcRenderer.invoke('open-file-natively', date),
  listFiles: () => ipcRenderer.invoke('list-files'),
  getAutocomplete: (prefix: string, type: string) => ipcRenderer.invoke('get-autocomplete', prefix, type),
  indexContent: (date: string, content: string) => ipcRenderer.invoke('index-content', date, content),
  analyze: (startDate: string, endDate: string, format: 'text' | 'html' = 'text') => ipcRenderer.invoke('analyze', startDate, endDate, format),
  setNotebook: (name: string) => ipcRenderer.invoke('set-notebook', name),
  listNotebooks: () => ipcRenderer.invoke('list-notebooks'),
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
  onViewDaySourceRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('view-day-source-requested', listener);
    return () => ipcRenderer.removeListener('view-day-source-requested', listener);
  },
  getConfig: () => ipcRenderer.invoke('get-config')
});
