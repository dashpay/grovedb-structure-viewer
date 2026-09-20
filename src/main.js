import { loadConfig, loadStructure, loadLocal, parseSource, parseRef, BadSource, NoStructure } from './data/load.js';
import { InvalidStructure } from './data/validate.js';
import { buildModel, ancestry, holdsLayer, existsIn, title, layerOf } from './data/model.js';
import { diffStructures } from './data/diff.js';
import { createStage } from './view/stage.js';
import { renderInspector, renderChanges } from './view/inspector.js';
import { el, clear, reducedMotion } from './view/dom.js';
import {
  toast, announce, showNotice, renderSource, renderCrumbs, renderRail, renderLayerHead, createTimeline, createOutline, createPalette,
} from './view/chrome.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const onLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

const state = {
  config: null, model: null, diff: null, source: null, base: null,
  pv: 1, mode: 'grid', current: null, selected: null, touring: false,
};

let stage;
let outline;
let timeline;

// ── theme ──────────────────────────────────────────────────────────────────

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: the page still works */ }
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}
applyTheme(params.get('theme') || readStored('theme') || 'dark');
$('toggle-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  store('theme', next);
});
if (params.has('embed')) document.body.classList.add('embed');

// ── url ────────────────────────────────────────────────────────────────────

function readHash() {
  const [layerId = '', selectedSegment = ''] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  return { layerId: layerId || 'root', selectedSegment };
}

function writeUrl({ replace = false } = {}) {
  const layer = state.current.id === 'root' ? '' : state.current.id;
  const selected = state.selected ? `/${state.selected.id.split('.').pop()}` : '';
  const query = new URLSearchParams(location.search);
  if (state.pv === state.model.latest) query.delete('pv'); else query.set('pv', String(state.pv));
  const search = query.toString();
  const url = `${location.pathname}${search ? `?${search}` : ''}#/${layer}${selected}`;
  if (url === `${location.pathname}${location.search}${location.hash}`) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

// ── rendering around the stage ─────────────────────────────────────────────

function context() {
  return {
    ...state, toast,
    goTo: (id, options) => goTo(state.model.byId.get(id), options),
    dive: (node) => enter(node),
    ascend: () => ascend(),
    tour: () => toggleTour(),
  };
}

function renderChrome() {
  const canShape = state.pv === state.model.latest;
  renderCrumbs({ model: state.model, current: state.current, selected: state.selected, onGo: (node) => showLayer(node) });
  renderRail({ model: state.model, current: state.current, onGo: (node) => showLayer(node) });
  renderLayerHead({
    model: state.model, current: state.current, pv: state.pv, mode: canShape ? state.mode : 'grid',
    hasShape: Boolean(state.model.shapes[state.current.id]), canShape,
    onMode: (mode) => { state.mode = mode; renderChrome(); stage.reflow(); },
  });
  renderInspector($('panel-details'), state.selected || state.current, context());
  outline.render();
  document.title = `${state.current.id === 'root' ? 'Root' : title(state.current)} · GroveDB structure`;
}

function select(node, { quiet = false } = {}) {
  state.selected = node;
  stage.select(node?.id ?? null);
  renderCrumbs({ model: state.model, current: state.current, selected: node, onGo: (target) => showLayer(target) });
  renderInspector($('panel-details'), node || state.current, context());
  if (!quiet) { writeUrl({ replace: true }); showTab('details'); }
}

// ── navigation ─────────────────────────────────────────────────────────────

/** The layers to pass through from one layer to another: up to the common ancestor, then down */
function route(from, to) {
  const up = ancestry(state.model, from);
  const down = ancestry(state.model, to);
  let shared = 0;
  while (shared < up.length && shared < down.length && up[shared] === down[shared]) shared += 1;
  const hops = [];
  for (let i = up.length - 2; i >= shared - 1; i -= 1) hops.push({ node: up[i], how: 'ascend', through: up[i + 1].id });
  for (let i = shared; i < down.length; i += 1) hops.push({ node: down[i], how: 'dive', through: down[i].id });
  return hops;
}

/** Moves the stage to the layer below `target`, animating every layer on the way */
async function showLayer(target, { push = true } = {}) {
  if (!target || !holdsLayer(state.model, target)) return;
  if (target === state.current) { select(null, { quiet: true }); return; }
  const hops = route(state.current, target);
  state.selected = null;
  stage.select(null);
  if (hops.length > 5 || reducedMotion()) {
    state.current = target;
    renderChrome();
    await stage.show(target, { how: 'swap' });
  } else {
    for (const hop of hops) {
      state.current = hop.node;
      renderChrome();
      await stage.show(hop.node, { how: hop.how, through: hop.through, quick: hops.length > 1 });
    }
  }
  announce(`Layer ${state.current.id === 'root' ? 'root' : title(state.current)}, ${stage.node ? 'open' : ''}`);
  if (push) writeUrl();
}

/** A card was activated: trees open, everything else is selected */
function enter(node) {
  if (!holdsLayer(state.model, node)) { select(node); return; }
  if (node.recurse) {
    const target = layerOf(state.model, node);
    toast(`Index levels repeat: back at ${title(target)}`);
    showLayer(target);
    return;
  }
  showLayer(node);
}

function ascend() {
  if (state.selected) { select(null); return; }
  const parent = state.model.parentOf.get(state.current.id);
  if (parent) showLayer(parent);
}

/** Brings a node on screen: its parent's layer, with the node selected and pinged */
async function goTo(node, { push = true } = {}) {
  if (!node) return;
  if (!existsIn(node, state.pv)) await setPv(state.model.latest);
  const parent = state.model.parentOf.get(node.id);
  if (!parent) { await showLayer(state.model.root, { push }); return; }
  await showLayer(parent, { push: false });
  select(node, { quiet: true });
  stage.ping(node.id);
  if (push) writeUrl();
}

async function setPv(pv) {
  if (pv === state.pv) return;
  state.pv = pv;
  if (pv !== state.model.latest && state.mode === 'merk') state.mode = 'grid';
  if (state.selected && !existsIn(state.selected, pv)) state.selected = null;
  // A layer that does not exist yet in that version: go up until one does
  let layer = state.current;
  while (layer && layer.key.type !== 'root' && !existsIn(layer, pv)) layer = state.model.parentOf.get(layer.id);
  timeline.update(pv);
  if (layer !== state.current) { await showLayer(layer); return; }
  renderChrome();
  writeUrl({ replace: true });
  await stage.reflow();
}

// ── comparison ─────────────────────────────────────────────────────────────

function showTab(name) {
  const details = name === 'details';
  $('tab-details').setAttribute('aria-selected', String(details));
  $('tab-changes').setAttribute('aria-selected', String(!details));
  $('panel-details').hidden = !details;
  $('panel-changes').hidden = details;
}

let tourRun = 0;
async function toggleTour() {
  const button = $('tour');
  if (state.touring) { state.touring = false; tourRun += 1; return; }
  state.touring = true;
  const run = (tourRun += 1);
  const label = button?.querySelector('span:last-child');
  if (label) label.textContent = 'Stop tour';
  const stops = state.diff.changes.filter((change) => !change.editorial);
  for (const change of stops.length ? stops : state.diff.changes) {
    if (run !== tourRun) break;
    document.querySelectorAll('.change.active').forEach((node) => node.classList.remove('active'));
    document.querySelector(`.change[data-id="${CSS.escape(change.id)}"]`)?.classList.add('active');
    await goTo(state.model.byId.get(change.id), { push: false });
    await new Promise((resolve) => { setTimeout(resolve, 2200); });
  }
  state.touring = false;
  if (label) label.textContent = 'Play tour';
  document.querySelectorAll('.change.active').forEach((node) => node.classList.remove('active'));
}

// ── keyboard ───────────────────────────────────────────────────────────────

function onKey(event, palette) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);
  if (event.key === 'Escape') {
    if (palette.isOpen) palette.toggle(false); else if (outline.isOpen) outline.toggle(false); else ascend();
    return;
  }
  if (typing || palette.isOpen) return;
  const arrows = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (arrows[event.key] && !outline.isOpen && (event.target === document.body || event.target.closest('#stage'))) {
    stage.move(arrows[event.key]); event.preventDefault();
  } else if (event.key === 'Backspace') { ascend(); event.preventDefault(); }
  else if (event.key === '/') { palette.toggle(true); event.preventDefault(); }
  else if (event.key === 'o') outline.toggle();
  else if (event.key === 'm' && stage.hasShape && state.pv === state.model.latest) { state.mode = state.mode === 'merk' ? 'grid' : 'merk'; renderChrome(); stage.reflow(); }
  else if (event.key === '[') setPv(Math.max(1, state.pv - 1));
  else if (event.key === ']') setPv(Math.min(state.model.latest, state.pv + 1));
}

// ── start ──────────────────────────────────────────────────────────────────

async function loadSide(value, config, fallbackLabel) {
  // On localhost a side may be a file served next to the page, for testing
  if (onLocalhost && value.endsWith('.json')) return { doc: await loadLocal(value), source: { repo: config.repo, ref: config.defaultRef, label: value, foreign: false } };
  const source = parseSource(value, config);
  source.label = source.foreign || value.includes('@') ? `${source.repo}@${source.ref.slice(0, 10)}` : source.ref;
  return { doc: await loadStructure(source, config), source, fallbackLabel };
}

async function start() {
  const stageElement = $('stage');
  stageElement.append(el('div', { class: 'loading', text: 'Loading the structure' }));
  const config = await loadConfig();
  state.config = config;

  const headParam = params.get('head') || params.get('ref') || config.defaultRef;
  const baseParam = params.get('base');
  let head;
  let base = null;
  try {
    head = await loadSide(headParam, config);
    if (baseParam) base = await loadSide(baseParam, config);
  } catch (error) {
    if (error instanceof NoStructure && !baseParam) {
      showNotice(`${headParam} has no grovedb-structure.json yet. Showing the snapshot bundled with the viewer.`);
    } else if (error instanceof BadSource || error instanceof InvalidStructure || baseParam) {
      showNotice(`Could not show ${baseParam ? 'that comparison' : 'that ref'}: ${error.message} Showing the bundled snapshot instead.`, { error: true });
    } else {
      showNotice('Could not reach GitHub. Showing the snapshot bundled with the viewer.');
    }
    head = { doc: await loadLocal('./data/snapshot.json'), source: { repo: config.repo, ref: config.defaultRef, label: 'snapshot', bundled: true, foreign: false } };
    base = null;
  }

  let doc = head.doc;
  if (base) {
    state.diff = diffStructures(base.doc, head.doc);
    doc = state.diff.merged;
    state.base = base.source;
  }
  state.source = head.source;
  state.model = buildModel(doc);
  const wantedPv = Number(params.get('pv'));
  state.pv = Number.isInteger(wantedPv) && wantedPv >= 1 && wantedPv <= state.model.latest ? wantedPv : state.model.latest;
  state.current = state.model.root;

  if (head.source.foreign) {
    showNotice(`This structure comes from ${head.source.repo} at ${head.source.ref.slice(0, 10)}, not from ${config.repo}. It is unreviewed.`);
  }

  clear(stageElement);
  stage = createStage(stageElement, {
    getState: () => state,
    onActivate: (node) => enter(node),
    onFocus: () => {},
  });
  outline = createOutline({ getState: () => state, onPick: (node) => (holdsLayer(state.model, node) && !node.recurse ? showLayer(node) : goTo(node)) });
  const palette = createPalette({ getState: () => state, onPick: (node) => goTo(node) });

  renderSource({
    config, source: head.source, base: state.base,
    onPickRef: (ref) => { const query = new URLSearchParams(location.search); query.set('ref', parseRef(ref)); location.search = query.toString(); },
  });
  timeline = createTimeline({ model: state.model, onPv: setPv });
  timeline.update(state.pv);

  if (state.diff) {
    $('side-tabs').hidden = false;
    const count = state.diff.changes.length;
    $('tab-changes').append(el('span', { class: 'badge', text: String(count) }));
    $('tab-details').addEventListener('click', () => showTab('details'));
    $('tab-changes').addEventListener('click', () => showTab('changes'));
    renderChanges($('panel-changes'), context());
  }

  // First view: what the link names, else the first change of a comparison, else the root
  const { layerId, selectedSegment } = readHash();
  const layer = state.model.byId.get(layerId);
  state.current = layer && holdsLayer(state.model, layer) ? layer : state.model.root;
  renderChrome();
  await stage.show(state.current, { how: 'none' });
  const named = selectedSegment && state.model.byId.get(`${layerId === 'root' ? '' : `${layerId}.`}${selectedSegment}`);
  if (named) { select(named, { quiet: true }); stage.ping(named.id); }
  else if (state.diff && !location.hash && state.diff.changes.length > 0) {
    showTab('changes');
    const first = state.diff.changes.find((change) => !change.editorial) || state.diff.changes[0];
    await goTo(state.model.byId.get(first.id), { push: false });
  }

  window.addEventListener('popstate', () => {
    const at = readHash();
    const target = state.model.byId.get(at.layerId) || state.model.root;
    showLayer(target, { push: false }).then(() => {
      const chosen = at.selectedSegment && state.model.byId.get(`${at.layerId === 'root' ? '' : `${at.layerId}.`}${at.selectedSegment}`);
      select(chosen || null, { quiet: true });
    });
  });
  window.addEventListener('keydown', (event) => onKey(event, palette));
}

start().catch((error) => {
  console.error(error);
  showNotice(`The viewer could not start: ${error.message}`, { error: true });
  clear($('stage'));
});
