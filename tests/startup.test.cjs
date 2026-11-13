const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStartup, STARTUP_ARG, STARTUP_NAME } = require('../desktop/startup.cjs');

function fakeApp() {
  return {
    isPackaged: true, openAtLogin: false, approved: true, writes: [], reads: [],
    getLoginItemSettings(options) {
      this.reads.push(options);
      return { openAtLogin: false, launchItems: this.openAtLogin ? [{ name: STARTUP_NAME, scope: 'user', enabled: this.approved }] : [] };
    },
    setLoginItemSettings(settings) {
      this.writes.push(settings);
      this.openAtLogin = settings.openAtLogin;
      this.approved = settings.enabled;
    }
  };
}
const options = { platform: 'win32', executablePath: 'D:\\Apps\\Ssx Toolbox\\SsxToolbox.exe' };

test('Startup uses the packaged executable, one stable entry and the same background flag for reading and writing', () => {
  const app = fakeApp();
  const startup = createStartup(app, options);
  assert.equal(startup.isEnabled(), false);
  assert.equal(app.writes.length, 0);
  startup.setEnabled(true);
  assert.equal(startup.isEnabled(), true);
  assert.deepEqual(app.writes[0], { path: options.executablePath, args: [STARTUP_ARG], name: STARTUP_NAME, openAtLogin: true, enabled: true });
  for (const read of app.reads) assert.deepEqual(read, { path: options.executablePath, args: [STARTUP_ARG] });
  startup.setEnabled(false);
  assert.equal(startup.isEnabled(), false);
  assert.equal(app.writes.at(-1).openAtLogin, false);
});

test('Development and non-Windows processes cannot register themselves for startup', () => {
  for (const config of [{ packaged: false, platform: 'win32' }, { packaged: true, platform: 'linux' }]) {
    const app = fakeApp(); app.isPackaged = config.packaged;
    const startup = createStartup(app, { ...options, platform: config.platform });
    assert.equal(startup.supported, false);
    assert.equal(startup.menuItem(() => {}).enabled, false);
    assert.throws(() => startup.setEnabled(true), /打包版本/);
    assert.equal(app.writes.length, 0); assert.equal(app.reads.length, 0);
  }
});

test('Tray checkbox reflects Windows disabling a startup item and can re-enable it', () => {
  const app = fakeApp(); app.openAtLogin = true; app.approved = false;
  const startup = createStartup(app, options);
  const item = startup.menuItem(error => { throw error; });
  assert.equal(item.checked, false);
  item.checked = true; item.click(item);
  assert.equal(item.checked, true); assert.equal(app.approved, true);
  item.checked = false; item.click(item);
  assert.equal(item.checked, false); assert.equal(app.openAtLogin, false);
});

test('Failed startup writes restore the real checkbox state and report an actionable error', () => {
  const app = fakeApp(); app.setLoginItemSettings = () => {};
  const startup = createStartup(app, options);
  let reported;
  const item = startup.menuItem(error => { reported = error.message; });
  item.checked = true; item.click(item);
  assert.equal(item.checked, false); assert.match(reported, /没有生效/);
  assert.throws(() => startup.setEnabled('true'), /无效/);
});

test('Unrelated startup entries do not mark the toolbox as enabled', () => {
  const app = fakeApp();
  app.getLoginItemSettings = () => ({ openAtLogin: true, launchItems: [
    { name: 'OtherApp', scope: 'user', enabled: true },
    { name: STARTUP_NAME, scope: 'machine', enabled: true }
  ] });
  assert.equal(createStartup(app, options).isEnabled(), false);
});
