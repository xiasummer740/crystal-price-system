// 闪屏专用 preload（v1.0.232）
//
// 只干一件事：把「直接进入（跳过动画）」按钮的点击送回主进程。
// 闪屏是 data:text/html 页面，默认没有任何 Node 能力；这里用 contextBridge
// 只暴露一个 skip()，不把 ipcRenderer 整个交出去。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('splashAPI', {
  skip: () => ipcRenderer.send('splash:skip')
})
