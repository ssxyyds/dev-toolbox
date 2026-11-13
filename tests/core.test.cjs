const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatJson, isJson, expandNestedJson, decodeBase64, decodeFbclid, timestampToBeijing, generatePasswords, generateUuids, CHARSETS, MAX_JSON } = require('../src/core.js');
test('JSON retains large numbers, duplicate keys, exponent and escaped strings', () => {
  const source = '{"id":9223372036854775807,"tiny":1.20e-123,"id":-0,"s":"a\\\"b\\n","empty":[{},[]]}';
  const result = formatJson(source, 4);
  assert.equal(formatJson(result, 0), source);
  assert.match(result, /9223372036854775807/);
  assert.deepEqual(JSON.parse(result), JSON.parse(source));
});
test('JSON supports primitive values, BOM, tabs, and reports malformed input', () => {
  for (const input of ['null', 'true', '123', '"text"', '[]', '{}']) assert.equal(formatJson(input), input);
  assert.equal(formatJson('\uFEFF{"a":1}', '\t'), '{\n\t"a": 1\n}');
  for (const input of ['', '{"x":}', '{"a":1,}', '{bad}', 'undefined']) assert.throws(() => formatJson(input));
  assert.equal(isJson('{"a":1}'), true); assert.equal(isJson('hello'), false);
  assert.throws(() => formatJson('['.repeat(129) + '0' + ']'.repeat(129)), /128/);
});

test('Nested JSON expands request bodies and recursively expands object and array strings', () => {
  const source = JSON.stringify({ requestId: 'request-test', method: 'POST', path: '/test/report', body: JSON.stringify({ url: '../tracking/events', data: { payload: JSON.stringify({ fbclid: 'example' }), event_name: 'landing_page_continue_click' }, response: '{}' }), bodyEncoding: 'utf-8' });
  const result = expandNestedJson(source);
  assert.equal(result.count, 3);
  assert.deepEqual(JSON.parse(result.text).body, { url: '../tracking/events', data: { payload: { fbclid: 'example' }, event_name: 'landing_page_continue_click' }, response: {} });
  assert.match(result.text, /"body": \{\n    "url"/);
  assert.equal(typeof JSON.parse(formatJson(source)).body, 'string');
  const nestedArray = expandNestedJson(JSON.stringify(['[1,2,{"nested":"{}"}]']));
  assert.equal(nestedArray.count, 2);
  assert.deepEqual(JSON.parse(nestedArray.text), [[1, 2, { nested: {} }]]);
  assert.deepEqual(JSON.parse(expandNestedJson(JSON.stringify('{"root":true}')).text), { root: true });
});

test('Nested JSON preserves exact large numbers, duplicate keys, escapes and ordinary strings', () => {
  const inner = '{"id":9223372036854775807,"tiny":1.20e-123,"id":-0,"escaped":"a\\\"b\\n","path":"C:\\\\Temp","__proto__":{"safe":true}}';
  const source = '{"outside":9223372036854775808,"body":' + JSON.stringify(inner) + '}';
  const expected = '{"outside":9223372036854775808,"body":' + inner + '}';
  assert.equal(expandNestedJson(source, 0).text, expected);
  assert.equal(expandNestedJson(source, 4).text, formatJson(expected, 4));
  assert.equal(expandNestedJson(source, '\t').text, formatJson(expected, '\t'));
  const unchanged = JSON.stringify({ '{}': 'a\\b\n中文', number: '123', boolean: 'true', empty: '', quoted: '"text"', null: 'null', broken: '{"missing":}', text: 'prefix {"a":1}' });
  assert.deepEqual(expandNestedJson(unchanged, 0), { text: unchanged, count: 0 });
  assert.equal(expandNestedJson(JSON.stringify({ body: '\uFEFF {"a":1}' })).count, 1);
});

test('Nested JSON rejects malformed outer input and limits combined structural depth', () => {
  assert.throws(() => expandNestedJson('{"body":}'), /JSON 格式有误/);
  assert.throws(() => expandNestedJson(String.raw`{"body":"{\\"url\\":\\"test\\"}"}`), /JSON 格式有误/);
  assert.throws(() => expandNestedJson(' '.repeat(MAX_JSON + 1) + '{}'), /2 MB/);
  assert.throws(() => expandNestedJson('{}', 3), /缩进/);
  const atLimit = '['.repeat(127) + JSON.stringify('{}') + ']'.repeat(127);
  assert.equal(expandNestedJson(atLimit, 0).count, 1);
  const tooDeep = '['.repeat(128) + JSON.stringify('{}') + ']'.repeat(128);
  assert.throws(() => expandNestedJson(tooDeep, 0), /128/);
});
test('Every password follows selected classes, count, length and exclusions', () => {
  for (let mask = 1; mask < 16; mask++) {
    const options = { length: 8, count: 20, excludeSimilar: true };
    Object.keys(CHARSETS).forEach((key, i) => options[key] = Boolean(mask & (1 << i)));
    const passwords = generatePasswords(options);
    assert.equal(passwords.length, 20);
    const selected = Object.entries(CHARSETS).filter(([key]) => options[key]).map(([, chars]) => chars.replace(/[Il1O0o]/g, ''));
    for (const password of passwords) { assert.equal(password.length, 8); assert.doesNotMatch(password, /[Il1O0o]/); assert.ok([...password].every(char => selected.join('').includes(char))); for (const group of selected) assert.ok([...password].some(char => group.includes(char))); }
  }
});
test('Invalid password options rejected; maximum length accepted', () => {
  for (const options of [{ length: 7, upper: true }, { length: 129, upper: true }, { length: 8.5, upper: true }, { count: 0, upper: true }, { count: 21, upper: true }, {}]) assert.throws(() => generatePasswords(options));
  assert.equal(generatePasswords({ length: 128, count: 1, symbols: true, excludeSimilar: false })[0].length, 128);
});
test('UUID batches use standard v4 version, variant, length and requested count', () => {
  const values = generateUuids({ count: 20 });
  assert.equal(values.length, 20);
  assert.equal(new Set(values).size, 20);
  for (const value of values) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(generateUuids().length, 1);
  for (const count of [0, 21, 1.5, NaN, '5']) assert.throws(() => generateUuids({ count }), /数量/);
});

test('Base64 decodes UTF-8, URL-safe input, omitted padding and line breaks exactly', () => {
  for (const source of ['hello', '你好，Ssx 工具箱 👋', '\uFEFF保留开头标记', '\0\nline\r\n', '\uFFFD']) {
    const encoded = Buffer.from(source, 'utf8').toString('base64');
    assert.equal(decodeBase64(encoded), source);
    assert.equal(decodeBase64(encoded.replace(/=+$/, '')), source);
    assert.equal(decodeBase64(Buffer.from(source).toString('base64url')), source);
    assert.equal(decodeBase64(encoded.match(/.{1,4}/g).join('\r\n')), source);
  }
  assert.equal(decodeBase64('5L2g5aW977yMU3N4IOW3peWFt+eusSDwn5GL'), '你好，Ssx 工具箱 👋');
});

test('Base64 rejects invalid alphabets, padding, incomplete data, binary and oversized input', () => {
  for (const input of ['', ' \n ', 'a', 'a===', 'Zg=', 'Zg===', 'Z=g=', '====', 'Zh==', 'Zm9=', 'hello!', 'Zg==\u200B']) {
    assert.throws(() => decodeBase64(input), /Base64/);
  }
  assert.throws(() => decodeBase64('/w=='), /UTF-8/);
  assert.throws(() => decodeBase64('A'.repeat(MAX_JSON + 1)), /2 MB/);
});

test('Temporary fbclid rule matches the supplied Python preview for the real TDEX sample', () => {
  const source = 'IwVERFWAVctuVleHRuA2FlbQEwAHBkb2YFZmRpZBZRHYGLzeAgLriTZQX8mrRHjlzrtr1sYWRpZAAAL9vpcpVwc3J0YwZhcHBfaWQKNjYyODU2ODM3OQABH0pmP6fQsxo8PQf0twGCpAJ1d7myiHMv2GxoVeTFM0-T6c1LAi7g0oZT0lFX_aem_ORqRB734sDQON0_9l82-nA';
  const expected = 'TDEX.\\..extn.aem.0.pdof.fdid.Q..... ...e....G.\\...ladid../..r.psrtc.app_id.6628568379...Jf?....<=.......uw...s/.lhU..3O...K.....S.QW';
  assert.equal(decodeFbclid(source), expected);
  assert.equal(decodeFbclid('PA' + source.slice(2)), expected);
  assert.equal(decodeFbclid(source.split('_aem_')[0]), expected);
  assert.throws(() => decodeBase64(source), /Base64/);
});

test('Temporary fbclid preview preserves printable ASCII and replaces every other byte', () => {
  const raw = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const expected = '.'.repeat(32) + Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join('') + '.'.repeat(129);
  const encoded = raw.toString('base64url');
  for (const body of [encoded, encoded + '==', encoded.match(/.{1,4}/g).join('\n')]) {
    assert.equal(decodeFbclid('Iw' + body + '_aem_ignored'), expected);
  }
  assert.equal(decodeFbclid('IwZh'), 'f');
  assert.throws(() => decodeBase64('Zh=='), /Base64/);
  for (const source of ['', ' ', 'Iw', 'PA_aem_suffix', 'IwA', 'Iw???', 'IwZ=g=']) assert.throws(() => decodeFbclid(source), /fbclid/);
  assert.throws(() => decodeFbclid('Iw' + 'A'.repeat(MAX_JSON)), /2 MB/);
});

test('Unix seconds and milliseconds convert to fixed Beijing time, including zero and negative values', () => {
  assert.deepEqual(timestampToBeijing('1700000000'), { beijing: '2023-11-15 06:13:20.000', unit: 'seconds' });
  assert.deepEqual(timestampToBeijing('1700000000123'), { beijing: '2023-11-15 06:13:20.123', unit: 'milliseconds' });
  assert.equal(timestampToBeijing('0').beijing, '1970-01-01 08:00:00.000');
  assert.equal(timestampToBeijing('-1').beijing, '1970-01-01 07:59:59.000');
  assert.equal(timestampToBeijing('-1', 'milliseconds').beijing, '1970-01-01 07:59:59.999');
  assert.equal(timestampToBeijing('  +0001700000000  ').beijing, '2023-11-15 06:13:20.000');
  assert.equal(timestampToBeijing('1700000000', 'milliseconds').beijing, '1970-01-21 00:13:20.000');
  assert.equal(timestampToBeijing('10000000000', 'seconds').beijing, '2286-11-21 01:46:40.000');
  const original = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
      process.env.TZ = timezone;
      assert.equal(timestampToBeijing('1700000000123').beijing, '2023-11-15 06:13:20.123');
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('Timestamp conversion rejects invalid or ambiguous units and values outside Date bounds', () => {
  for (const input of ['', ' ', 'abc', '1e9', '1700000000.5', 'NaN', 'Infinity', '2026-11-13', '1 700000000']) {
    assert.throws(() => timestampToBeijing(input), /时间戳/);
  }
  for (const input of ['10000000000', '100000000000', '10000000000000']) assert.throws(() => timestampToBeijing(input), /手动选择/);
  assert.throws(() => timestampToBeijing('0', 'minutes'), /秒或毫秒/);
  for (const input of ['8640000000000001', '-8640000000000001', '8640000000000000', '99999999999999999']) {
    assert.throws(() => timestampToBeijing(input, 'milliseconds'), /范围/);
  }
  assert.equal(timestampToBeijing('8639999971200000', 'milliseconds').beijing, '+275760-09-13 00:00:00.000');
});
