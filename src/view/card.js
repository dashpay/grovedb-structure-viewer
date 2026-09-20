import { el, icon } from './dom.js';
import { keyBadge, keyLength, title, holdsLayer, isOpaque, childrenOf } from '../data/model.js';
import { familyClass, familyIcon, kindLabel } from './kinds.js';

const FLAGS = { added: 'NEW', changed: 'CHANGED', removed: 'REMOVED' };

/** One element of a layer. A button: trees dive, leaves select. */
export function createCard(node, { model, pv, diff, onActivate, onFocus }) {
  const first = node.kinds[0];
  const tree = holdsLayer(model, node);
  const below = tree ? childrenOf(model, node, pv).length : 0;
  const status = diff?.status.get(node.id);
  const trail = diff?.below.get(node.id) || 0;

  const classes = ['card', familyClass(first, model)];
  if (node.key.type === 'dynamic') classes.push('template');
  if (node.presence !== 'always') classes.push('lazy');
  if (!tree) classes.push('leaf');
  if (status) classes.push(status);

  const kindText = node.kinds.length > 1 ? `${kindLabel(first)}` : kindLabel(first);
  const described = [
    title(node), `key ${keyBadge(node)}`, node.kinds.map(kindLabel).join(' or '),
    tree ? `${below} below, press Enter to open` : '',
    status ? FLAGS[status].toLowerCase() : '',
  ].filter(Boolean).join(', ');

  const card = el('button', {
    class: classes.join(' '), type: 'button', data: { id: node.id }, 'aria-label': described,
    on: { click: () => onActivate(node), focus: () => onFocus(node) },
  },
  el('span', { class: 'top' },
    el('span', { class: 'key', text: keyBadge(node) }),
    el('span', { class: 'len', text: keyLength(node) }),
    node.since > 1 && el('span', { class: 'since', text: `PV${node.since}`, title: `Since protocol version ${node.since}` }),
  ),
  el('span', { class: 'name', text: title(node) }),
  el('span', { class: 'bottom' },
    icon(node.recurse ? 'loop' : isOpaque(model, node) ? 'lock' : familyIcon(first, model)),
    el('span', { class: 'kind', text: kindText }),
    node.kinds.length > 1 && el('span', { class: 'more', text: `+${node.kinds.length - 1}` }),
    tree && el('span', { class: 'go' }, el('span', { text: node.recurse ? 'repeats' : String(below) }), icon('enter')),
  ),
  status && el('span', { class: 'flag', text: FLAGS[status] }),
  trail > 0 && status !== 'added' && status !== 'removed'
    && el('span', { class: 'trail', text: String(trail), title: `${trail} change${trail === 1 ? '' : 's'} below` }),
  );
  return card;
}

export function place(card, box) {
  card.style.width = `${box.w}px`;
  card.style.height = `${box.h}px`;
  card.style.transform = `translate(${box.x}px, ${box.y}px)`;
}
