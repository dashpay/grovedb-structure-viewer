import { el, icon, clear } from './dom.js';
import { ancestry, keyBadge, title, childrenOf, holdsLayer, milestones, search, existsIn, shapeOrigin } from '../data/model.js';
import { familyClass, kindLabel } from './kinds.js';

const $ = (id) => document.getElementById(id);

export function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}

export function announce(message) {
  $('live').textContent = message;
}

export function showNotice(message, { error = false } = {}) {
  const node = $('notice');
  node.hidden = !message;
  node.className = error ? 'notice error' : 'notice';
  node.textContent = message || '';
}

/** Which data is on screen: a ref picker, or the two sides of a comparison */
export function renderSource({ config, source, base, onPickRef }) {
  const bar = clear($('source'));
  if (base) {
    bar.append(el('span', { text: 'Comparing' }), el('span', { class: 'pill', text: base.label, title: base.label }),
      el('span', { class: 'versus', text: 'with' }), el('span', { class: 'pill', text: source.label, title: source.label }));
    return;
  }
  const refs = [...new Set([source.ref, ...config.refs])];
  const select = el('select', { 'aria-label': 'Branch of dashpay/platform', on: { change: (event) => onPickRef(event.target.value) } },
    ...refs.map((ref) => el('option', { value: ref, text: ref, selected: ref === source.ref })));
  bar.append(el('span', { text: source.bundled ? 'Bundled snapshot' : config.repo }));
  if (!source.bundled) bar.append(select);
}

export function renderCrumbs({ model, current, selected, onGo }) {
  const bar = clear($('crumbs'));
  const chain = ancestry(model, current);
  chain.forEach((node, index) => {
    if (index > 0) bar.append(el('span', { class: 'crumb-sep', text: '/', 'aria-hidden': 'true' }));
    const last = index === chain.length - 1 && !selected;
    bar.append(el('button', { class: 'crumb', type: 'button', 'aria-current': last ? 'page' : undefined, on: { click: () => onGo(node) } },
      index > 0 && el('span', { class: 'key', text: keyBadge(node) }), el('span', { text: index === 0 ? 'Root' : title(node) })));
  });
  if (selected) {
    bar.append(el('span', { class: 'crumb-sep', text: '/', 'aria-hidden': 'true' }),
      el('span', { class: 'crumb', 'aria-current': 'page' }, el('span', { class: 'key', text: keyBadge(selected) }), el('span', { text: title(selected) })));
  }
  bar.scrollLeft = bar.scrollWidth;
}

/** The layers above as a stack of sheets, the current one on top */
export function renderRail({ model, current, onGo }) {
  const rail = clear($('rail'));
  const chain = ancestry(model, current);
  rail.append(el('div', { class: 'rail-title', text: `Depth ${chain.length - 1}` }));
  const shown = chain.slice(-7);
  if (shown.length < chain.length) rail.append(el('div', { class: 'rail-more', text: `${chain.length - shown.length} more above` }));
  shown.forEach((node, index) => {
    const fromTop = shown.length - 1 - index;
    const sheet = el('button', { class: `sheet${fromTop === 0 ? ' current' : ''}`, type: 'button', on: { click: () => onGo(node) } },
      el('span', { class: 'key', text: node.key.type === 'root' ? 'layer 0' : keyBadge(node) }), el('span', { class: 'name', text: node.key.type === 'root' ? 'Root' : title(node) }));
    sheet.style.setProperty('--from-top', String(fromTop));
    // Only the newest sheet plays its entrance
    if (fromTop !== 0) sheet.style.animation = 'none';
    rail.append(sheet);
  });
}

export function renderLayerHead({ model, current, pv, mode, hasShape, canShape, onMode }) {
  const shape = model.shapes[current.id];
  const head = clear($('layer-head'));
  const isRoot = current.key.type === 'root';
  const count = childrenOf(model, current, pv).length;
  head.append(
    el('h1', { class: 'swap' }, el('span', { text: isRoot ? 'Root layer' : title(current) }), !isRoot && el('span', { class: 'key', text: keyBadge(current) }),
      el('span', { class: 'key', text: `${count} ${count === 1 ? 'key' : 'keys'}` })),
    el('p', { class: 'swap', text: isRoot ? 'The top of Drive\'s GroveDB. Each root tree is a Merk of its own; open one to go a layer down.' : current.description }),
    mode === 'merk' && shape && el('p', { class: 'swap origin', text: `Merk tree of ${shapeOrigin(shape).short}.` }),
    el('div', { class: 'tools' },
      hasShape && el('div', { class: 'segmented', role: 'group', 'aria-label': 'How the layer is drawn' },
        el('button', { type: 'button', 'aria-pressed': String(mode === 'grid'), on: { click: () => onMode('grid') } }, el('span', { text: 'Keys' })),
        el('button', { type: 'button', 'aria-pressed': String(mode === 'merk'), disabled: !canShape, title: canShape ? 'The real binary tree of this layer' : 'The shape is recorded for the latest protocol version only', on: { click: () => onMode('merk') } }, icon('tree'), el('span', { text: 'Merk tree' })))),
  );
}

/** The protocol version scrubber. Built once so a drag is never interrupted; `update` moves it. */
export function createTimeline({ model, onPv }) {
  const bar = clear($('timeline'));
  const stops = milestones(model);
  const latest = model.latest;
  const position = (version) => (latest === 1 ? 0 : (version - 1) / (latest - 1));

  const fill = el('div', { class: 'fill' });
  const marks = Array.from({ length: latest }, (_, index) => {
    const version = index + 1;
    const mark = el('div', { class: 'stop' }, el('span', { text: String(version) }));
    mark.style.left = `calc(8px + (100% - 16px) * ${position(version)})`;
    return mark;
  });
  const input = el('input', { type: 'range', min: 1, max: latest, step: 1, 'aria-label': 'Protocol version', on: { input: (event) => onPv(Number(event.target.value)) } });
  const now = el('strong');
  const count = el('small');
  const hint = el('div', { class: 'hint' });
  bar.append(el('div', { class: 'now' }, now, count), el('div', { class: 'track' }, el('div', { class: 'line' }), fill, ...marks, input), hint);

  function update(pv) {
    const total = [...model.byId.values()].filter((node) => node.key.type !== 'root' && existsIn(node, pv)).length;
    const added = stops.find((stop) => stop.pv === pv);
    now.textContent = `PV ${pv}`;
    count.textContent = `${total} nodes${added && pv > 1 ? `, ${added.count} new here` : ''}`;
    hint.textContent = pv === latest ? 'Drag back to watch the structure grow' : `Latest is ${latest}`;
    fill.style.width = `calc((100% - 16px) * ${position(pv)})`;
    input.value = String(pv);
    input.setAttribute('aria-valuetext', `Protocol version ${pv}`);
    marks.forEach((mark, index) => {
      const version = index + 1;
      const milestone = stops.some((stop) => stop.pv === version);
      mark.className = `stop${milestone ? ' milestone' : ''}${version < pv ? ' passed' : ''}${version === pv ? ' at' : ''}`;
      mark.firstChild.hidden = !(milestone || version === pv);
    });
  }
  return { update };
}

// ── outline ────────────────────────────────────────────────────────────────

export function createOutline({ getState, onPick }) {
  const drawer = $('outline');
  const body = $('outline-body');
  const scrim = $('scrim');
  const open = new Set(['root']);

  function twig(node) {
    const { model, pv, diff, current } = getState();
    const kids = holdsLayer(model, node) && !node.recurse ? childrenOf(model, node, pv) : [];
    const isOpen = open.has(node.id);
    const status = diff?.status.get(node.id) || (diff?.below.get(node.id) ? 'changed' : null);
    const item = el('div', { class: `twig ${familyClass(node.kinds[0], model)}${isOpen ? ' open' : ''}`, role: 'treeitem', 'aria-expanded': kids.length ? String(isOpen) : undefined });
    const row = el('button', { class: `row${current === node ? ' here' : ''}`, type: 'button', on: { click: () => {
      if (kids.length && !isOpen) open.add(node.id); else if (kids.length && current === node) open.delete(node.id);
      onPick(node);
      render();
    } } },
    el('span', { class: 'caret', text: kids.length ? '›' : '' }), el('span', { class: 'dot' }),
    el('span', { class: 'key', text: node.key.type === 'root' ? '' : keyBadge(node) }), el('span', { class: 'name', text: node.key.type === 'root' ? 'Root' : title(node) }),
    status && el('span', { class: `mark ${status}` }));
    item.append(row);
    if (kids.length && isOpen) item.append(el('div', { class: 'kids', role: 'group' }, ...kids.map(twig)));
    return item;
  }

  function render() {
    if (drawer.hidden) return;
    const { model, current } = getState();
    for (const node of ancestry(model, current)) open.add(node.id);
    clear(body).append(twig(model.root));
    body.querySelector('.row.here')?.scrollIntoView({ block: 'nearest' });
  }

  function toggle(force) {
    const show = force ?? drawer.hidden;
    drawer.hidden = !show;
    scrim.hidden = !show;
    if (show) { render(); body.querySelector('.row.here, .row')?.focus(); }
  }
  $('open-outline').addEventListener('click', () => toggle());
  $('close-outline').addEventListener('click', () => toggle(false));
  scrim.addEventListener('click', () => toggle(false));
  return { toggle, render, get isOpen() { return !drawer.hidden; } };
}

// ── search palette ─────────────────────────────────────────────────────────

export function createPalette({ getState, onPick }) {
  const palette = $('palette');
  const input = $('palette-input');
  const results = $('palette-results');
  let hits = [];
  let active = 0;

  function render() {
    const { model, pv } = getState();
    hits = search(model, input.value, pv);
    active = Math.min(active, Math.max(0, hits.length - 1));
    clear(results);
    if (!input.value.trim()) { results.append(el('div', { class: 'palette-empty', text: 'Try: nonce, TOKEN_BALANCES_KEY, SumTree, votes' })); return; }
    if (hits.length === 0) { results.append(el('div', { class: 'palette-empty', text: 'Nothing in this protocol version matches.' })); return; }
    hits.forEach((node, index) => results.append(el('button', { class: `hit ${familyClass(node.kinds[0], model)}`, type: 'button', role: 'option', 'aria-selected': String(index === active),
      on: { click: () => pick(index), mousemove: () => { if (active !== index) { active = index; mark(); } } } },
    el('span', { class: 'dot' }),
    el('span', { class: 'name' }, el('span', { text: title(node) }), el('span', { class: 'key', text: `${keyBadge(node)}  ${kindLabel(node.kinds[0])}` })),
    el('span', { class: 'where', text: node.id }))));
  }
  function mark() {
    [...results.children].forEach((child, index) => child.setAttribute?.('aria-selected', String(index === active)));
    results.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function pick(index) {
    const node = hits[index];
    if (!node) return;
    toggle(false);
    onPick(node);
  }
  function toggle(force) {
    const show = force ?? palette.hidden;
    palette.hidden = !show;
    if (show) { input.value = ''; active = 0; render(); input.focus(); }
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { active = Math.min(active + 1, hits.length - 1); mark(); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { active = Math.max(active - 1, 0); mark(); event.preventDefault(); }
    else if (event.key === 'Enter') { pick(active); event.preventDefault(); }
    else if (event.key === 'Escape') { toggle(false); event.preventDefault(); }
    event.stopPropagation();
  });
  palette.addEventListener('click', (event) => { if (event.target === palette) toggle(false); });
  $('open-search').addEventListener('click', () => toggle());
  return { toggle, get isOpen() { return !palette.hidden; } };
}
