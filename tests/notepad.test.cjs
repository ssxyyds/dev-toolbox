const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createNoteStore } = require('../desktop/notepad.cjs');

test('rapid edits retain the latest complete note, including an empty one', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssx-note-store-'));
  const file = path.join(dir, 'notepad.md');
  t.after(async () => { await fs.unlink(file); await fs.rmdir(dir); });
  const store = createNoteStore(dir);
  assert.equal(await store.read(), null);
  const edits = ['# 早', '# 早上好', '# 早上好\n\n**你好**'];
  await Promise.all(edits.map(text => store.write(text)));
  assert.equal(await createNoteStore(dir).read(), edits.at(-1));
  await store.write('');
  assert.equal(await createNoteStore(dir).read(), '');
});
