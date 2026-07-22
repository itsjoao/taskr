const { contextBridge, ipcRenderer, webFrame } = require('electron')

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  isDev: () => ipcRenderer.invoke('app:isDev'),

  // main asks the renderer to flush pending edits before the app closes
  onFlush: (handler) => {
    ipcRenderer.on('app:flush', async () => {
      try {
        await handler()
      } finally {
        ipcRenderer.send('app:flush-done')
      }
    })
  },

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    onMaximizeChange: (handler) => {
      ipcRenderer.on('win:maximized', (_e, isMax) => handler(isMax))
    }
  },

  io: {
    save: (payload) => ipcRenderer.invoke('io:save', payload),
    copy: (text) => ipcRenderer.invoke('io:copy', text),
    open: () => ipcRenderer.invoke('io:open')
  },

  link: {
    pickFolder: (startIn) => ipcRenderer.invoke('link:pickFolder', startIn),
    pickFiles: (startIn) => ipcRenderer.invoke('link:pickFiles', startIn),
    open: (target) => ipcRenderer.invoke('link:open', target),
    reveal: (target) => ipcRenderer.invoke('link:reveal', target)
  },

  zoom: {
    get: () => webFrame.getZoomFactor(),
    set: (factor) => webFrame.setZoomFactor(factor)
  }
})
