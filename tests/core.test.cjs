const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatJson, isJson, generatePasswords, generateUuids, CHARSETS } = require('../src/core.js');
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
