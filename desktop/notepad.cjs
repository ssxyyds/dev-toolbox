'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function createNoteStore(directory) {
  const file = path.join(directory, 'notepad.md');
  const temp = file + '.tmp';
  let pending, writing;
  async function drain() {
    try {
      while (pending !== undefined) {
        const text = pending;
        pending = undefined;
        await fs.writeFile(temp, text, { encoding: 'utf8', flush: true, mode: 0o600 });
        await fs.rename(temp, file);
      }
    } finally {
      writing = undefined;
    }
  }
  return {
    async read() {
      await writing;
      try { return await fs.readFile(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    write(text) {
      pending = text;
      return writing ??= drain();
    },
    get writing() { return writing; }
  };
}
module.exports = { createNoteStore };
