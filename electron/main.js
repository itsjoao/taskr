const { app, BrowserWindow, ipcMain, dialog, clipboard, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

let win = null

/* All data lives in Documents\taskr, in the open: a JSON with the tasks and one
   plain .txt per day of notes. Nothing is hidden inside the app's userData. */
function documentsDir() {
  try {
    return app.getPath('documents')
  } catch (err) {
    return app.getPath('userData')
  }
}

const dataDir = () => path.join(documentsDir(), 'taskr')
const notesDir = () => path.join(dataDir(), 'notes')
const dataFile = () => path.join(dataDir(), 'tracker-data.json')
const backupFile = () => path.join(dataDir(), 'tracker-data.bak.json')
const tmpFile = () => path.join(dataDir(), 'tracker-data.tmp.json')

function ensureDirs() {
  fs.mkdirSync(notesDir(), { recursive: true })
}

// Installs from before the move kept their data under %APPDATA%. On the first
// run in the new Documents home, bring that file across once, leaving the
// original untouched as a fallback.
function migrateLegacyData() {
  if (fs.existsSync(dataFile())) return // already have data in the new home
  const appData = app.getPath('appData')
  const candidates = [
    app.getPath('userData'), // %APPDATA%\taskr
    path.join(appData, 'Task Tracker')
  ]
  for (const dir of candidates) {
    if (dir === dataDir()) continue
    const from = path.join(dir, 'tracker-data.json')
    if (!fs.existsSync(from)) continue
    try {
      fs.copyFileSync(from, dataFile())
      const bak = path.join(dir, 'tracker-data.bak.json')
      if (fs.existsSync(bak) && !fs.existsSync(backupFile())) fs.copyFileSync(bak, backupFile())
      return
    } catch (err) {
      // a failed migration must not stop the app from starting
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// The date comes from the renderer and becomes a file name — never trust it.
const noteFile = (date) => {
  if (!DATE_RE.test(String(date))) return null
  return path.join(notesDir(), `${date}.txt`)
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (!raw.trim()) return null
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function loadData() {
  let data = readJson(dataFile())
  if (data) return { data, recovered: false }

  // main file missing or corrupt -> try the rotating backup
  data = readJson(backupFile())
  if (data) return { data, recovered: true }

  return { data: null, recovered: false }
}

function saveData(data) {
  const json = JSON.stringify(data, null, 2)
  ensureDirs()

  // keep one rotating backup of the last known-good file
  try {
    if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), backupFile())
  } catch (err) {
    // a failed backup must not block the save
  }

  // atomic write: full file lands on disk before it replaces the real one
  fs.writeFileSync(tmpFile(), json, 'utf8')
  fs.renameSync(tmpFile(), dataFile())
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#F4F2EE',
    title: 'taskr',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'))

  // keep the custom maximize glyph in sync with the real window state
  const sendMax = () => {
    if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized())
  }
  win.on('maximize', sendMax)
  win.on('unmaximize', sendMax)
  win.webContents.on('did-finish-load', sendMax)

  // F12 / Ctrl+Shift+I toggles devtools instead of it opening on every launch
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const toggle =
      input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')
    if (toggle) {
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
      else win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // dev-only: TT_SHOT=<file> renders the window to a PNG and exits.
  // TT_SHOT_JS optionally runs first, to set up the state worth looking at.
  if (isDev && process.env.TT_SHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.TT_SHOT_JS) await win.webContents.executeJavaScript(process.env.TT_SHOT_JS)
          // an occluded window stops producing frames and captures blank
          win.show()
          win.focus()
          win.moveTop()
          await new Promise((r) => setTimeout(r, 900))
          const img = await win.webContents.capturePage()
          fs.writeFileSync(process.env.TT_SHOT, img.toPNG())
          console.log('[shot]', process.env.TT_SHOT)
        } catch (err) {
          console.error('[shot] failed:', err)
        }
        app.exit(0)
      }, 1200)
    })
  }

  if (isDev) {
    // surface renderer logs in the terminal, skipping devtools' own noise
    win.webContents.on('console-message', (_e, _level, message, _line, sourceId) => {
      if (sourceId && sourceId.startsWith('devtools://')) return
      console.log('[renderer]', message)
    })
  }
}

ipcMain.handle('data:load', () => loadData())

ipcMain.handle('data:save', (_evt, data) => {
  try {
    saveData(data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) }
  }
})

ipcMain.handle('app:isDev', () => isDev)

ipcMain.handle('app:dataDir', () => dataDir())

/* ---------- notes: one .txt per day, inside Documents\taskr\notes ---------- */

ipcMain.handle('notes:read', (_evt, date) => {
  const file = noteFile(date)
  if (!file) return { ok: false, text: '' }
  try {
    if (!fs.existsSync(file)) return { ok: true, text: '' }
    return { ok: true, text: fs.readFileSync(file, 'utf8') }
  } catch (err) {
    return { ok: false, text: '', error: String(err.message || err) }
  }
})

ipcMain.handle('notes:write', (_evt, { date, text }) => {
  const file = noteFile(date)
  if (!file) return { ok: false, error: 'bad date' }
  try {
    ensureDirs()
    // an emptied note leaves no file behind
    if (!String(text || '').trim()) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return { ok: true, removed: true }
    }
    fs.writeFileSync(file, text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
})

ipcMain.handle('notes:dates', () => {
  try {
    if (!fs.existsSync(notesDir())) return []
    return fs
      .readdirSync(notesDir())
      .filter((f) => f.endsWith('.txt') && DATE_RE.test(f.slice(0, -4)))
      .map((f) => f.slice(0, -4))
      .sort()
  } catch (err) {
    return []
  }
})

/* ---------- native dialogs ----------
   Every dialog below is modal on the window, which disables it until dismissed.
   If a second one were ever requested while the first is open, the window would
   stay disabled with nothing visible to dismiss — a hard freeze. One at a time. */

let dialogOpen = false

async function withDialog(fn) {
  if (dialogOpen) return { ok: false, busy: true }
  dialogOpen = true
  try {
    return await fn()
  } finally {
    dialogOpen = false
    // the window can stay disabled behind a dismissed modal; make sure it is back
    if (win && !win.isDestroyed()) {
      win.setEnabled(true)
      win.focus()
    }
  }
}

/* ---------- export / import ---------- */

ipcMain.handle('io:save', async (_evt, { defaultName, content, kind }) => withDialog(async () => {
  const filters =
    kind === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }]
      : [{ name: 'Text', extensions: ['txt', 'md'] }]
  const res = await dialog.showSaveDialog(win, {
    title: 'Export',
    defaultPath: defaultName,
    filters
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(res.filePath, content, 'utf8')
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}))

ipcMain.handle('io:copy', (_evt, text) => {
  clipboard.writeText(text)
  return { ok: true }
})

ipcMain.handle('io:open', async () => withDialog(async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Import backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  try {
    const raw = fs.readFileSync(res.filePaths[0], 'utf8')
    return { ok: true, raw, path: res.filePaths[0] }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}))

/* ---------- links to folders and files ---------- */

ipcMain.handle('link:pickFolder', async (_evt, startIn) => withDialog(async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose the epic folder',
    defaultPath: startIn && fs.existsSync(startIn) ? startIn : undefined,
    properties: ['openDirectory']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  return { ok: true, path: res.filePaths[0] }
}))

// startIn is the epic's folder, so the picker lands there and any file inside
// it (or in a subfolder) is one navigation away.
ipcMain.handle('link:pickFiles', async (_evt, startIn) => withDialog(async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Link file(s)',
    defaultPath: startIn && fs.existsSync(startIn) ? startIn : undefined,
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  return {
    ok: true,
    files: res.filePaths.map((p) => ({ path: p, name: path.basename(p) }))
  }
}))

// openPath returns a non-empty string on failure (missing file, no handler)
ipcMain.handle('link:open', async (_evt, target) => {
  if (!fs.existsSync(target)) return { ok: false, error: 'path not found' }
  const err = await shell.openPath(target)
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('link:reveal', (_evt, target) => {
  if (!fs.existsSync(target)) return { ok: false, error: 'path not found' }
  shell.showItemInFolder(target)
  return { ok: true }
})

/* ---------- custom window controls (frame: false) ---------- */

ipcMain.on('win:minimize', () => win && win.minimize())
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('win:close', () => win && win.close())

// Before quitting, give the renderer a chance to flush its debounced autosave.
let flushed = false
ipcMain.on('app:flush-done', () => {
  flushed = true
  app.quit()
})

app.on('before-quit', (evt) => {
  if (flushed || !win || win.isDestroyed()) return
  evt.preventDefault()
  win.webContents.send('app:flush')
  // don't hang forever if the renderer is wedged
  setTimeout(() => {
    if (!flushed) {
      flushed = true
      app.quit()
    }
  }, 1500)
})

// Two copies running would fight over the same data file, and the second window
// looks like a frozen duplicate. Hand the launch to the window already open.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.setEnabled(true)
    win.show()
    win.focus()
  })

  app.whenReady().then(() => {
    ensureDirs()
    migrateLegacyData()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
