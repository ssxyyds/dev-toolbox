'use strict';

// The native textarea remains the only editable/copyable source. Its mirror
// is decorative and falls back to plain text for unusually large documents.
function attachJsonColors(input, mirror, options = {}) {
  const { gutter = null, highlight = null, onToggleNode = null } = options;
  const track = gutter?.firstElementChild ?? null;
  const surface = input.parentElement;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let entries = [];
  let hoveredEntry = null;

  function updateHighlight() {
    if (!highlight) return;
    if (!hoveredEntry) { highlight.hidden = true; return; }
    const { startSpan, endSpan } = hoveredEntry;
    const top = startSpan.offsetTop - input.scrollTop;
    const bottom = endSpan.offsetTop + (endSpan.offsetHeight || startSpan.offsetHeight || 21) - input.scrollTop;
    highlight.style.top = `${Math.round(top)}px`;
    highlight.style.height = `${Math.max(20, Math.round(bottom - top))}px`;
    highlight.hidden = false;
  }

  function scroll() {
    mirror.scrollTop = input.scrollTop;
    mirror.scrollLeft = input.scrollLeft;
    if (track) track.style.transform = `translateY(${-input.scrollTop}px)`;
    updateHighlight();
  }

  function repositionGutter() {
    if (!entries.length) return;
    let lastTop = -Infinity;
    for (const entry of entries) {
      const top = entry.startSpan.offsetTop;
      const hidden = Math.abs(top - lastTop) < 6;
      entry.button.hidden = hidden;
      if (!hidden) {
        lastTop = top;
        const lineHeight = entry.startSpan.offsetHeight || 21;
        entry.button.style.top = `${Math.round(top + (lineHeight - 20) / 2)}px`;
      }
    }
    updateHighlight();
  }

  function updateActiveNode() {
    if (!entries.length) return;
    const from = input.selectionStart, to = input.selectionEnd;
    let active = null;
    for (const entry of entries) {
      if (entry.button.hidden) continue;
      if (from >= entry.node.keyStart && to <= entry.node.end) active = entry;
    }
    for (const entry of entries) entry.button.classList.toggle('is-active', entry === active);
  }

  function sync() {
    mirror.style.width = `${input.clientWidth}px`;
    mirror.style.height = `${input.clientHeight}px`;
    mirror.classList.toggle('wrap', input.wrap !== 'off');
    repositionGutter();
    scroll();
  }

  function appendPlainWithBraces(fragment, text, from, to, braces, cursor) {
    let pos = from;
    while (cursor.index < braces.length && braces[cursor.index].pos < to) {
      const brace = braces[cursor.index++];
      if (brace.pos < pos) continue;
      if (brace.pos > pos) fragment.append(text.slice(pos, brace.pos));
      const span = document.createElement('span');
      span.textContent = text[brace.pos];
      brace.assign(span);
      fragment.append(span);
      pos = brace.pos + 1;
    }
    if (pos < to) fragment.append(text.slice(pos, to));
  }

  function buildNodeButton(entry) {
    const { node } = entry;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `json-node-btn ${node.multiline ? 'is-compact' : 'is-expand'}`;
    const action = node.multiline ? '压缩当前节点' : '展开当前节点';
    const label = node.key !== null ? `${action}：${node.key}` : action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.start = String(node.start);
    button.dataset.end = String(node.end);
    button.dataset.mode = node.multiline ? 'compact' : 'expand';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', node.multiline ? '#icon-node-compact' : '#icon-node-expand');
    svg.append(use);
    button.append(svg);
    const enter = () => { hoveredEntry = entry; updateHighlight(); };
    const leave = () => { if (hoveredEntry === entry) { hoveredEntry = null; updateHighlight(); } };
    button.addEventListener('mouseenter', enter);
    button.addEventListener('focus', enter);
    button.addEventListener('mouseleave', leave);
    button.addEventListener('blur', leave);
    button.addEventListener('click', () => {
      hoveredEntry = null;
      updateHighlight();
      onToggleNode?.(node);
    });
    return button;
  }

  function render() {
    const text = input.value;
    const fragment = document.createDocumentFragment();
    let offset = 0, count = 0;
    const nodes = gutter && onToggleNode && text && text.length <= 250000 ? ToolCore.listJsonNodes(text).slice(0, 1000) : [];
    const nodeEntries = nodes.map(node => ({ node, startSpan: null, endSpan: null, button: null }));
    const braces = [];
    for (const entry of nodeEntries) {
      braces.push({ pos: entry.node.start, assign: span => { entry.startSpan = span; } });
      braces.push({ pos: entry.node.end - 1, assign: span => { entry.endSpan = span; } });
    }
    braces.sort((a, b) => a.pos - b.pos);
    const braceCursor = { index: 0 };

    if (text && text.length <= 250000) {
      // Consume incomplete strings too, so unfinished input stays readable.
      const tokens = /"(?:\\[^\n]|[^"\\\n])*(?:"|\\?($|(?=\n)))|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
      for (const match of text.matchAll(tokens)) {
        if (++count > 6000) break;
        const span = document.createElement('span');
        const value = match[0], end = match.index + value.length;
        let kind = 'literal';
        if (value[0] === '"') {
          let i = end;
          while (i < text.length && /[ \t\r\n]/.test(text[i])) i++;
          kind = text[i] === ':' ? 'key' : 'string';
        } else if (/[-\d]/.test(value[0])) kind = 'number';
        span.className = `json-${kind}`;
        span.textContent = value;
        if (braces.length) appendPlainWithBraces(fragment, text, offset, match.index, braces, braceCursor);
        else fragment.append(text.slice(offset, match.index));
        fragment.append(span);
        offset = end;
      }
    }
    const active = count > 0 && count <= 6000;
    if (active) {
      if (braces.length) appendPlainWithBraces(fragment, text, offset, text.length, braces, braceCursor);
      else fragment.append(text.slice(offset));
      if (text.endsWith('\n')) fragment.append('\n');
    }
    mirror.replaceChildren(...(active ? [fragment] : []));
    surface.classList.toggle('colored', active);

    hoveredEntry = null;
    if (highlight) highlight.hidden = true;
    entries = active ? nodeEntries.filter(entry => entry.startSpan && entry.endSpan) : [];
    if (gutter && track) {
      gutter.hidden = entries.length === 0;
      if (entries.length) {
        const gutterFragment = document.createDocumentFragment();
        for (const entry of entries) {
          entry.button = buildNodeButton(entry);
          gutterFragment.append(entry.button);
        }
        track.replaceChildren(gutterFragment);
      } else {
        track.replaceChildren();
      }
    }
    sync();
    updateActiveNode();
  }

  let frame;
  new ResizeObserver(sync).observe(input);
  input.addEventListener('scroll', scroll);
  for (const eventName of ['keyup', 'mouseup', 'select', 'focus']) input.addEventListener(eventName, updateActiveNode);
  if (gutter) {
    gutter.addEventListener('wheel', event => {
      const before = input.scrollTop;
      input.scrollTop += event.deltaY;
      if (input.scrollTop !== before) event.preventDefault();
    }, { passive: false });
  }
  return { sync, refresh() { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); } };
}
