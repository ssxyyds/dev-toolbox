const { app, BrowserWindow, globalShortcut, clipboard, Tray, Menu, ipcMain, screen, dialog, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createNoteStore } = require('./notepad.cjs');
const { isJsonDocument, MAX_JSON } = require('../src/core.js');
const { createStartup, STARTUP_ARG } = require('./startup.cjs');
let window, tray, quitting = false, shortcutReady = false, wakeSequence = 0;
const startupLaunch = process.argv.includes(STARTUP_ARG);
const testing = process.env.TOOLBOX_TEST === '1';
const accelerator = testing ? 'Control+Alt+Shift+F10' : 'Control+Space';
const compactSize = { width: 720, height: 580 };
const workspaceSize = { width: 1060, height: 740 };
if (testing) app.setPath('userData', path.join(app.getPath('temp'), 'ssx-toolbox-test-' + process.pid));
const lock = testing || app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  let windowReady = false, pendingWake = startupLaunch ? null : false;
  let expanded = false, boundsExpanded = false;
  const notes = createNoteStore(app.getPath('userData'));
  const sizes = [compactSize, workspaceSize];
  function dimensions(size, area) {
    return { width: Math.max(380, Math.min(size.width, area.width - 16)), height: Math.max(400, Math.min(size.height, area.height - 16)) };
  }
  function initialBounds() {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const { width, height } = dimensions(compactSize, area);
    return { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + Math.max(16, (area.height - height) / 3)) };
  }
  function applyWindowSize() {
    if (boundsExpanded === expanded || !window || window.isDestroyed() || window.isMaximized() || window.isMinimized()) return;
    const current = window.getBounds();
    const area = screen.getDisplayMatching(current).workArea;
    const { width, height } = dimensions(sizes[Number(expanded)], area);
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    const x = clamp(Math.round(current.x + (current.width - width) / 2), area.x, area.x + area.width - width);
    const y = clamp(current.y, area.y, area.y + area.height - height);
    sizes[Number(boundsExpanded)] = { width: current.width, height: current.height };
    boundsExpanded = expanded;
    window.setBounds({ x, y, width, height });
  }
  async function wake(readClipboard = true) {
    if (!windowReady) { pendingWake = readClipboard; return; }
    if (!window || window.isDestroyed()) return;
    const sequence = ++wakeSequence;
    let json = null;
    if (readClipboard) {
      try {
        const text = await clipboard.readText();
        if (isJsonDocument(text)) json = text;
      } catch { /* A locked clipboard must not prevent opening the launcher. */ }
    }
    if (sequence !== wakeSequence || !window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
    window.webContents.send('app:wake', { json });
  }
  app.whenReady().then(() => {
    app.setAppUserModelId('ssx.toolbox');
    const startup = createStartup(app);
    Menu.setApplicationMenu(null);
    window = new BrowserWindow({
      ...initialBounds(), show: false, frame: false, resizable: true, minWidth: 380, minHeight: 400,
      title: 'Ssx 工具箱', backgroundColor: nativeTheme.shouldUseDarkColors ? '#111113' : '#f7f7f8', icon: path.join(__dirname, '../assets/icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('devtools:') }));
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    const trusted = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
    const windowState = () => ({ maximized: window.isMaximized() });
    const sendWindowState = () => { if (windowReady) window.webContents.send('window:state', windowState()); };
    window.on('maximize', sendWindowState);
    window.on('unmaximize', () => { applyWindowSize(); sendWindowState(); });
    window.on('restore', applyWindowSize);
    ipcMain.on('window:hide', event => { if (trusted(event)) window.hide(); });
    ipcMain.on('window:minimize', event => { if (trusted(event)) window.minimize(); });
    ipcMain.on('window:toggle-maximize', event => {
      if (!trusted(event)) return;
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    });
    ipcMain.on('window:resize', (event, requested) => {
      if (!trusted(event) || typeof requested !== 'boolean') return;
      expanded = requested;
      applyWindowSize();
    });
    ipcMain.handle('note:read', event => {
      if (!trusted(event)) throw new Error('无法读取笔记。');
      return notes.read();
    });
    ipcMain.handle('note:write', (event, text) => {
      if (!trusted(event) || typeof text !== 'string') throw new Error('无法保存笔记。');
      return notes.write(text);
    });
    ipcMain.handle('clipboard:copy', async (event, text) => {
      if (!trusted(event) || typeof text !== 'string' || text.length > MAX_JSON * 16) throw new Error('无法复制此内容。');
      await clipboard.writeText(text); return true;
    });
    ipcMain.handle('app:status', event => trusted(event) ? { shortcutReady, ...windowState() } : null);
    ipcMain.handle('json:save', async (event, text) => {
      if (!trusted(event) || typeof text !== 'string' || text.length > MAX_JSON * 16) throw new Error('无法保存此内容。');
      const result = await dialog.showSaveDialog(window, { title: '保存 JSON', defaultPath: 'formatted.json', filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      await fs.writeFile(result.filePath, text, 'utf8'); return true;
    });
    shortcutReady = globalShortcut.register(accelerator, () => wake(true));
    tray = new Tray(path.join(__dirname, '../assets/icon.ico'));
    tray.setToolTip('Ssx 工具箱 · Ctrl + 空格');
    const refreshTrayMenu = () => tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开工具箱', click: () => wake(false) },
      { label: shortcutReady ? '快捷键：Ctrl + 空格' : 'Ctrl + 空格被占用，请关闭冲突应用后重启', enabled: false },
      { type: 'separator' },
      startup.menuItem(error => dialog.showErrorBox('无法更改开机启动', error.message)),
      { type: 'separator' }, { label: '退出工具箱', click: () => app.quit() }
    ]));
    refreshTrayMenu();
    tray.on('right-click', refreshTrayMenu);
    tray.on('double-click', () => wake(false));
    window.webContents.once('did-finish-load', () => {
      windowReady = true;
      if (pendingWake !== null) wake(pendingWake);
      pendingWake = null;
    });
    window.loadFile(path.join(__dirname, '../src/index.html'));
  });
  app.on('second-instance', (_event, commandLine) => { if (!commandLine.includes(STARTUP_ARG)) wake(false); });
  app.on('activate', () => wake(false));
  app.on('before-quit', event => {
    if (!notes.writing) { quitting = true; return; }
    event.preventDefault();
    notes.writing.then(() => app.quit(), () => { window?.show(); });
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); tray?.destroy(); });
  app.on('window-all-closed', () => {});
}
