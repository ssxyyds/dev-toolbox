const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { STARTUP_ARG } = require('../desktop/startup.cjs');

const testName = `SsxToolbox-Test-${process.pid}-${Date.now()}`;
function readRunValue() {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$startupTestKey = Get-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; $startupTestValue = $startupTestKey.GetValue('${testName}'); if ($null -ne $startupTestValue) { ConvertTo-Json -InputObject $startupTestValue -Compress }`], { encoding: 'utf8', windowsHide: true }).trim();
}
function removeTestEntries() {
  if (!/^SsxToolbox-Test-\d+-\d+$/.test(testName)) throw new Error('Invalid test entry name');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$startupTestName = '${testName}'; foreach ($startupTestKey in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32')) { if ((Test-Path -LiteralPath $startupTestKey) -and ((Get-Item -LiteralPath $startupTestKey).GetValueNames() -contains $startupTestName)) { Remove-ItemProperty -LiteralPath $startupTestKey -Name $startupTestName } }`], { windowsHide: true });
}
async function launch() {
  const env = { ...process.env, TOOLBOX_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(process.env.TOOLBOX_EXECUTABLE ? { executablePath: process.env.TOOLBOX_EXECUTABLE, args: [STARTUP_ARG] } : { args: [path.resolve(__dirname, '..'), STARTUP_ARG] }), env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#search', { state: 'attached' });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false, 'Startup stays in the tray');
    await app.evaluate(({ app }, name) => {
      const load = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      globalThis.__startupTest = load('./desktop/startup.cjs').createStartup(app, { name });
    }, testName);
    return app;
  } catch (error) { await app.close(); throw error; }
}

(async () => {
  let app;
  try {
    app = await launch();
    const packaged = await app.evaluate(({ app }) => app.isPackaged);
    assert.equal(await app.evaluate(() => globalThis.__startupTest.isEnabled()), false);
    if (packaged) {
      await app.evaluate(() => {
        const item = globalThis.__startupTest.menuItem(error => { throw error; });
        item.checked = true; item.click(item);
        if (!item.checked) throw new Error('Enabling startup did not update the checkbox');
      });
      const entry = JSON.parse(readRunValue());
      assert.ok(entry.includes(process.env.TOOLBOX_EXECUTABLE)); assert.ok(entry.includes(STARTUP_ARG));
      await app.evaluate(({ app }, name) => {
        app.setLoginItemSettings({ name, path: process.execPath, args: ['--startup'], openAtLogin: true, enabled: false });
        if (globalThis.__startupTest.menuItem(() => {}).checked) throw new Error('Windows-disabled startup still appears checked');
        globalThis.__startupTest.setEnabled(true);
      }, testName);
    } else {
      assert.equal(await app.evaluate(() => globalThis.__startupTest.menuItem(() => {}).enabled), false);
      assert.equal(readRunValue(), '');
    }
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [process.execPath, '--startup']));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false, 'Repeated auto-start does not open a window');
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [process.execPath]));
    const page = await app.firstWindow();
    await page.waitForFunction(() => document.hasFocus());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true, 'Manual launch opens the existing instance');
    await app.close(); app = null;
    if (packaged) {
      app = await launch();
      assert.equal(await app.evaluate(() => globalThis.__startupTest.menuItem(() => {}).checked), true, 'Startup choice persists across restarts');
      await app.evaluate(() => {
        const item = globalThis.__startupTest.menuItem(error => { throw error; });
        item.checked = false; item.click(item);
        if (item.checked) throw new Error('Disabling startup did not update the checkbox');
      });
      assert.equal(readRunValue(), '', 'Disabling removes the Run entry');
    }
    console.log(`PASS: ${packaged ? 'Real Windows startup registration, checkbox, system-disabled state, persistence and removal; ' : 'Development startup remains disabled; '}background launch and second-instance behavior.`);
  } finally {
    try {
      if (app) { try { await app.evaluate(() => { if (globalThis.__startupTest?.supported) globalThis.__startupTest.setEnabled(false); }); } finally { await app.close(); } }
    } finally { removeTestEntries(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
