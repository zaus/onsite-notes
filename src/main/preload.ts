import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (date: string) => ipcRenderer.invoke('read-file', date),
  writeFile: (date: string, content: string) => ipcRenderer.invoke('write-file', date, content),
  listFiles: () => ipcRenderer.invoke('list-files'),
  getAutocomplete: (prefix: string, type: string) => ipcRenderer.invoke('get-autocomplete', prefix, type),
  indexContent: (date: string, content: string) => ipcRenderer.invoke('index-content', date, content),
  analyze: (startDate: string, endDate: string) => ipcRenderer.invoke('analyze', startDate, endDate),
  getConfig: () => ipcRenderer.invoke('get-config')
});
