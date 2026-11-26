'use strict';

const $ = id => document.getElementById(id);
const {
  transformJson, isJsonDocument, encodeBase64, decodeBase64, timestampToBeijing,
  beijingToTimestamp, generatePasswords, generateUuids, MAX_JSON
} = ToolCore;
const native = window.desktop;
const MAIN = $('main');
const SEARCH = $('search');
const JSON_EDITOR = $('json-output');
const BASE64_EXAMPLE = '你好，Ssx 工具箱 👋';
const TOOLS = {
  json: { aliases: 'json 格式化 压缩 校验 展开 嵌套 geshihua', focus: 'json-output', shortcut: ['Ctrl + Enter', '格式化'] },
  password: { aliases: 'password pass pwd 密码 随机 mima suiji uuid guid 唯一标识', focus: () => $('generator-mode').value === 'uuid' ? 'count' : 'length', shortcut: ['Enter', '生成'] },
  base64: { aliases: 'base64编码 base64解码 base64url b64 utf-8 jiema bianma', focus: 'base64-input', shortcut: ['Ctrl + Enter', '转换'] },
  note: { aliases: '笔记 便签 markdown md note notepad jishiben biji', focus: () => notepad.focusId(), shortcut: ['Ctrl + Enter', '编辑 / 预览'] },
  timestamp: { aliases: 'timestamp time unix 时间戳转北京时间 北京时间转时间戳 日期转时间戳 日期时间 shijian shijianchuo beijing', focus: 'timestamp-input', shortcut: ['Enter', '转换'] }
};
const rows = [...document.querySelectorAll('.tool-row')];
const number = new Intl.NumberFormat('zh-CN');
let activeTool = null, selected = 0, toastTimer;
let clipboardJson = null;
let jsonDocument = null, beforeJsonExpansion = null, jsonRevision = 0;
let base64RawInput = null, base64Result = null;
let timestampMode = 'to-date';
const timestampUnits = { 'to-date': 'auto', 'to-unix': 'seconds' };
let passwords = [];

function showToast(text, error = false) {
  $('toast-text').textContent = text;
  $('toast-icon').setAttribute('href', error ? '#icon-warning' : '#icon-check');
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2100);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}

function message(id, text, state = 'info') {
  const target = $(id);
  target.textContent = text;
  target.classList.toggle('error', state === 'error');
  target.classList.toggle('success', state === 'success');
  target.hidden = !text;
}

async function copy(text) {
  try {
    if (native) await native.copy(text);
    else await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板');
  } catch {
    showToast('复制失败，请选中内容后手动复制。', true);
  }
}

function mode(name) { return document.querySelector(`input[name="${name}"]:checked`).value; }
function isComposing(event) { return event.isComposing || event.keyCode === 229; }
function visibleRows() { return rows.filter(row => !row.hidden); }

function highlight(scroll = false) {
  const row = visibleRows()[selected];
  rows.forEach(option => option.setAttribute('aria-selected', String(option === row)));
  if (row) {
    SEARCH.setAttribute('aria-activedescendant', row.id);
    if (scroll) row.scrollIntoView({ block: 'nearest' });
  } else SEARCH.removeAttribute('aria-activedescendant');
}

function filterTools() {
  const query = SEARCH.value.normalize('NFKC').trim().toLowerCase();
  const terms = query ? query.split(/\s+/) : [];
  rows.forEach(row => {
    const text = `${row.querySelector('.tool-info').textContent} ${TOOLS[row.dataset.tool].aliases}`.toLowerCase();
    row.hidden = !terms.every(term => text.includes(term));
  });
  const count = visibleRows().length;
  $('tool-list').hidden = count === 0;
  $('no-results').hidden = count !== 0;
  $('clear-search').hidden = !SEARCH.value;
  $('list-label').textContent = query ? '搜索结果' : '全部工具';
  $('result-count').textContent = `${count} 个工具`;
  SEARCH.setAttribute('aria-expanded', String(count !== 0));
  selected = 0;
  highlight();
}

function clearSearch() {
  SEARCH.value = '';
  filterTools();
  updateShortcuts();
  SEARCH.focus({ preventScroll: true });
}

function updateShortcuts() {
  const shortcuts = activeTool
    ? [TOOLS[activeTool].shortcut, ['Esc', '返回']]
    : [['↑', '↓', '选择'], ['Enter', '打开'], ['Esc', SEARCH.value ? '清除' : '隐藏']];
  $('footer-tip').replaceChildren(...shortcuts.map(shortcut => {
    const hint = document.createElement('span');
    hint.className = 'shortcut-hint';
    for (const key of shortcut.slice(0, -1)) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      hint.append(kbd);
    }
    hint.append(shortcut.at(-1));
    return hint;
  }));
}

function focusCurrent() {
  if (!activeTool) return SEARCH.focus({ preventScroll: true });
  const target = TOOLS[activeTool].focus;
  $(typeof target === 'function' ? target() : target).focus({ preventScroll: true });
}

function home() {
  if (activeTool) native?.resize(false);
  hideToast();
  activeTool = null;
  $('launcher').hidden = false;
  $('workspace').hidden = true;
  MAIN.scrollTop = 0;
  clearSearch();
}

function openTool(tool, source) {
  const openingFromLauncher = !activeTool;
  const selectUuid = openingFromLauncher && tool === 'password' && /uuid|guid|唯一标识/i.test(SEARCH.value.normalize('NFKC'));
  if (activeTool !== tool) hideToast();
  activeTool = tool;
  $('launcher').hidden = true;
  $('workspace').hidden = false;
  for (const name of Object.keys(TOOLS)) $(`${name}-tool`).hidden = name !== tool;
  $('tool-title').textContent = $(`tool-name-${tool}`).textContent;
  if (tool === 'note') notepad.open();
  if (openingFromLauncher) native?.resize(true);
  if (selectUuid && $('generator-mode').value !== 'uuid') {
    $('generator-mode').value = 'uuid';
    updateGeneratorMode();
  }
  if (tool === 'json' && source !== undefined) replaceJson(source);
  MAIN.scrollTop = 0;
  updateShortcuts();
  focusCurrent();
}

function dismissClipboard() {
  clipboardJson = null;
  $('clipboard-offer').hidden = true;
}

function jsonFromClipboard(source) {
  if (source.replace(/\r\n?/g, '\n') === JSON_EDITOR.value) return;
  if (!JSON_EDITOR.value && (!activeTool || activeTool === 'json')) {
    dismissClipboard();
    openTool('json', source);
    return;
  }
  clipboardJson = source;
  $('clipboard-detail').textContent = JSON_EDITOR.value ? '载入会替换 JSON 编辑区的内容。' : '可载入 JSON 工具。';
  $('clipboard-offer').hidden = false;
  MAIN.scrollTop = 0;
}

function describeJson(content) {
  let lines = 1;
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) lines++;
  $('output-count').textContent = content ? `${number.format(lines)} 行 · ${number.format(content.length)} 字符` : '等待输入';
}

function updateJsonInput() {
  jsonRevision++;
  jsonDocument = null;
  beforeJsonExpansion = null;
  $('undo-expand').hidden = true;
  $('copy-json').disabled = true;
  $('download').disabled = true;
  JSON_EDITOR.removeAttribute('aria-invalid');
  describeJson(JSON_EDITOR.value);
  message('json-message', JSON_EDITOR.value ? '待格式化' : '');
  if (clipboardJson !== null) {
    $('clipboard-detail').textContent = JSON_EDITOR.value ? '载入会替换 JSON 编辑区的内容。' : '可载入 JSON 工具。';
  }
}

function showJsonResult(text) {
  if (JSON_EDITOR.value !== text) {
    JSON_EDITOR.value = text;
    JSON_EDITOR.setSelectionRange(0, 0);
    JSON_EDITOR.scrollTop = 0;
  }
  JSON_EDITOR.removeAttribute('aria-invalid');
  $('copy-json').disabled = false;
  $('download').disabled = false;
  describeJson(JSON_EDITOR.value);
}

function processJson(compact = false, expand = false) {
  try {
    const indent = $('indent').value === 'tab' ? '\t' : Number($('indent').value);
    const displayed = JSON_EDITOR.value;
    // Reuse the compact representation when the displayed result exceeds the raw input cap.
    const source = jsonDocument?.text === displayed ? jsonDocument.compact : displayed;
    const result = transformJson(source, compact ? 0 : indent, expand);
    if (expand && result.count) {
      beforeJsonExpansion = { text: displayed, document: jsonDocument };
      $('undo-expand').hidden = false;
    }
    showJsonResult(result.text);
    jsonDocument = result;
    jsonRevision++;
    const label = expand ? (result.count ? `已展开 ${result.count} 处嵌套 JSON` : '没有可展开的嵌套 JSON，已格式化。') : (compact ? '已压缩' : '已格式化');
    message('json-message', label, 'success');
  } catch (error) {
    $('copy-json').disabled = true;
    $('download').disabled = true;
    JSON_EDITOR.setAttribute('aria-invalid', 'true');
    message('json-message', error.message, 'error');
  }
}

function replaceJson(source, process = true) {
  JSON_EDITOR.value = source;
  updateJsonInput();
  if (process) processJson();
}

async function importJsonFile(file) {
  if (!file) return;
  const revision = jsonRevision;
  try {
    if (!/\.(?:json|txt)$/i.test(file.name) && !['application/json', 'text/plain'].includes(file.type)) throw new Error('请选择 .json 或 .txt 文件。');
    if (file.size > MAX_JSON) throw new Error('文件超过 2 MiB，请选择更小的文件。');
    const source = await file.text();
    if (revision !== jsonRevision) throw new Error('读取文件期间编辑区内容已变化，请重新导入。');
    replaceJson(source);
    if (activeTool === 'json') JSON_EDITOR.focus({ preventScroll: true });
  } catch (error) {
    message('json-message', error.message, 'error');
  }
}

function base64Input() { return base64RawInput ?? $('base64-input').value; }
function setBase64Input(text) {
  const input = $('base64-input');
  input.value = text;
  // The text area normalizes line endings; retain the pasted text for encoding.
  base64RawInput = text === input.value ? null : text;
}

function rawOffset(text, offset) {
  // A CRLF occupies one position in the text area but two in the original string.
  for (let crlf = text.indexOf('\r\n'); crlf !== -1 && crlf < offset; crlf = text.indexOf('\r\n', crlf + 2)) offset++;
  return offset;
}

function pasteBase64Input(text) {
  const input = $('base64-input');
  const { selectionStart, selectionEnd } = input;
  const original = base64Input();
  const prefix = original.slice(0, rawOffset(original, selectionStart)) + text;
  setBase64Input(prefix + original.slice(rawOffset(original, selectionEnd)));
  const caret = prefix.replace(/\r\n/g, '\n').length;
  input.setSelectionRange(caret, caret);
}

function isBase64Encoding() { return mode('base64-mode') === 'encode'; }
function base64FormatName() { return $('base64-variant').value === 'base64url' ? 'Base64URL' : 'Base64'; }

function updateBase64Input() {
  base64Result = null;
  $('base64-output').value = '';
  $('copy-base64').disabled = true;
  $('base64-input').removeAttribute('aria-invalid');
  const content = base64Input();
  $('base64-count').textContent = content ? `${number.format(content.length)} 字符` : '等待输入';
  $('base64-output-count').textContent = '等待转换';
  message('base64-message', content ? (isBase64Encoding() ? '待编码' : '待解码') : '');
}

function updateBase64Mode() {
  if (base64Result !== null) setBase64Input(base64Result);
  const encode = isBase64Encoding();
  $('base64-variant-field').hidden = !encode;
  $('base64-variant').disabled = !encode;
  $('convert-base64').textContent = encode ? '编码' : '解码';
  $('base64-input-label').textContent = encode ? 'UTF-8 文本' : 'Base64 内容';
  $('base64-output-label').textContent = encode ? base64FormatName() : 'UTF-8 文本';
  $('base64-input').placeholder = encode ? '输入文本，或粘贴后自动编码' : '粘贴 Base64 或 Base64URL，自动解码';
  updateBase64Input();
}

function processBase64() {
  updateBase64Input();
  try {
    const encode = isBase64Encoding();
    base64Result = encode ? encodeBase64(base64Input(), $('base64-variant').value) : decodeBase64(base64Input());
    $('base64-output').value = base64Result;
    $('copy-base64').disabled = false;
    $('base64-output-count').textContent = `${number.format(base64Result.length)} 字符`;
    message('base64-message', encode ? `已编码为 ${base64FormatName()}` : '已解码为 UTF-8 文本', 'success');
  } catch (error) {
    $('base64-input').setAttribute('aria-invalid', 'true');
    message('base64-message', error.message, 'error');
  }
}

function updateTimestampInput() {
  $('timestamp-output').value = '';
  $('copy-timestamp').disabled = true;
  $('timestamp-input').removeAttribute('aria-invalid');
  message('timestamp-message', $('timestamp-input').value ? '待转换' : '');
}

function updateTimestampMode() {
  const output = $('timestamp-output').value, input = $('timestamp-input');
  const previousUnit = $('timestamp-unit').value;
  timestampUnits[timestampMode] = previousUnit;
  timestampMode = mode('timestamp-mode');
  const toUnix = timestampMode === 'to-unix';
  $('timestamp-auto-unit').hidden = toUnix;
  $('timestamp-auto-unit').disabled = toUnix;
  $('timestamp-unit').value = !toUnix && output ? previousUnit : timestampUnits[timestampMode];
  $('timestamp-unit-label').textContent = toUnix ? '输出单位' : '输入单位';
  $('timestamp-input-label').textContent = toUnix ? '北京时间（UTC+8）' : 'Unix 时间戳';
  $('timestamp-output-label').textContent = toUnix ? 'Unix 时间戳' : '北京时间（UTC+8）';
  $('timestamp-hint').textContent = toUnix ? '按 UTC+8 解析；只填日期时使用 00:00。' : '可自动识别常用的 10 位秒和 13 位毫秒时间戳。';
  input.inputMode = toUnix ? 'text' : 'numeric';
  input.placeholder = toUnix ? '例如 2023-11-15 06:13:20.123' : '例如 1700000000 或 1700000000123';
  if (output) input.value = output;
  updateTimestampInput();
}

function processTimestamp() {
  updateTimestampInput();
  try {
    const source = $('timestamp-input').value, unit = $('timestamp-unit').value;
    const toUnix = timestampMode === 'to-unix';
    const result = toUnix ? beijingToTimestamp(source, unit) : timestampToBeijing(source, unit);
    $('timestamp-output').value = toUnix ? result.timestamp : result.beijing;
    $('copy-timestamp').disabled = false;
    const unitLabel = result.unit === 'seconds' ? '秒' : '毫秒';
    message('timestamp-message', toUnix ? `已转换为 Unix 时间戳（${unitLabel}）` : `已按${unitLabel}转换`, 'success');
  } catch (error) {
    $('timestamp-input').setAttribute('aria-invalid', 'true');
    message('timestamp-message', error.message, 'error');
  }
}

function renderPasswords() {
  const uuid = $('generator-mode').value === 'uuid';
  const list = $('password-list');
  $('copy-all').disabled = $('clear-password').disabled = passwords.length === 0;
  $('password-count').hidden = passwords.length === 0;
  $('password-count').textContent = `${passwords.length} 组`;
  if (!passwords.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '生成的内容会显示在这里。';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...passwords.map((value, index) => {
    const row = document.createElement('div');
    row.className = 'password-item';
    const code = document.createElement('code');
    code.textContent = value;
    const button = document.createElement('button');
    button.className = 'text-button';
    button.textContent = '复制';
    button.setAttribute('aria-label', `复制第 ${index + 1} 组${uuid ? ' UUID' : '密码'}`);
    button.onclick = () => copy(value);
    row.append(code, button);
    return row;
  }));
  list.scrollTop = 0;
}

function clearGenerated() {
  passwords = [];
  renderPasswords();
  message('password-message', '');
}

function updateGeneratorMode() {
  const uuid = $('generator-mode').value === 'uuid';
  $('password-options').hidden = uuid;
  $('password-options').querySelectorAll('input').forEach(input => { input.disabled = uuid; input.removeAttribute('aria-invalid'); });
  $('count').removeAttribute('aria-invalid');
  document.querySelector('.generate').textContent = uuid ? '生成 UUID' : '生成密码';
  clearGenerated();
}

function submitGenerator() {
  const uuid = $('generator-mode').value === 'uuid';
  const count = $('count'), length = $('length');
  const flags = ['upper', 'lower', 'digits', 'symbols'];
  const options = Object.fromEntries(flags.map(flag => [flag, $(flag).checked]));
  [count, length].forEach(field => field.removeAttribute('aria-invalid'));
  try {
    passwords = uuid ? generateUuids({ count: count.valueAsNumber }) : generatePasswords({ length: length.valueAsNumber, count: count.valueAsNumber, ...options, excludeSimilar: $('exclude').checked });
    renderPasswords();
    message('password-message', `已生成 ${passwords.length} 组`, 'success');
  } catch (error) {
    clearGenerated();
    message('password-message', error.message, 'error');
    const invalid = !uuid && !length.validity.valid ? length : !count.validity.valid ? count : $('upper');
    invalid.setAttribute('aria-invalid', 'true');
    invalid.focus();
  }
}

rows.forEach(row => row.addEventListener('click', () => openTool(row.dataset.tool)));
SEARCH.addEventListener('input', () => { filterTools(); updateShortcuts(); });
$('clear-search').onclick = clearSearch;
SEARCH.addEventListener('keydown', event => {
  if (isComposing(event)) return;
  const visible = visibleRows();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (visible.length) {
      selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      highlight(true);
    }
  }
  if (event.key === 'Enter' && visible[selected]) {
    event.preventDefault();
    openTool(visible[selected].dataset.tool);
  }
});

$('load-clipboard').onclick = () => {
  const source = clipboardJson;
  dismissClipboard();
  if (source !== null) openTool('json', source);
};
$('dismiss-clipboard').onclick = () => { dismissClipboard(); focusCurrent(); };

document.addEventListener('paste', event => {
  const data = event.clipboardData;
  if (!data?.types.includes('text/plain')) return;
  const source = data.getData('text/plain');
  if (event.target === SEARCH && isJsonDocument(source)) {
    event.preventDefault();
    jsonFromClipboard(source);
  } else if (event.target === JSON_EDITOR) {
    event.preventDefault();
    const { selectionStart, selectionEnd } = JSON_EDITOR;
    const entireEditor = selectionStart === 0 && selectionEnd === JSON_EDITOR.value.length;
    JSON_EDITOR.setRangeText(source, selectionStart, selectionEnd, 'end');
    updateJsonInput();
    if (entireEditor) processJson();
  } else if (event.target === $('base64-input')) {
    event.preventDefault();
    pasteBase64Input(source);
    processBase64();
  } else if (event.target === $('timestamp-input')) {
    event.preventDefault();
    const input = event.target;
    input.setRangeText(source, input.selectionStart, input.selectionEnd, 'end');
    processTimestamp();
  }
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || isComposing(event)) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (activeTool) home();
    else { SEARCH.focus(); SEARCH.select(); }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (activeTool) home();
    else if (SEARCH.value) clearSearch();
    else native?.hide();
  } else if (command && event.key === 'Enter' && activeTool) {
    event.preventDefault();
    ({ json: processJson, base64: processBase64, timestamp: processTimestamp, password: submitGenerator, note: notepad.toggle })[activeTool]();
  }
});

$('back').onclick = home;
$('format').onclick = () => processJson();
$('minify').onclick = () => processJson(true);
$('expand-json').onclick = () => processJson(false, true);
$('undo-expand').onclick = () => {
  if (!beforeJsonExpansion) return;
  const { text, document } = beforeJsonExpansion;
  beforeJsonExpansion = null;
  $('undo-expand').hidden = true;
  showJsonResult(text);
  jsonDocument = document;
  jsonRevision++;
  message('json-message', '已撤销展开', 'success');
};
JSON_EDITOR.addEventListener('input', updateJsonInput);
$('json-wrap').onchange = () => { JSON_EDITOR.wrap = $('json-wrap').checked ? 'soft' : 'off'; };
$('indent').onchange = () => { if (JSON_EDITOR.value.trim()) processJson(); };
$('clear').onclick = () => { replaceJson('', false); JSON_EDITOR.focus(); };
$('example').onclick = () => replaceJson('{"name":"Ssx 工具箱","tools":["JSON 格式化","随机密码"],"local":true,"longId":9223372036854775807}');
$('copy-json').onclick = () => copy(JSON_EDITOR.value);
$('import').onclick = () => $('file').click();
$('file').onchange = () => {
  const file = $('file').files[0];
  $('file').value = '';
  return importJsonFile(file);
};
$('download').onclick = async () => {
  try {
    if (native) {
      if (await native.saveJson(JSON_EDITOR.value)) showToast('JSON 文件已保存');
    } else {
      const url = URL.createObjectURL(new Blob([JSON_EDITOR.value], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'formatted.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    message('json-message', '保存失败，请检查保存位置是否可写。', 'error');
  }
};

document.addEventListener('dragover', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  const accepts = activeTool === 'json' && $('json-editor').contains(event.target);
  event.dataTransfer.dropEffect = accepts ? 'copy' : 'none';
  $('drop-hint').hidden = !accepts;
});
$('json-editor').addEventListener('dragleave', event => {
  if (!$('json-editor').contains(event.relatedTarget)) $('drop-hint').hidden = true;
});
document.addEventListener('drop', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  $('drop-hint').hidden = true;
  if (activeTool !== 'json' || !$('json-editor').contains(event.target)) return;
  if (event.dataTransfer.files.length === 1) importJsonFile(event.dataTransfer.files[0]);
  else message('json-message', '请一次拖入一个 JSON 或文本文件。', 'error');
});

$('base64-input').addEventListener('input', () => { base64RawInput = null; updateBase64Input(); });
$('base64-mode').onchange = updateBase64Mode;
$('base64-variant').onchange = () => {
  $('base64-output-label').textContent = base64FormatName();
  if (base64Input()) processBase64();
};
$('convert-base64').onclick = processBase64;
$('base64-clear').onclick = () => { setBase64Input(''); updateBase64Input(); $('base64-input').focus(); };
$('base64-example').onclick = () => { setBase64Input(isBase64Encoding() ? BASE64_EXAMPLE : encodeBase64(BASE64_EXAMPLE)); processBase64(); };
$('copy-base64').onclick = () => { if (base64Result !== null) copy(base64Result); };

$('timestamp-input').addEventListener('input', updateTimestampInput);
$('timestamp-form').onsubmit = event => { event.preventDefault(); processTimestamp(); };
$('timestamp-mode').onchange = updateTimestampMode;
$('timestamp-unit').onchange = () => { if ($('timestamp-input').value.trim()) processTimestamp(); else updateTimestampInput(); };
$('timestamp-now').onclick = () => {
  const now = Date.now();
  const input = timestampMode === 'to-unix'
    ? timestampToBeijing(String(now), 'milliseconds').beijing
    : String($('timestamp-unit').value === 'seconds' ? Math.floor(now / 1000) : now);
  $('timestamp-input').value = input;
  processTimestamp();
};
$('timestamp-clear').onclick = () => { $('timestamp-input').value = ''; updateTimestampInput(); $('timestamp-input').focus(); };
$('copy-timestamp').onclick = () => copy($('timestamp-output').value);

$('length-range').oninput = () => { $('length').value = $('length-range').value; $('length').removeAttribute('aria-invalid'); };
$('length').oninput = () => { if ($('length').validity.valid) $('length-range').value = $('length').value; };
$('password-form').addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
$('generator-mode').onchange = updateGeneratorMode;
$('password-form').onsubmit = event => { event.preventDefault(); submitGenerator(); };
$('clear-password').onclick = () => { clearGenerated(); focusCurrent(); };
$('copy-all').onclick = () => copy(passwords.join('\n'));

if (native) {
  $('window-controls').hidden = false;
  $('minimize-window').onclick = () => native.minimize();
  $('maximize-window').onclick = () => native.toggleMaximize();
  $('hide').onclick = () => native.hide();
  const windowState = ({ maximized }) => {
    const label = maximized ? '还原窗口' : '最大化';
    const button = $('maximize-window');
    button.title = label;
    button.setAttribute('aria-label', label);
    $('maximize-icon').setAttribute('href', maximized ? '#icon-restore' : '#icon-maximize');
  };
  native.onWindowState(windowState);
  native.onWake(({ json }) => {
    if (json !== null) jsonFromClipboard(json);
    if (!activeTool || !MAIN.contains(document.activeElement)) focusCurrent();
  });
  native.status().then(status => {
    if (!status) return;
    windowState(status);
    if (!status.shortcutReady) {
      $('launcher-hotkey').hidden = true;
      $('app-status').classList.add('conflict');
      $('app-status').title = 'Ctrl + 空格已被占用，可通过托盘打开工具箱';
      $('app-status-text').textContent = '快捷键被占用';
    }
  });
}
filterTools();
updateShortcuts();
focusCurrent();
