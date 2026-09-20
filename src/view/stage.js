import { el, svg, clear, animate, reducedMotion } from './dom.js';
import { createCard, place } from './card.js';
import { gridLayout, merkLayout, neighbour } from './layout.js';
import { childrenOf } from '../data/model.js';

const DIVE = { duration: 560, easing: 'cubic-bezier(.7, 0, .25, 1)' };
const ZOOM = 2.7;

/**
 * The stage shows one GroveDB layer at a time and animates between layers:
 * diving scales the parent up through the clicked card while the new layer
 * grows out of it; ascending plays the same move backwards.
 */
export function createStage(stage, { getState, onActivate, onFocus }) {
  let current = null; // { node, element, cards: Map, layout, mode }
  let selectedId = null;
  let busy = Promise.resolve();

  function layoutFor(node, ids, mode) {
    const { model } = getState();
    const width = stage.clientWidth || 800;
    const shape = mode === 'merk' ? model.shapes[node.id] : null;
    if (!shape) return gridLayout(ids, width);
    const idOfKey = new Map();
    for (const child of childrenOf(model, node)) {
      if (child.key.type === 'fixed' && ids.includes(child.id)) idOfKey.set(child.key.hex, child.id);
    }
    return merkLayout(shape.tree, idOfKey, ids, width);
  }

  function drawEdges(layer, layout, { draw }) {
    layer.querySelector('.edges')?.remove();
    layer.querySelectorAll('.layer-note').forEach((note) => note.remove());
    if (layout.edges.length === 0) return;
    const group = svg('svg', { class: 'edges', 'aria-hidden': 'true' });
    layout.edges.forEach((edge, index) => {
      const bend = (edge.x2 - edge.x1) / 2;
      const path = svg('path', { d: `M${edge.x1} ${edge.y1} C${edge.x1 + bend} ${edge.y1} ${edge.x2 - bend} ${edge.y2} ${edge.x2} ${edge.y2}` });
      const label = svg('text', { x: edge.x2 - 14, y: edge.y2 + (edge.side === 'left' ? -5 : 13) });
      label.textContent = edge.side === 'left' ? 'L' : 'R';
      group.append(path, label);
      if (draw && !reducedMotion()) {
        const length = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1) * 1.3;
        path.style.strokeDasharray = String(length);
        path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 520, delay: 220 + index * 28, easing: 'ease-out', fill: 'backwards' })
          .finished.then(() => { path.style.strokeDasharray = ''; }, () => {});
        label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 520 + index * 28, fill: 'backwards' });
      }
    });
    layer.prepend(group);
    if (layout.leftover.length > 0) {
      const note = el('div', { class: 'layer-note', text: 'Not in the recorded shape: created after genesis' });
      note.style.left = `${layout.left}px`;
      note.style.top = `${layout.leftoverTop}px`;
      layer.append(note);
    }
  }

  function buildLayer(node, mode) {
    const state = getState();
    const children = childrenOf(state.model, node, state.pv);
    const ids = children.map((child) => child.id);
    const usedMode = mode === 'merk' && state.model.shapes[node.id] ? 'merk' : 'grid';
    const layout = layoutFor(node, ids, usedMode);
    const element = el('div', { class: 'layer', role: 'group', 'aria-label': 'Elements of this layer' });
    element.style.height = `${layout.height}px`;
    const cards = new Map();
    for (const child of children) {
      const card = createCard(child, { ...state, onActivate, onFocus });
      card.classList.toggle('compact', usedMode === 'merk');
      card.classList.toggle('selected', child.id === selectedId);
      place(card, layout.boxes.get(child.id));
      cards.set(child.id, card);
      element.append(card);
    }
    if (children.length === 0) {
      element.append(el('div', { class: 'layer-empty' },
        el('strong', { text: node.opaque ? 'Not a Merk of elements' : 'Nothing is described below' }),
        el('span', { text: node.opaque || 'Either nothing writes here yet, or this level holds values only.' })));
      element.style.height = '220px';
    }
    drawEdges(element, layout, { draw: false });
    return { node, element, cards, layout, mode: usedMode };
  }

  function stagger(layer, delay) {
    let index = 0;
    for (const card of layer.cards.values()) {
      animate(card, [{ opacity: 0, translate: '0 16px', scale: '.97' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 380, delay: delay + Math.min(index * 24, 420), easing: 'cubic-bezier(.2, .8, .2, 1)' });
      index += 1;
    }
  }

  const centreOf = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

  async function transition(next, how, through, timing) {
    const previous = current;
    current = next;
    stage.style.setProperty('--layer-height', next.element.style.height);
    if (!previous || how === 'none' || reducedMotion()) {
      clear(stage).append(next.element);
      stage.scrollTop = 0;
      if (previous && !reducedMotion()) stagger(next, 0);
      return;
    }

    const scrolled = stage.scrollTop;
    previous.element.classList.add('leaving');
    stage.append(next.element);

    if (how === 'dive') {
      const box = previous.layout.boxes.get(through);
      const origin = box ? centreOf(box) : { x: stage.clientWidth / 2, y: scrolled + stage.clientHeight / 2 };
      stage.scrollTop = 0;
      previous.element.style.transformOrigin = `${origin.x}px ${origin.y}px`;
      next.element.style.transformOrigin = `${origin.x}px ${origin.y - scrolled}px`;
      stagger(next, 170);
      await Promise.all([
        animate(previous.element, [
          { transform: `translateY(${-scrolled}px) scale(1)`, opacity: 1, filter: 'blur(0px)' },
          { transform: `translateY(${-scrolled}px) scale(${ZOOM})`, opacity: 0, filter: 'blur(7px)' },
        ], timing),
        animate(next.element, [
          { transform: 'scale(.32)', opacity: 0 },
          { opacity: 0, offset: .25 },
          { transform: 'scale(1)', opacity: 1 },
        ], timing),
      ]);
    } else if (how === 'ascend') {
      const box = next.layout.boxes.get(through);
      const origin = box ? centreOf(box) : { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
      // Bring the card we came out of into view before the move starts
      const target = Math.max(0, Math.min(origin.y - stage.clientHeight / 2, next.layout.height - stage.clientHeight));
      stage.scrollTop = target;
      const settled = stage.scrollTop;
      previous.element.style.transformOrigin = `${origin.x}px ${origin.y - settled + scrolled}px`;
      next.element.style.transformOrigin = `${origin.x}px ${origin.y}px`;
      await Promise.all([
        animate(previous.element, [
          { transform: `translateY(${settled - scrolled}px) scale(1)`, opacity: 1 },
          { transform: `translateY(${settled - scrolled}px) scale(.32)`, opacity: 0 },
        ], timing),
        animate(next.element, [
          { transform: `scale(${ZOOM})`, opacity: 0, filter: 'blur(7px)' },
          { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
        ], timing),
      ]);
    } else {
      stage.scrollTop = 0;
      stagger(next, 60);
      await animate(previous.element, [{ opacity: 1, transform: `translateY(${-scrolled}px)` }, { opacity: 0, transform: `translateY(${-scrolled + 10}px)` }], { duration: 200, easing: 'ease-in' });
    }
    previous.element.remove();
    next.element.style.transformOrigin = '';
  }

  /** Shows the layer below `node`. `how`: dive | ascend | swap | none. `through`: the card the move passes through. */
  function show(node, { how = 'swap', through, quick = false } = {}) {
    const mode = getState().mode;
    busy = busy.then(() => {
      const next = buildLayer(node, mode);
      return transition(next, how, through, quick ? { ...DIVE, duration: 320 } : DIVE);
    }).catch((error) => { console.error(error); });
    return busy;
  }

  /** Re-lays the current layer after the protocol version, the mode, the diff or the width changed */
  function reflow({ animated = true } = {}) {
    busy = busy.then(async () => {
      if (!current) return;
      const before = current;
      const next = buildLayer(before.node, getState().mode);
      const moving = animated && !reducedMotion();
      stage.replaceChild(next.element, before.element);
      current = next;
      stage.style.setProperty('--layer-height', next.element.style.height);
      if (!moving) return;

      const jobs = [];
      for (const [id, card] of next.cards) {
        const from = before.layout.boxes.get(id);
        const to = next.layout.boxes.get(id);
        if (!from) {
          jobs.push(animate(card, [{ opacity: 0, scale: '.8' }, { opacity: 1, scale: '1' }], { duration: 420, delay: 140, easing: 'cubic-bezier(.2, .8, .2, 1)' }));
        } else if (from.x !== to.x || from.y !== to.y || from.w !== to.w) {
          jobs.push(animate(card, [
            { transform: `translate(${from.x}px, ${from.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
            { transform: `translate(${to.x}px, ${to.y}px) scale(1, 1)` },
          ], { duration: 520, easing: 'cubic-bezier(.3, .9, .25, 1)' }));
        }
      }
      // Cards that are gone fade where they stood
      for (const [id, card] of before.cards) {
        if (next.cards.has(id)) continue;
        next.element.append(card);
        jobs.push(animate(card, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.8' }], { duration: 300, easing: 'ease-in' }).then(() => card.remove()));
      }
      drawEdges(next.element, next.layout, { draw: next.mode === 'merk' && before.mode !== 'merk' });
      await Promise.all(jobs);
    }).catch((error) => { console.error(error); });
    return busy;
  }

  function select(id) {
    selectedId = id;
    if (!current) return;
    for (const [cardId, card] of current.cards) card.classList.toggle('selected', cardId === id);
  }

  /** Scrolls a card into view and rings it, once any move in progress has ended */
  function ping(id) {
    busy.then(() => {
      const card = current?.cards.get(id);
      if (!card) return;
      const box = current.layout.boxes.get(id);
      const top = Math.max(0, box.y + box.h / 2 - stage.clientHeight / 2);
      stage.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
      card.querySelector('.pinger')?.remove();
      const ring = el('span', { class: 'pinger' });
      card.append(ring);
      setTimeout(() => ring.remove(), 2000);
    });
  }

  function focus(id) {
    const card = current?.cards.get(id) || current?.cards.values().next().value;
    card?.focus({ preventScroll: false });
  }

  function move(direction) {
    if (!current || current.cards.size === 0) return;
    const active = document.activeElement?.dataset?.id;
    const from = current.cards.has(active) ? active : selectedId;
    focus(current.cards.has(from) ? neighbour(current.layout.boxes, from, direction) : undefined);
  }

  // Only a change of width moves cards; the first callback reports the size we already laid out for
  let resizeTimer;
  let laidOutWidth = stage.clientWidth;
  new ResizeObserver(() => {
    if (stage.clientWidth === laidOutWidth) return;
    laidOutWidth = stage.clientWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => reflow({ animated: false }), 80);
  }).observe(stage);

  return {
    show, reflow, select, ping, focus, move,
    get node() { return current?.node; },
    get hasShape() { return Boolean(current && getState().model.shapes[current.node.id]); },
    whenIdle: () => busy,
  };
}
