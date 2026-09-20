// Read-only helpers over a validated structure document.

export function buildModel(doc) {
  const byId = new Map();
  const parentOf = new Map();
  const visit = (node, parent) => {
    byId.set(node.id, node);
    if (parent) parentOf.set(node.id, parent);
    node.children.forEach((child) => visit(child, node));
  };
  visit(doc.root, null);
  const kinds = new Map(doc.element_kinds.map((kind) => [kind.name, kind]));
  const flagKinds = new Map((doc.flag_kinds || []).map((kind) => [kind.name, kind]));
  return { doc, root: doc.root, byId, parentOf, kinds, flagKinds, shapes: doc.layer_shapes, latest: doc.latest_protocol_version };
}

/**
 * Where a layer's recorded Merk shape comes from, in words. A layer reached
 * through fixed keys only is recorded from a fresh chain; a layer below a
 * template exists once per identity, contract and so on, and is recorded from
 * one instance built by a test fixture.
 */
export function shapeOrigin(shape) {
  const genesis = /^genesis@(\d+)$/.exec(shape.origin);
  if (genesis) {
    return {
      short: `fresh chain, protocol version ${genesis[1]}`,
      long: `Recorded from a real GroveDB: a fresh chain at protocol version ${genesis[1]}. A chain that upgraded through earlier versions inserted the same keys in another order, so its shape can differ.`,
    };
  }
  const fixture = /^fixture ([a-z0-9_]+)@(\d+)$/.exec(shape.origin);
  if (fixture) {
    return {
      short: `one instance, from the test fixture ${fixture[1]}`,
      long: `This layer exists once per key above it. The shape is recorded from one instance in a real GroveDB: the fullest one the test fixture ${fixture[1]} builds, at protocol version ${fixture[2]}. Another instance can differ when it holds fewer keys or got them in another order.`,
    };
  }
  return { short: shape.origin, long: `Recorded from a real GroveDB: ${shape.origin}.` };
}

export function existsIn(node, pv) {
  return node.since <= pv && (node.until === undefined || pv <= node.until);
}

/** The node whose children describe the layer below `node` (follows `recurse`) */
export function layerOf(model, node) {
  return (node.recurse && model.byId.get(node.recurse)) || node;
}

export function childrenOf(model, node, pv) {
  return layerOf(model, node).children.filter((child) => pv === undefined || existsIn(child, pv));
}

export function holdsLayer(model, node) {
  return node.kinds.some((name) => {
    const kind = model.kinds.get(name);
    return kind && kind.is_tree && !kind.is_opaque;
  });
}

export function isOpaque(model, node) {
  return node.kinds.length > 0 && node.kinds.every((name) => model.kinds.get(name)?.is_opaque);
}

/** The kinds of element flags the element can carry, leaving out "none" */
export function carriedFlags(node) {
  return (node.flags || []).filter((flag) => flag !== 'None');
}

/**
 * The kinds of element flags a node lists. A file that describes flags leaves
 * them out of a node whose element carries none; a file written before flags
 * were described says nothing, and then neither does the viewer.
 */
export function flagsOf(model, node) {
  if (node.flags) return node.flags;
  return model.flagKinds.size > 0 ? ['None'] : null;
}

export const FLAG_NAMES = { None: 'No flags', Epoch: 'Storage flags', EpochOwned: 'Storage flags with an owner', Other: 'Other flags' };

export function isReference(model, node) {
  return node.kinds.some((name) => model.kinds.get(name)?.is_reference);
}

/** The nodes from the root down to `node`, root included */
export function ancestry(model, node) {
  const chain = [];
  for (let at = node; at; at = model.parentOf.get(at.id)) chain.unshift(at);
  return chain;
}

export function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

const printable = (byte) => byte >= 0x21 && byte <= 0x7e;

/** How a key reads on a card: `[32]`, `'c' 99`, `{identity_id}`, `00…01` */
export function keyBadge(node) {
  const key = node.key;
  if (key.type === 'root') return 'root';
  if (key.type === 'dynamic') return `{${key.name}}`;
  const bytes = hexToBytes(key.hex);
  if (bytes.length === 0) return '[ ] empty key';
  if (bytes.length === 1) return key.ascii && printable(bytes[0]) ? `'${String.fromCharCode(bytes[0])}' ${bytes[0]}` : `[${bytes[0]}]`;
  if (bytes.length <= 4) return `[${bytes.join(', ')}]`;
  return `0x${key.hex.slice(0, 4)}…${key.hex.slice(-4)}`;
}

export function keyLength(node) {
  const key = node.key;
  if (key.type === 'fixed') return `${key.hex.length / 2} B`;
  if (key.type !== 'dynamic') return '';
  if (key.matcher.type === 'len') return `${key.matcher.len} B`;
  if (key.matcher.type === 'len_in') return `${key.matcher.len.join(' / ')} B`;
  return 'any length';
}

export function title(node) {
  const key = node.key;
  if (key.type === 'root') return 'GroveDB root';
  if (key.type === 'fixed') return key.label;
  return key.name.replace(/_/g, ' ');
}

/** The path as Drive code would write it: `[RootTree::Identities, identity_id, IdentityTreeKeys]` */
export function rustPath(model, node) {
  const parts = ancestry(model, node).slice(1).map((at) => {
    const key = at.key;
    if (key.type === 'dynamic') return key.name;
    if (key.constant) return key.constant;
    const bytes = hexToBytes(key.hex);
    return bytes.length <= 4 ? `[${bytes.join(', ')}]` : `0x${key.hex}`;
  });
  return `[${parts.join(', ')}]`;
}

/** Every protocol version that adds or removes nodes, with how many */
export function milestones(model) {
  const added = new Map();
  for (const node of model.byId.values()) {
    if (node.key.type === 'root') continue;
    added.set(node.since, (added.get(node.since) || 0) + 1);
  }
  return [...added.entries()].sort((a, b) => a[0] - b[0]).map(([pv, count]) => ({ pv, count }));
}

export function search(model, query, pv) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  for (const node of model.byId.values()) {
    if (node.key.type === 'root' || (pv !== undefined && !existsIn(node, pv))) continue;
    const key = node.key;
    const haystack = [node.id, title(node), key.constant, key.label, key.name, node.kinds.join(' '), node.description, carriedFlags(node).map((flag) => `flags ${FLAG_NAMES[flag]}`).join(' ')]
      .filter(Boolean).join(' ').toLowerCase();
    const at = haystack.indexOf(needle);
    if (at !== -1) hits.push({ node, rank: (node.id.toLowerCase().includes(needle) ? 0 : 1000) + at + node.id.length / 100 });
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, 40).map((hit) => hit.node);
}
