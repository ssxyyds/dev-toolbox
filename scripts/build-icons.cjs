const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = await fs.readFile(path.join(root, 'assets/icon.svg'), 'utf8');
  const dir = path.join(root, '.impeccable/icons');
  await fs.mkdir(dir, { recursive: true });
  const html = path.join(dir, 'render.html');
  await fs.writeFile(html, `<html><style>html,body{margin:0;background:transparent}svg{display:block;width:256px;height:256px}</style>${svg}</html>`);
  const env = { ...process.env, TOOLBOX_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const sizes = [16, 20, 24, 32, 48, 64, 128, 256], images = [];
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#search');
    await app.evaluate(async ({ BrowserWindow }, file) => { const win = BrowserWindow.getAllWindows()[0]; await win.loadFile(file); win.show(); }, html);
    for (const size of sizes) {
      await page.locator('svg').evaluate((el, size) => { el.style.width = size + 'px'; el.style.height = size + 'px'; }, size);
      const png = await page.locator('svg').screenshot({ omitBackground: true });
      images.push(png);
      await fs.writeFile(path.join(dir, `icon-${size}.png`), png);
    }
  } finally { await app.close(); }
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + 16 * index;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await fs.writeFile(path.join(root, 'assets/icon.ico'), Buffer.concat([header, ...images]));
  await fs.writeFile(path.join(root, 'assets/icon.png'), images.at(-1));
  console.log('Created PNG and multi-resolution ICO from assets/icon.svg: ' + sizes.join(', '));
})().catch(error => { console.error(error); process.exitCode = 1; });
