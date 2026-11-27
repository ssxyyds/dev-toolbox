const test = require('node:test');
const assert = require('node:assert/strict');
const { compactJsonNode, listJsonNodes, formatJsonNode } = require('../src/core.js');

test('compact only the targeted child, preserving siblings, escapes and large IDs exactly', () => {
  const text = '{\n  "before":  2,\n  "items": [\n    { "id": 9223372036854775807, "s": "\\\" } [  " },\n    null\n  ],\n  "after":  3\n}';
  const start = text.indexOf('[\n'), end = text.lastIndexOf(']') + 1;
  for (const [from, to] of [[start,start], [end,end], [start,end], [text.indexOf('items'),text.indexOf('items')]]) {
    assert.deepEqual(compactJsonNode(text, from, to), { start, end, compact: '[{"id":9223372036854775807,"s":"\\\" } [  "},null]' });
  }
  const inner = compactJsonNode(text,text.indexOf('9223'));
  assert.equal(inner.start, text.indexOf('{ "id"'));
  assert.equal(inner.end, text.indexOf('},\n') + 1);
  assert.equal(compactJsonNode('123', 1), null);
});

test('listJsonNodes reports actionable object and array nodes with keys and multiline state', () => {
  const text = '{\n  "empty": {},\n  "items": [\n    {"id":9223372036854775807,"s":"{}"}\n  ],\n  "child": {\n    "ok": true\n  }\n}';
  const nodes = listJsonNodes(text);
  assert.deepEqual(
    nodes.map(n => ({ key: n.key, multiline: n.multiline, slice: text.slice(n.start, n.end) })),
    [
      { key: null, multiline: true, slice: text },
      { key: 'items', multiline: true, slice: '[\n    {"id":9223372036854775807,"s":"{}"}\n  ]' },
      { key: null, multiline: false, slice: '{"id":9223372036854775807,"s":"{}"}' },
      { key: 'child', multiline: true, slice: '{\n    "ok": true\n  }' }
    ]
  );
  assert.deepEqual(listJsonNodes('{"broken":}'), []);
  assert.deepEqual(listJsonNodes('123'), []);
});

test('formatJsonNode expands a single compacted node in place with matching indentation', () => {
  const text = '{\n  "keep": [\n    true\n  ],\n  "child": {"n":9223372036854775807,"s":"<span> []"}\n}';
  const start = text.indexOf('{"n"');
  const end = text.indexOf('}\n}') + 1;
  const expanded = formatJsonNode(text, start, end, 2);
  assert.equal(expanded.start, start);
  assert.equal(expanded.end, end);
  assert.equal(
    text.slice(0, expanded.start) + expanded.text + text.slice(expanded.end),
    '{\n  "keep": [\n    true\n  ],\n  "child": {\n    "n": 9223372036854775807,\n    "s": "<span> []"\n  }\n}'
  );

  const tabText = '{\n\t"child": {"a":1}\n}';
  const tabStart = tabText.indexOf('{"a"');
  const tabEnd = tabText.indexOf('}\n}') + 1;
  const tabExpanded = formatJsonNode(tabText, tabStart, tabEnd, '\t');
  assert.equal(
    tabText.slice(0, tabExpanded.start) + tabExpanded.text + tabText.slice(tabExpanded.end),
    '{\n\t"child": {\n\t\t"a": 1\n\t}\n}'
  );
});
