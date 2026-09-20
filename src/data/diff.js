// Compares two structure documents by node identifier.

const STRUCTURAL = ['key', 'kinds', 'flags', 'value', 'reference', 'since', 'until', 'presence', 'recurse', 'opaque'];
const EDITORIAL = ['kinds_note', 'flags_note', 'description', 'source', 'book'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function index(root) {
  const byId = new Map();
  const parent = new Map();
  const visit = (node, above) => {
    byId.set(node.id, node);
    if (above) parent.set(node.id, above.id);
    node.children.forEach((child) => visit(child, node));
  };
  visit(root, null);
  return { byId, parent };
}

/**
 * Returns the head document with the base's removed nodes put back as ghosts,
 * plus what changed:
 *   status   Map id -> 'added' | 'removed' | 'changed'
 *   changes  the list for the changes panel; a subtree that is new or gone as
 *            a whole is one entry with the number of nodes below it
 *   below    Map id -> number of changes strictly below that node
 */
export function diffStructures(base, head) {
  const before = index(base.root);
  const after = index(head.root);
  const status = new Map();
  const changes = [];

  for (const [id, node] of after.byId) {
    const old = before.byId.get(id);
    if (!old) {
      status.set(id, 'added');
      continue;
    }
    const fields = [...STRUCTURAL, ...EDITORIAL].filter((field) => !same(old[field], node[field]));
    if (!same(base.layer_shapes[id], head.layer_shapes[id])) fields.push('merk shape');
    if (fields.length > 0) {
      status.set(id, 'changed');
      changes.push({ id, status: 'changed', fields, editorial: fields.every((field) => EDITORIAL.includes(field)), before: old, size: 0 });
    }
  }

  const merged = structuredClone(head);
  const mergedIndex = index(merged.root);
  for (const [id, node] of before.byId) {
    if (after.byId.has(id)) continue;
    status.set(id, 'removed');
    const parentId = before.parent.get(id);
    // Only the top of a removed subtree is put back; it brings its children
    if (parentId !== undefined && after.byId.has(parentId)) {
      mergedIndex.byId.get(parentId).children.push(structuredClone(node));
    }
  }

  const count = (node) => node.children.reduce((sum, child) => sum + 1 + count(child), 0);
  for (const [id, state] of status) {
    if (state === 'changed') continue;
    const side = state === 'added' ? after : before;
    const parentId = side.parent.get(id);
    if (parentId !== undefined && status.get(parentId) === state) continue;
    changes.push({ id, status: state, fields: [], editorial: false, size: count(side.byId.get(id)) });
  }

  const below = new Map();
  const parents = index(merged.root).parent;
  for (const id of status.keys()) {
    for (let at = parents.get(id); at !== undefined; at = parents.get(at)) below.set(at, (below.get(at) || 0) + 1);
  }

  const order = { added: 0, changed: 1, removed: 2 };
  changes.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
  return { merged, status, changes, below };
}
