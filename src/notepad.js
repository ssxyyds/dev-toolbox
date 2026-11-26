'use strict';

const notepad = (() => {
  const key = 'ssx-toolbox.notepad.v1';
  const input = document.getElementById('note-input');
  const preview = document.getElementById('note-preview');
  const toggleButton = document.getElementById('note-toggle');
  const status = document.getElementById('note-status');
  const retry = document.getElementById('note-retry');
  const desktop = window.desktop;
  let loaded = false, loading = false, parser, revision = 0;

  function error(text = '') {
    status.textContent = text;
    document.getElementById('note-error').hidden = !text;
  }
  async function open() {
    showEditor();
    if (loaded || loading) return;
    loading = true;
    input.readOnly = true;
    try {
      let text = desktop ? await desktop.readNote() : localStorage.getItem(key);
      if (desktop && text === null) {
        text = localStorage.getItem(key);
        if (text !== null) {
          await desktop.writeNote(text);
          localStorage.removeItem(key);
        }
      }
      input.value = text ?? '';
      loaded = true;
      input.readOnly = false;
      error();
    } catch {
      error('无法读取笔记，请重试。');
    } finally {
      loading = false;
    }
  }
  async function save() {
    if (!loaded) return;
    const current = ++revision;
    try {
      if (desktop) await desktop.writeNote(input.value);
      else localStorage.setItem(key, input.value);
      if (current === revision) error();
    } catch {
      if (current === revision) error('未能保存，请重试或复制正文备份。');
    }
  }
  function showEditor() {
    preview.hidden = true;
    input.hidden = false;
    toggleButton.textContent = '预览';
    toggleButton.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    if (!preview.hidden) {
      showEditor();
      input.focus();
      return;
    }
    if (!parser) {
      parser = window.markdownit({ html: false }).disable('image');
      for (const tag of ['th_open', 'td_open']) {
        parser.renderer.rules[tag] = (tokens, i, options, env, renderer) => {
          const align = /^text-align:(left|center|right)$/.exec(tokens[i].attrGet('style'));
          if (align) tokens[i].attrs[tokens[i].attrIndex('style')] = ['class', `note-align-${align[1]}`];
          return renderer.renderToken(tokens, i, options);
        };
      }
      // Notes are offline: display link labels without navigating away.
      parser.renderer.rules.link_open = () => '<span class="note-link">';
      parser.renderer.rules.link_close = () => '</span>';
    }
    if (input.value.trim()) preview.innerHTML = parser.render(input.value);
    else preview.textContent = '还没有内容，返回编辑开始写。';
    preview.hidden = false;
    input.hidden = true;
    toggleButton.textContent = '返回编辑';
    toggleButton.setAttribute('aria-expanded', 'true');
    preview.scrollTop = 0;
    preview.focus();
  }
  input.addEventListener('input', save);
  toggleButton.onclick = toggle;
  retry.onclick = () => loaded ? save() : open();
  return { open, toggle, focusId: () => preview.hidden ? input.id : preview.id };
})();
