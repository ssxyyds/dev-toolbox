(function (root) {
  'use strict';
  const MAX_JSON = 2 * 1024 * 1024;
  const JSON_TOKENS = /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g;
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
    const tokens = source.match(JSON_TOKENS);
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
  function expandNestedJson(source, indent = 2) {
    const compact = formatJson(source, 0);
    let count = 0, inspectedSize = 0;
    function expand(text, depth) {
      inspectedSize += text.length;
      if (inspectedSize > 16 * MAX_JSON) throw new Error('嵌套 JSON 内容过多，请分段展开。');
      const tokens = text.match(JSON_TOKENS);
      return tokens.map((token, index) => {
        if (token === '{' || token === '[') {
          if (++depth > 128) throw new Error('JSON 嵌套超过 128 层，请简化后重试。');
        } else if (token === '}' || token === ']') depth--;
        // Decode string values only. Keys, ordinary text and numeric strings stay exact.
        if (token.startsWith('"') && tokens[index + 1] !== ':') {
          const decoded = JSON.parse(token).replace(/^\uFEFF/, '');
          if (/^\s*[{[]/.test(decoded) && isJson(decoded)) {
            count++;
            return expand(formatJson(decoded, 0), depth);
          }
        }
        return token;
      }).join('');
    }
    return { text: formatJson(expand(compact, 0), indent), count };
  }
  function decodeBase64(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('请先粘贴 Base64 内容。');
    if (source.length > MAX_JSON) throw new Error('内容超过 2 MB，请缩小后重试。');
    const normalized = source.replace(/[\t\n\f\r ]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const body = normalized.replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || body.length % 4 === 1 || (normalized.includes('=') && normalized.length % 4 !== 0)) {
      throw new Error('Base64 格式有误，请检查字符、长度和末尾的 =。');
    }
    const binary = globalThis.atob(body);
    if (globalThis.btoa(binary).replace(/=+$/, '') !== body) throw new Error('Base64 末尾数据不完整，请检查后重试。');
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    } catch { throw new Error('解码结果不是有效的 UTF-8 文本，请确认内容是文字。'); }
  }
  function decodeFbclid(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('请先粘贴 fbclid。');
    if (source.length > MAX_JSON) throw new Error('内容超过 2 MB，请缩小后重试。');
    const body = source.trim().slice(2).split('_aem_', 1)[0].replace(/[\t\n\f\r ]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!body) throw new Error('去掉前两位和后缀后没有可解码内容，请检查 fbclid。');
    try {
      // Temporary byte preview: do not apply the UTF-8 or canonical-bit checks of text decoding.
      const raw = globalThis.atob(body + '='.repeat((4 - body.length % 4) % 4));
      return raw.replace(/[^\x20-\x7e]/g, '.');
    } catch { throw new Error('fbclid 主体无法解码，请检查字符和长度。'); }
  }
  function timestampToBeijing(source, unit = 'auto') {
    if (typeof source !== 'string' || !source.trim()) throw new Error('请先输入时间戳。');
    const input = source.trim();
    if (!/^[+-]?\d+$/.test(input)) throw new Error('时间戳须为整数，请检查是否包含小数或其他字符。');
    if (!['auto', 'seconds', 'milliseconds'].includes(unit)) throw new Error('请选择秒或毫秒。');
    const digits = input.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
    if (digits.length > 16) throw new Error('时间戳超出可转换范围，请检查数值和单位。');
    if (unit === 'auto') {
      if (digits.length <= 10) unit = 'seconds';
      else if (digits.length === 13) unit = 'milliseconds';
      else throw new Error('无法自动判断单位，请手动选择“秒”或“毫秒”。');
    }
    const milliseconds = BigInt(input) * (unit === 'seconds' ? 1000n : 1n);
    const shifted = milliseconds + 8n * 60n * 60n * 1000n;
    const limit = 8640000000000000n;
    if (milliseconds < -limit || milliseconds > limit || shifted < -limit || shifted > limit) {
      throw new Error('时间戳超出可转换范围，请检查数值和单位。');
    }
    // A fixed UTC+8 offset keeps Beijing output independent of the computer's time zone.
    return { beijing: new Date(Number(shifted)).toISOString().replace('T', ' ').replace(/Z$/, ''), unit };
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
  const api = { formatJson, isJson, expandNestedJson, decodeBase64, decodeFbclid, timestampToBeijing, generatePasswords, generateUuids, CHARSETS, MAX_JSON };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ToolCore = api;
})(globalThis);
