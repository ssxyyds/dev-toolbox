(function (root) {
  'use strict';
  const MAX_JSON = 2 * 1024 * 1024;
  function formatJson(source, indent = 2) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('请先粘贴或导入 JSON。');
    if (source.length > MAX_JSON) throw new Error('内容超过 2 MB，请缩小文件后重试。');
    source = source.replace(/^\uFEFF/, '');
    try { JSON.parse(source); } catch (error) {
      const position = /position (\d+)/.exec(error.message);
      const before = position ? source.slice(0, Number(position[1])).split('\n') : null;
      throw new Error('JSON 格式有误' + (before ? `，第 ${before.length} 行，第 ${before.at(-1).length + 1} 列` : '') + '。请检查引号、逗号和括号。\n' + error.message);
    }
    if (![0, 2, 4, '\t'].includes(indent)) throw new Error('不支持的缩进。');
    // Tokenize the original text: never serialize parsed numbers (large IDs must stay exact).
    const tokens = source.match(/"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);
    if (!indent) return tokens.join('');
    const unit = indent === '\t' ? '\t' : ' '.repeat(indent);
    let depth = 0;
    const output = [];
    let outputSize = 0;
    const append = (...parts) => {
      outputSize += parts.reduce((total, part) => total + part.length, 0);
      if (outputSize > 16 * MAX_JSON) throw new Error('格式化结果过大，请使用压缩或减少缩进。');
      output.push(...parts);
    };
    const line = () => '\n' + unit.repeat(depth);
    tokens.forEach((token, i) => {
      if (token === '{' || token === '[') {
        if (++depth > 128) throw new Error('JSON 嵌套超过 128 层，请简化后重试。');
        append(token);
        if (tokens[i + 1] !== '}' && tokens[i + 1] !== ']') append(line());
      } else if (token === '}' || token === ']') {
        depth--;
        if (tokens[i - 1] !== '{' && tokens[i - 1] !== '[') append(line());
        append(token);
      } else if (token === ',') append(',', line());
      else if (token === ':') append(': ');
      else append(token);
    });
    const result = output.join('');
    if (result.length > 16 * MAX_JSON) throw new Error('格式化结果过大，请使用压缩或减少缩进。');
    return result;
  }
  function isJson(source) {
    if (typeof source !== 'string' || !source.trim() || source.length > MAX_JSON) return false;
    try { JSON.parse(source.replace(/^\uFEFF/, '')); return true; } catch { return false; }
  }
  function randomIndex(bound) {
    const limit = 4294967296 - (4294967296 % bound);
    const buffer = new Uint32Array(1);
    do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % bound;
  }
  const CHARSETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/' };
  function generatePasswords(options) {
    const { length = 16, count = 1, excludeSimilar = true } = options;
    if (!Number.isInteger(length) || length < 8 || length > 128) throw new Error('密码长度须为 8–128 的整数。');
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('生成数量须为 1–20 的整数。');
    const groups = Object.entries(CHARSETS).filter(([name]) => options[name]).map(([, chars]) => excludeSimilar ? chars.replace(/[Il1O0o]/g, '') : chars);
    if (!groups.length) throw new Error('请至少选择一种字符类型。');
    const pool = groups.join('');
    return Array.from({ length: count }, () => {
      // Rejection over the complete password preserves uniformity among valid strings.
      for (;;) {
        const password = Array.from({ length }, () => pool[randomIndex(pool.length)]).join('');
        if (groups.every(group => [...password].some(char => group.includes(char)))) return password;
      }
    });
  }
  function generateUuids({ count = 1 } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('生成数量须为 1–20 的整数。');
    return Array.from({ length: count }, () => globalThis.crypto.randomUUID());
  }
  const api = { formatJson, isJson, generatePasswords, generateUuids, CHARSETS, MAX_JSON };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ToolCore = api;
})(globalThis);
