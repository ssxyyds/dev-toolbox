(function (root) {
  'use strict';
  const MAX_JSON = 2 * 1024 * 1024;
  const JSON_TOKENS = /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g;
  function jsonTokens(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('请先粘贴或导入 JSON。');
    if (source.length > MAX_JSON) throw new Error('JSON 输入超过 2,097,152 个字符，请缩小内容后重试。');
    source = source.replace(/^\uFEFF/, '');
    try { JSON.parse(source); } catch (error) {
      const position = /position (\d+)/.exec(error.message);
      const before = position ? source.slice(0, Number(position[1])).split('\n') : null;
      throw new Error('JSON 格式有误' + (before ? `，第 ${before.length} 行，第 ${before.at(-1).length + 1} 列` : '') + '。请检查引号、逗号和括号。\n' + error.message);
    }
    // Tokenize the original text: never serialize parsed numbers (large IDs must stay exact).
    return source.match(JSON_TOKENS);
  }
  function renderJson(tokens, indent) {
    if (![0, 2, 4, '\t'].includes(indent)) throw new Error('不支持的缩进。');
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
    return output.join('');
  }
  function formatJson(source, indent = 2) { return renderJson(jsonTokens(source), indent); }
  function isJson(source) {
    if (typeof source !== 'string' || !source.trim() || source.length > MAX_JSON) return false;
    try { JSON.parse(source.replace(/^\uFEFF/, '')); return true; } catch { return false; }
  }
  function isJsonDocument(source) {
    return typeof source === 'string' && source.length <= MAX_JSON && /^[{[]/.test(source.trimStart()) && isJson(source);
  }
  function expandJsonTokens(original, sourceSize) {
    let count = 0, inspectedSize = 0;
    const result = [];
    function expand(tokens, depth, size) {
      inspectedSize += size;
      if (inspectedSize > 16 * MAX_JSON) throw new Error('嵌套 JSON 内容过多，请分段展开。');
      for (const [index, token] of tokens.entries()) {
        if (token === '{' || token === '[') {
          if (++depth > 128) throw new Error('JSON 嵌套超过 128 层，请简化后重试。');
        } else if (token === '}' || token === ']') depth--;
        // Decode string values only. Keys, ordinary text and numeric strings stay exact.
        if (token.startsWith('"') && tokens[index + 1] !== ':') {
          const decoded = JSON.parse(token).replace(/^\uFEFF/, '');
          if (/^\s*[{[]/.test(decoded) && isJson(decoded)) {
            count++;
            expand(decoded.match(JSON_TOKENS), depth, decoded.length);
            continue;
          }
        }
        result.push(token);
      }
    }
    expand(original, 0, sourceSize);
    return { tokens: result, count };
  }
  function transformJson(source, indent = 2, expand = false) {
    const original = jsonTokens(source);
    const { tokens, count } = expand ? expandJsonTokens(original, source.length) : { tokens: original, count: 0 };
    const compact = tokens.join('');
    return { text: indent === 0 ? compact : renderJson(tokens, indent), compact, count };
  }
  function expandNestedJson(source, indent = 2) {
    const { text, count } = transformJson(source, indent, true);
    return { text, count };
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
  // Three UTF-8 bytes become four Base64 characters under decodeBase64's input cap.
  const MAX_BASE64_BYTES = Math.floor(MAX_JSON / 4) * 3;
  function encodeBase64(source, variant = 'base64') {
    if (typeof source !== 'string' || source.length === 0) throw new Error('请输入要编码的文本。');
    if (variant !== 'base64' && variant !== 'base64url') throw new Error('请选择 Base64 或 Base64URL 编码。');
    const sizeError = `原文最多 ${MAX_BASE64_BYTES} 个 UTF-8 字节，以保证结果不超过 ${MAX_JSON} 个字符的解码上限。`;
    if (source.length > MAX_BASE64_BYTES) throw new Error(sizeError);
    if (!source.isWellFormed()) throw new Error('文本包含未配对的 Unicode 代理项，无法无损编码为 UTF-8。');
    const bytes = new TextEncoder().encode(source);
    if (bytes.length > MAX_BASE64_BYTES) throw new Error(sizeError);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const encoded = globalThis.btoa(binary);
    return variant === 'base64url' ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded;
  }
  const BEIJING_OFFSET_MS = 8n * 60n * 60n * 1000n;
  const DATE_LIMIT_MS = 8640000000000000n;
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
    const shifted = milliseconds + BEIJING_OFFSET_MS;
    if (milliseconds < -DATE_LIMIT_MS || milliseconds > DATE_LIMIT_MS || shifted < -DATE_LIMIT_MS || shifted > DATE_LIMIT_MS) {
      throw new Error('时间戳超出可转换范围，请检查数值和单位。');
    }
    // A fixed UTC+8 offset keeps Beijing output independent of the computer's time zone.
    return { beijing: new Date(Number(shifted)).toISOString().replace('T', ' ').replace(/Z$/, ''), unit };
  }
  const BEIJING_TIME = /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
  function beijingToTimestamp(source, unit = 'seconds') {
    const input = typeof source === 'string' ? source.trim() : '';
    if (!input) throw new Error('请先输入北京时间。');
    if (unit !== 'seconds' && unit !== 'milliseconds') throw new Error('请选择秒或毫秒。');
    const parts = BEIJING_TIME.exec(input);
    if (!parts || parts[1] === '-000000') {
      throw new Error('北京时间格式有误，请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss[.SSS]]，日期和时间可用 T 分隔，不带时区。');
    }
    const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00', fraction = ''] = parts;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    if (hour > 23 || minute > 59 || second > 59) throw new Error('北京时间的时分秒无效。');
    // UTC setters preserve years 0000–0099 and avoid the computer's time zone.
    const clock = new Date(0);
    clock.setUTCFullYear(year, month - 1, day);
    const shifted = clock.setUTCHours(hour, minute, second, Number(fraction.padEnd(3, '0')));
    if (!Number.isFinite(shifted)) throw new Error('北京时间超出可转换范围。');
    if (clock.getUTCMonth() + 1 !== month || clock.getUTCDate() !== day) throw new Error('北京时间的日期无效。');
    let timestamp = BigInt(shifted) - BEIJING_OFFSET_MS;
    if (timestamp < -DATE_LIMIT_MS || timestamp > DATE_LIMIT_MS) throw new Error('北京时间超出可转换范围。');
    // BigInt division truncates toward zero; round negative fractional seconds down.
    if (unit === 'seconds') timestamp = timestamp / 1000n - (timestamp % 1000n < 0n ? 1n : 0n);
    return { timestamp: timestamp.toString(), unit };
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
  const api = { formatJson, isJson, isJsonDocument, expandNestedJson, transformJson, decodeBase64, encodeBase64, timestampToBeijing, beijingToTimestamp, generatePasswords, generateUuids, CHARSETS, MAX_JSON };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ToolCore = api;
})(globalThis);
