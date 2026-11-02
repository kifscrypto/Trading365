import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import path from 'node:path'
import { AppService } from './service'
import { Store } from './store'
import type { AppState } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let store: Store
let service: AppService

function publish(state: AppState): AppState {
  mainWindow?.webContents.send('state', state)
  return state
}

function validArticleUrl(value: string): URL {
  const url = new URL(value)
  const allowed = /(^|\.)(coindesk\.com|cointelegraph\.com)$/i.test(url.hostname)
  if (url.protocol !== 'https:' || !allowed) throw new Error('This external link is not allowed.')
  return url
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => store.getState())
  ipcMain.handle('state:refresh', async () => publish(await service.refreshAll()))
  ipcMain.handle('watchlist:toggle', async (_event, symbol: string) => publish(await service.toggleWatchlist(symbol)))
  ipcMain.handle('alert:toggle', async (_event, signalId: string) => publish(await service.toggleAlert(signalId)))
  ipcMain.handle('license:activate', async (_event, key: string) => publish(await service.activateLicense(key)))
  ipcMain.handle('calendar:import', async () => {
    if (!mainWindow) return store.getState()
    return publish(await service.importCalendar(mainWindow))
  })
  ipcMain.handle('backup:export', async () => {
    if (!mainWindow) return { saved: false }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export T365 Desk backup',
      defaultPath: `t365-desk-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await store.exportBackup(result.filePath)
    return { saved: true, path: result.filePath }
  })
  ipcMain.handle('external:open', async (_event, value: string) => {
    await shell.openExternal(validArticleUrl(value).toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#070a0f',
    autoHideMenuBar: true,
    show: false,
    title: 'T365 Desk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  const renderer = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer', 'index.html')
    : path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html')
  void mainWindow.loadFile(renderer)
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath('userData'), 't365-desk-state.json'), app.getVersion())
  await store.load()
  service = new AppService(store, (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })
  registerIpc()
  createWindow()
  service.start(publish)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch(error => {
  console.error(error)
  dialog.showErrorBox('T365 Desk could not start', (error as Error).message)
  app.quit()
})

app.on('before-quit', () => service?.stop())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
