'use strict';

const STARTUP_ARG = '--startup';
const STARTUP_NAME = 'SsxToolbox';

function createStartup(app, { platform = process.platform, executablePath = process.execPath, name = STARTUP_NAME } = {}) {
  const supported = platform === 'win32' && app.isPackaged;
  const options = { path: executablePath, args: [STARTUP_ARG] };
  function isEnabled() {
    if (!supported) return false;
    const settings = app.getLoginItemSettings(options);
    // openAtLogin checks Electron's default entry; this app uses a stable custom name.
    return settings.launchItems.some(item => item.name === name && item.scope === 'user' && item.enabled);
  }
  function setEnabled(enabled) {
    if (!supported) throw new Error('请使用 Windows 打包版本设置开机启动。');
    if (typeof enabled !== 'boolean') throw new Error('开机启动设置无效，请重试。');
    app.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled });
    if (isEnabled() !== enabled) throw new Error('设置没有生效，请检查 Windows 启动应用设置后重试。');
  }
  function menuItem(onError) {
    return {
      id: 'startup', label: supported ? '开机启动' : '开机启动（仅限 Windows 打包版）',
      type: 'checkbox', enabled: supported, checked: isEnabled(),
      click(item) {
        try { setEnabled(item.checked); }
        catch (error) { onError(error); }
        finally { item.checked = isEnabled(); }
      }
    };
  }
  return { supported, isEnabled, setEnabled, menuItem };
}

module.exports = { createStartup, STARTUP_ARG, STARTUP_NAME };
