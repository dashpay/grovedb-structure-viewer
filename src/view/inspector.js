import { el, icon, clear, copyText } from './dom.js';
import { keyBadge, keyLength, title, rustPath, hexToBytes, holdsLayer, childrenOf, carriedFlags, FLAG_NAMES } from '../data/model.js';
import { blobUrl } from '../data/load.js';
import { familyClass, familyIcon, kindLabel, family, FAMILY_NAMES } from './kinds.js';

const ENCODINGS = {
  raw: 'raw bytes', ascii: 'ASCII text', utf8: 'UTF-8 text', u8: 'one byte', u16_be: 'u16, big endian', u32_be: 'u32, big endian',
  u64_be: 'u64, big endian', var_int: 'variable length integer', identifier32: '32 byte identifier', hash20: '20 byte hash',
  hash32: '32 byte hash', serialized_value: 'document value serialized for ordering', composite: 'several values joined',
};
const PRESENCE = {
  always: 'Created with its parent.', lazy: 'Created on first use.', until_deleted: 'Created with its parent and deleted later, while the parent stays.',
};
const FIELD_NAMES = {
  key: 'Key', kinds: 'Element kind', flags: 'Element flags', flags_note: 'Who the flags name', value: 'Value', reference: 'Points to', since: 'Since', until: 'Until', presence: 'Created',
  recurse: 'Repeats', opaque: 'Holds', kinds_note: 'What decides the kind', description: 'Description', source: 'Source', book: 'Book chapter',
  'merk shape': 'Merk shape',
};

function field(label, ...content) {
  return el('div', { class: 'field' }, el('div', { class: 'label', text: label }), el('div', { class: 'value' }, ...content));
}

function copyable(text, toast) {
  return el('div', { class: 'code' }, el('span', { text }),
    el('button', { class: 'ghost icon-only copy', type: 'button', 'aria-label': 'Copy', on: { click: async () => toast(await copyText(text) ? 'Copied' : 'Copy failed') } }, icon('copy')));
}

function keyField(node) {
  const key = node.key;
  if (key.type === 'dynamic') {
    return field('Key', el('dl', { class: 'kv' },
      el('dt', { text: 'Stands for' }), el('dd', { text: `{${key.name}}` }),
      el('dt', { text: 'Encoding' }), el('dd', { text: ENCODINGS[key.encoding] || key.encoding }),
      el('dt', { text: 'Length' }), el('dd', { text: keyLength(node) }),
    ), el('div', { class: 'note', text: key.description }));
  }
  const bytes = hexToBytes(key.hex);
  const ascii = key.ascii && bytes.length > 0 && bytes.every((byte) => byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(...bytes) : null;
  return field('Key', el('dl', { class: 'kv' },
    el('dt', { text: 'Bytes' }), el('dd', { text: bytes.length === 0 ? 'the empty key' : bytes.length <= 8 ? `[${bytes.join(', ')}]` : `${bytes.length} bytes` }),
    el('dt', { text: 'Hex' }), el('dd', { text: key.hex ? `0x${key.hex}` : '0x' }),
    ascii && el('dt', { text: 'ASCII' }), ascii && el('dd', { text: `'${ascii}'` }),
    key.constant && el('dt', { text: 'Constant' }), key.constant && el('dd', { text: key.constant }),
  ));
}

/** Which element flags sit on the element, who they name, and what flags of that kind mean */
function flagsField(node, model) {
  const carried = carriedFlags(node);
  const shown = node.flags.length > 1 ? node.flags : (carried.length ? carried : node.flags);
  return field(node.flags.length > 1 ? 'Element flags, one of' : 'Element flags',
    el('div', { class: 'chips' }, ...shown.map((flag) => el('span', { class: `chip flag-chip${flag === 'None' ? ' none' : ''}` }, flag !== 'None' && icon('flag'), el('span', { text: FLAG_NAMES[flag] || flag })))),
    node.flags_note && el('div', { class: 'note', text: node.flags_note }),
    ...shown.map((flag) => {
      const info = model.flagKinds.get(flag);
      if (!info || (flag === 'None' && shown.length > 1)) return null;
      return el('details', { class: 'meaning' }, el('summary', { text: flag === 'None' ? 'What having no flags means' : `What ${(FLAG_NAMES[flag] || flag).toLowerCase()} mean` }),
        el('p', { class: 'note', text: info.meaning }),
        flag !== 'None' && el('div', { class: 'code', text: info.layout }));
    }));
}

const describeValue = (name, value) => {
  if (value === undefined) return 'none';
  if (name === 'key') return value.type === 'fixed' ? `0x${value.hex} ${value.label}` : `{${value.name}}`;
  if (name === 'kinds') return value.map(kindLabel).join(', ');
  if (name === 'flags') return value.map((flag) => FLAG_NAMES[flag] || flag).join(', ');
  if (name === 'since' || name === 'until') return `protocol version ${value}`;
  return String(value);
};

export function renderInspector(panel, node, ctx) {
  const { model, source, config, diff, pv, toast, goTo, dive, ascend } = ctx;
  const first = node.kinds[0];
  const isRoot = node.key.type === 'root';
  const tree = holdsLayer(model, node);
  const status = diff?.status.get(node.id);
  const change = diff?.changes.find((entry) => entry.id === node.id && entry.status === 'changed');
  const sourceUrl = node.source ? blobUrl(source, node.source) : null;
  const bookUrl = node.book && config.bookUrl ? `${config.bookUrl}${node.book.replace(/\.md$/, '.html')}` : null;

  const body = el('div', { class: `detail swap ${familyClass(first, model)}` },
    el('div', { class: 'detail-head' },
      el('div', { class: 'detail-icon' }, icon(node.recurse ? 'loop' : familyIcon(first, model))),
      el('div', {}, el('h2', { text: title(node) }), el('div', { class: 'id', text: isRoot ? 'the root of GroveDB' : node.id }))),
    el('p', { text: isRoot ? 'Every subtree of Drive hangs off this layer. Pick a tree to dive into it.' : node.description }),
    el('div', { class: 'actions' },
      tree && ctx.current !== node && el('button', { class: 'btn primary', type: 'button', on: { click: () => dive(node) } }, icon('enter'), el('span', { text: `Open layer (${childrenOf(model, node, pv).length})` })),
      ctx.current === node && !isRoot && el('button', { class: 'btn', type: 'button', on: { click: () => ascend() } }, icon('up'), el('span', { text: 'Up one layer' })),
      node.reference && el('button', { class: 'btn', type: 'button', on: { click: () => goTo(node.reference, { flight: true }) } }, icon('arrow'), el('span', { text: 'Follow reference' })),
    ),
  );

  if (status) {
    body.append(field('In this comparison', el('span', { class: 'note', text: status === 'added' ? 'New in the head.' : status === 'removed' ? 'Removed in the head.' : 'Changed in the head.' })));
  }
  if (change) {
    body.append(field('What changed', el('div', { class: 'before-after' }, ...change.fields.map((name) => el('div', {},
      el('div', { class: 'label', text: FIELD_NAMES[name] || name }),
      name === 'merk shape' ? el('div', { class: 'now', text: 'The recorded Merk shape of this layer differs.' }) : el('div', { class: 'was', text: describeValue(name, change.before[name]) }),
      name !== 'merk shape' && el('div', { class: 'now', text: describeValue(name, node[name]) }),
    )))));
  }

  if (!isRoot) {
    body.append(field('Path', copyable(rustPath(model, node), toast)));
    body.append(keyField(node));
    body.append(field(node.kinds.length > 1 ? 'Element kind, one of' : 'Element kind',
      el('div', { class: 'chips' }, ...node.kinds.map((kind) => el('span', { class: `chip ${familyClass(kind, model)}` }, icon(familyIcon(kind, model)), el('span', { text: kindLabel(kind) })))),
      node.kinds_note && el('div', { class: 'note', text: node.kinds_note })));
    if (node.flags) body.append(flagsField(node, model));
    if (node.value) body.append(field('Value', el('span', { text: node.value })));
    if (node.opaque) body.append(field('Holds', el('span', { text: node.opaque })));
    if (node.reference) body.append(field('Points to', el('button', { class: 'btn', type: 'button', on: { click: () => goTo(node.reference, { flight: true }) } }, icon('ref'), el('span', { text: node.reference }))));
    if (node.recurse) body.append(field('Repeats', el('span', { class: 'note', text: `The levels below are those of ${node.recurse}, to any depth.` })));
    body.append(field('Exists', el('span', { text: `Since protocol version ${node.since}${node.until ? ` until ${node.until}` : ''}. ${PRESENCE[node.presence] || ''}` })));
    const links = [
      sourceUrl && el('a', { class: 'btn', href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, el('span', { text: node.source.split('/').slice(-2).join('/') })),
      bookUrl && el('a', { class: 'btn', href: bookUrl, target: '_blank', rel: 'noopener noreferrer' }, el('span', { text: 'Book chapter' })),
    ].filter(Boolean);
    if (links.length > 0) body.append(field('Defined in', el('div', { class: 'actions' }, ...links)));
  } else {
    const shape = model.shapes.root;
    body.append(field('How to read this', el('span', { class: 'note', text: 'Solid cards are fixed keys. A stack of cards is a template standing for many keys, such as one per identity. A dashed card is created on first use or deleted later. A small flag marks elements that carry storage flags: who paid for the bytes and in which epoch, which is what refunds are computed from. Switch to Merk tree to see the real binary tree of a layer.' })));
    if (shape) body.append(field('Recorded shape', el('span', { class: 'note', text: `From a real GroveDB: ${shape.origin}. A chain that upgraded through earlier versions can differ, since the shape depends on insertion order.` })));
  }

  const families = [...new Set(model.doc.element_kinds.map((kind) => family(kind.name, model)))];
  body.append(el('details', { class: 'legend' }, el('summary', { text: 'Legend' }),
    el('div', { class: 'chips' }, ...families.map((name) => el('span', { class: `chip k-${name}` }, el('span', { text: FAMILY_NAMES[name] }))))));

  if (model.flagKinds.size > 0) {
    body.querySelector('.legend').append(el('div', { class: 'legend-flags' },
      ...[...model.flagKinds.values()].filter((info) => info.name !== 'Other').map((info) => el('p', { class: 'note' },
        el('strong', {}, info.name !== 'None' && icon('flag'), el('span', { text: ` ${FLAG_NAMES[info.name]}. ` })), el('span', { text: info.meaning })))));
  }

  clear(panel).append(body);
}

export function renderChanges(panel, ctx) {
  const { diff, goTo, tour } = ctx;
  const counts = { added: 0, changed: 0, removed: 0 };
  for (const state of diff.status.values()) counts[state] += 1;
  const list = el('ul', { class: 'change-list' }, ...diff.changes.map((change) => el('li', {},
    el('button', { class: `change ${change.status}`, type: 'button', data: { id: change.id }, on: { click: () => goTo(change.id, { flight: true }) } },
      el('span', { class: 'what', text: `${change.status}${change.size ? `, with ${change.size} below` : ''}` }),
      el('span', { class: 'where', text: change.id }),
      change.fields.length > 0 && el('span', { class: 'fields', text: change.fields.map((name) => FIELD_NAMES[name] || name).join(', ') })))));
  clear(panel).append(
    el('div', { class: 'summary' },
      el('span', {}, el('b', { class: 'added', text: `+${counts.added}` }), ' added'),
      el('span', {}, el('b', { class: 'changed', text: `~${counts.changed}` }), ' changed'),
      el('span', {}, el('b', { class: 'removed', text: `-${counts.removed}` }), ' removed')),
    diff.changes.length > 0
      ? el('div', { class: 'actions', style: { 'margin-top': '12px' } }, el('button', { class: 'btn primary', type: 'button', id: 'tour', on: { click: () => tour() } }, icon('play'), el('span', { text: 'Play tour' })))
      : el('p', { class: 'note', text: 'The two structures are identical.' }),
    list);
}
