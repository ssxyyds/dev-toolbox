'use strict';
const $ = id => document.getElementById(id);
const { formatJson, isJson, generatePasswords, generateUuids, MAX_JSON } = ToolCore;
let activeTool = null, selected = 0, passwords = [], toastTimer;
const rows = [...document.querySelectorAll('.tool-row')];
const keywords = { json: 'json 格式化 压缩 校验 geshihua', password: 'password pass pwd 密码 随机 mima suiji uuid guid 唯一标识' };
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200); }
function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); $(id).hidden = !text; }
async function copy(text) {
  try { if (window.desktop) await desktop.copy(text); else await navigator.clipboard.writeText(text); toast('已复制到剪贴板'); }
  catch { toast('复制失败，请选中内容后手动复制。'); }
}
function filterTools() {
  const query = $('search').value.trim().toLowerCase();
  rows.forEach(row => { row.hidden = !keywords[row.dataset.tool].includes(query); });
  selected = 0; highlight(); $('no-results').hidden = rows.some(row => !row.hidden);
  $('list-label').textContent = query ? '搜索结果' : '全部工具';
}
function highlight() { const visible = rows.filter(row => !row.hidden); rows.forEach(row => row.classList.toggle('selected', row === visible[selected])); }
function home() {
  activeTool = null; $('launcher').hidden = false; $('workspace').hidden = true;
  $('search').value = ''; filterTools(); window.desktop?.resize(false); $('search').focus();
  if ($('app-status').hidden) $('footer-tip').textContent = 'Esc 隐藏窗口';
}
function openTool(tool, source) {
  const uuidSearch = /uuid|guid|唯一标识/i.test($('search').value);
  activeTool = tool; $('launcher').hidden = true; $('workspace').hidden = false;
  $('json-tool').hidden = tool !== 'json'; $('password-tool').hidden = tool !== 'password';
  $('tool-title').textContent = tool === 'json' ? 'JSON 格式化' : '密码与 UUID 生成';
  $('search').value = ''; window.desktop?.resize(true);
  if ($('app-status').hidden) $('footer-tip').textContent = tool === 'json' ? 'Ctrl + Enter 格式化 · Esc 返回' : 'Esc 返回';
  if (tool === 'json') { if (source !== undefined) { $('json-output').value = source; updateInput(); processJson(); } $('json-output').focus(); }
  else {
    if (uuidSearch) { $('generator-mode').value = 'uuid'; updateGeneratorMode(); }
    ($('generator-mode').value === 'uuid' ? $('count') : $('length')).focus();
  }
}
function updateInput() {
  const content = $('json-output').value;
  $('copy-json').disabled = true; $('download').disabled = true;
  $('output-count').textContent = content ? `${content.split('\n').length.toLocaleString()} 行 · ${content.length.toLocaleString()} 字符` : '等待输入';
  message('json-message', content ? '已修改，待格式化' : '');
}
function processJson(compact = false) {
  try {
    const indent = $('indent').value === 'tab' ? '\t' : Number($('indent').value);
    const output = formatJson($('json-output').value, compact ? 0 : indent);
    $('json-output').value = output; $('copy-json').disabled = false; $('download').disabled = false;
    $('output-count').textContent = `${output.split('\n').length.toLocaleString()} 行 · ${output.length.toLocaleString()} 字符`;
    message('json-message', compact ? '已压缩' : '已格式化');
  } catch (error) { $('copy-json').disabled = true; $('download').disabled = true; $('output-count').textContent = '等待修正'; message('json-message', error.message, true); }
}
rows.forEach(row => row.addEventListener('click', () => openTool(row.dataset.tool)));
$('search').addEventListener('input', () => { if (activeTool) { activeTool = null; $('workspace').hidden = true; $('launcher').hidden = false; window.desktop?.resize(false); } filterTools(); });
$('search').addEventListener('keydown', event => {
  const visible = rows.filter(row => !row.hidden);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (visible.length) selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length; highlight(); }
  if (event.key === 'Enter' && visible[selected]) { event.preventDefault(); openTool(visible[selected].dataset.tool); }
});
document.addEventListener('paste', event => {
  const source = event.clipboardData?.getData('text/plain') || '';
  if (event.target === $('json-output')) {
    event.preventDefault();
    const editor = $('json-output');
    if (isJson(source)) editor.value = source;
    else editor.setRangeText(source, editor.selectionStart, editor.selectionEnd, 'end');
    updateInput(); processJson(); return;
  }
  if (isJson(source)) { event.preventDefault(); openTool('json', source); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); if (activeTool) home(); else window.desktop?.hide(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && activeTool === 'json') { event.preventDefault(); processJson(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); $('search').select(); }
});
$('back').onclick = home; $('hide').onclick = () => window.desktop?.hide();
$('format').onclick = () => processJson(); $('minify').onclick = () => processJson(true);
$('json-output').addEventListener('input', updateInput);
$('indent').onchange = () => { if ($('json-output').value.trim()) processJson(); };
$('clear').onclick = () => { $('json-output').value = ''; updateInput(); $('json-output').focus(); };
$('example').onclick = () => { $('json-output').value = '{"name":"Ssx 工具箱","tools":["JSON 格式化","随机密码"],"local":true,"longId":9223372036854775807}'; updateInput(); processJson(); };
$('copy-json').onclick = () => copy($('json-output').value);
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  try { if (file.size > MAX_JSON) throw new Error('文件超过 2 MB，请选择更小的文件。'); $('json-output').value = await file.text(); updateInput(); processJson(); }
  catch (error) { message('json-message', error.message, true); } finally { $('file').value = ''; }
};
$('download').onclick = async () => {
  try {
    if (window.desktop) { if (await desktop.saveJson($('json-output').value)) toast('JSON 文件已保存'); return; }
    const url = URL.createObjectURL(new Blob([$('json-output').value], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'formatted.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { message('json-message', '保存失败，请检查保存位置是否可写，然后重试。', true); }
};
$('length-range').oninput = () => { $('length').value = $('length-range').value; };
$('length').oninput = () => { if ($('length').validity.valid) $('length-range').value = $('length').value; };
function updateGeneratorMode() {
  const uuid = $('generator-mode').value === 'uuid';
  $('password-options').hidden = uuid;
  $('password-options').querySelectorAll('input').forEach(input => { input.disabled = uuid; });
  document.querySelector('.generate').textContent = uuid ? '生成 UUID' : '生成密码';
  passwords = []; $('copy-all').disabled = true;
  const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '暂无结果';
  $('password-list').replaceChildren(empty);
  message('password-message', '');
}
$('generator-mode').onchange = updateGeneratorMode;
$('password-form').onsubmit = event => {
  event.preventDefault();
  try {
    const uuid = $('generator-mode').value === 'uuid';
    passwords = uuid ? generateUuids({ count: Number($('count').value) }) : generatePasswords({ length: Number($('length').value), count: Number($('count').value), upper: $('upper').checked, lower: $('lower').checked, digits: $('digits').checked, symbols: $('symbols').checked, excludeSimilar: $('exclude').checked });
    $('password-list').replaceChildren();
    passwords.forEach((password, index) => { const row = document.createElement('div'); row.className = 'password-item'; const code = document.createElement('code'); code.textContent = password; const button = document.createElement('button'); button.className = 'text-button'; button.textContent = '复制'; button.setAttribute('aria-label', `复制第 ${index + 1} 组${uuid ? ' UUID' : '密码'}`); button.onclick = () => copy(password); row.append(code, button); $('password-list').append(row); });
    $('copy-all').disabled = false; message('password-message', `已生成 ${passwords.length} 组`);
  } catch (error) { passwords = []; $('password-list').replaceChildren(); $('copy-all').disabled = true; message('password-message', error.message, true); }
};
$('copy-all').onclick = () => copy(passwords.join('\n'));
if (window.desktop) {
  desktop.onWake(({ json }) => { if (json !== null) openTool('json', json); else home(); });
  desktop.status().then(status => { if (!status?.shortcutReady) { $('app-status').hidden = false; $('app-status').textContent = 'Ctrl + 空格被占用'; $('footer-tip').textContent = '关闭冲突应用后重启；可双击托盘打开'; } });
}
$('search').focus();
