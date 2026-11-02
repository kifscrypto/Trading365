import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, T365Api } from '../shared/types'

const api: T365Api = {
  getPartners: () => ipcRenderer.invoke('partners:get'),
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('state:refresh'),
  toggleWatchlist: symbol => ipcRenderer.invoke('watchlist:toggle', symbol),
  toggleAlert: signalId => ipcRenderer.invoke('alert:toggle', signalId),
  importCalendar: () => ipcRenderer.invoke('calendar:import'),
  activateLicense: key => ipcRenderer.invoke('license:activate', key),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  openPartner: partnerId => ipcRenderer.invoke('partner:open', partnerId),
  onState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state)
    ipcRenderer.on('state', listener)
    return () => { ipcRenderer.removeListener('state', listener) }
  },
}

contextBridge.exposeInMainWorld('t365', api)
