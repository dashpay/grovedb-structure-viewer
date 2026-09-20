// Everything the viewer loads can come from a fork named in a link, so it is
// checked before anything is drawn. A document that fails is never rendered.

const LIMITS = { nodes: 5000, depth: 64, text: 4000, children: 1000, shapeNodes: 2000 };

const ID = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const HEX = /^([0-9a-f]{2})*$/;
const REPO_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;
const NAME = /^[A-Za-z0-9_]+$/;
const PRESENCE = new Set(['always', 'lazy', 'until_deleted']);
const FLAGS = new Set(['None', 'Epoch', 'EpochOwned', 'Other']);
const ENCODINGS = new Set([
  'raw', 'ascii', 'utf8', 'u8', 'u16_be', 'u32_be', 'u64_be', 'var_int',
  'identifier32', 'hash20', 'hash32', 'serialized_value', 'composite',
]);

export class InvalidStructure extends Error {}

function fail(where, what) {
  throw new InvalidStructure(`${where}: ${what}`);
}

function text(value, where, { optional = false, max = LIMITS.text } = {}) {
  if (value === undefined && optional) return;
  if (typeof value !== 'string') fail(where, 'expected text');
  if (value.length > max) fail(where, 'text too long');
}

function version(value, where, { optional = false } = {}) {
  if (value === undefined && optional) return;
  if (!Number.isInteger(value) || value < 1 || value > 100000) fail(where, 'expected a protocol version');
}

/** A repository relative path: no scheme, no leading slash, no `..` */
export function isRepoPath(value) {
  return typeof value === 'string' && value.length <= 300 && REPO_PATH.test(value) && !value.split('/').includes('..');
}

function key(value, where) {
  if (!value || typeof value !== 'object') fail(where, 'expected a key');
  if (value.type === 'root') return;
  if (value.type === 'fixed') {
    if (typeof value.hex !== 'string' || value.hex.length > 512 || !HEX.test(value.hex)) fail(where, 'expected hex key bytes');
    text(value.label, `${where}.label`, { max: 200 });
    text(value.constant, `${where}.constant`, { max: 200 });
    if (value.ascii !== undefined && typeof value.ascii !== 'boolean') fail(where, 'expected ascii to be a flag');
    return;
  }
  if (value.type === 'dynamic') {
    text(value.name, `${where}.name`, { max: 200 });
    text(value.description, `${where}.description`);
    if (!ENCODINGS.has(value.encoding)) fail(where, 'unknown key encoding');
    const matcher = value.matcher;
    if (!matcher || typeof matcher !== 'object') fail(where, 'expected a key matcher');
    if (matcher.type === 'any') return;
    if (matcher.type === 'len' && Number.isInteger(matcher.len) && matcher.len >= 0 && matcher.len < 100000) return;
    if (matcher.type === 'len_in' && Array.isArray(matcher.len) && matcher.len.length < 64
      && matcher.len.every((len) => Number.isInteger(len) && len >= 0 && len < 100000)) return;
    fail(where, 'unknown key matcher');
  }
  fail(where, 'unknown key type');
}

function node(value, where, depth, state) {
  if (!value || typeof value !== 'object') fail(where, 'expected a node');
  if (depth > LIMITS.depth) fail(where, 'too deep');
  if (++state.nodes > LIMITS.nodes) fail(where, 'too many nodes');

  if (typeof value.id !== 'string' || value.id.length > 600 || !ID.test(value.id)) fail(where, 'bad identifier');
  if (state.ids.has(value.id)) fail(where, `identifier ${value.id} used twice`);
  state.ids.add(value.id);

  key(value.key, `${value.id}.key`);
  if (!Array.isArray(value.kinds) || value.kinds.length === 0 || value.kinds.length > 64) fail(value.id, 'expected element kinds');
  for (const kind of value.kinds) {
    if (typeof kind !== 'string' || !NAME.test(kind) || kind.length > 80) fail(value.id, 'bad element kind');
  }
  text(value.kinds_note, `${value.id}.kinds_note`, { optional: true });
  // Files written before element flags were described have none
  if (value.flags !== undefined) {
    if (!Array.isArray(value.flags) || value.flags.length === 0 || value.flags.length > 8 || !value.flags.every((flag) => FLAGS.has(flag))) fail(value.id, 'bad element flags');
  }
  text(value.flags_note, `${value.id}.flags_note`, { optional: true });
  text(value.value, `${value.id}.value`, { optional: true });
  text(value.description, `${value.id}.description`);
  text(value.opaque, `${value.id}.opaque`, { optional: true });
  version(value.since, `${value.id}.since`);
  version(value.until, `${value.id}.until`, { optional: true });
  if (!PRESENCE.has(value.presence)) fail(value.id, 'unknown presence');
  if (value.source !== '' && !isRepoPath(value.source)) fail(value.id, 'source must be a repository path');
  if (value.book !== undefined && !isRepoPath(value.book)) fail(value.id, 'book must be a repository path');
  for (const field of ['reference', 'recurse']) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string' || !ID.test(value[field])) fail(value.id, `bad ${field} target`);
      state.targets.push([value.id, field, value[field]]);
    }
  }
  // The states the layer below goes through, each with the keys it holds then
  if (value.states !== undefined) {
    if (!Array.isArray(value.states) || value.states.length > 16) fail(value.id, 'expected states');
    for (const state of value.states) {
      if (!state || typeof state.name !== 'string' || !NAME.test(state.name) || state.name.length > 80) fail(value.id, 'bad state name');
      text(state.title, `${value.id}.states.${state.name}.title`, { max: 200 });
      text(state.description, `${value.id}.states.${state.name}.description`);
      if (!Array.isArray(state.keys) || state.keys.length > LIMITS.children
        || !state.keys.every((segment) => typeof segment === 'string' && NAME.test(segment) && segment.length <= 120)) fail(value.id, 'bad state keys');
    }
  }
  if (!Array.isArray(value.children) || value.children.length > LIMITS.children) fail(value.id, 'expected children');
  value.children.forEach((child, index) => node(child, `${value.id}.children[${index}]`, depth + 1, state));
}

function shapeNode(value, where, depth, state) {
  if (!value || typeof value !== 'object') fail(where, 'expected a shape node');
  if (depth > LIMITS.depth) fail(where, 'shape too deep');
  if (++state.shapeNodes > LIMITS.shapeNodes) fail(where, 'shape too large');
  if (typeof value.hex !== 'string' || value.hex.length > 512 || !HEX.test(value.hex)) fail(where, 'expected hex key bytes');
  if (value.left !== undefined) shapeNode(value.left, `${where}.left`, depth + 1, state);
  if (value.right !== undefined) shapeNode(value.right, `${where}.right`, depth + 1, state);
}

/** Throws InvalidStructure unless `doc` is a structure document the viewer understands. */
export function validateStructure(doc) {
  if (!doc || typeof doc !== 'object') fail('document', 'expected an object');
  if (doc.schema_version !== 1) fail('document', `schema version ${String(doc.schema_version).slice(0, 20)} is not supported`);
  version(doc.latest_protocol_version, 'latest_protocol_version');

  if (!Array.isArray(doc.element_kinds) || doc.element_kinds.length > 200) fail('element_kinds', 'expected a list');
  for (const kind of doc.element_kinds) {
    if (!kind || typeof kind.name !== 'string' || !NAME.test(kind.name) || kind.name.length > 80) fail('element_kinds', 'bad kind');
    for (const flag of ['is_tree', 'is_opaque', 'is_reference']) {
      if (typeof kind[flag] !== 'boolean') fail(`element_kinds.${kind.name}`, `expected ${flag}`);
    }
  }

  if (doc.flag_kinds !== undefined) {
    if (!Array.isArray(doc.flag_kinds) || doc.flag_kinds.length > 16) fail('flag_kinds', 'expected a list');
    for (const kind of doc.flag_kinds) {
      if (!kind || !FLAGS.has(kind.name)) fail('flag_kinds', 'bad kind');
      text(kind.meaning, `flag_kinds.${kind.name}.meaning`);
      text(kind.layout, `flag_kinds.${kind.name}.layout`);
    }
  }

  const state = { nodes: 0, shapeNodes: 0, ids: new Set(), targets: [] };
  node(doc.root, 'root', 0, state);
  if (doc.root.key.type !== 'root') fail('root', 'expected the root key');
  for (const [from, field, target] of state.targets) {
    if (!state.ids.has(target)) fail(from, `${field} target does not exist`);
  }

  const shapes = doc.layer_shapes;
  if (!shapes || typeof shapes !== 'object' || Array.isArray(shapes)) fail('layer_shapes', 'expected an object');
  for (const [id, shape] of Object.entries(shapes)) {
    if (!state.ids.has(id)) fail('layer_shapes', 'shape of an unknown node');
    if (!shape || typeof shape !== 'object') fail(`layer_shapes.${id}`, 'expected a shape');
    text(shape.origin, `layer_shapes.${id}.origin`, { max: 100 });
    shapeNode(shape.tree, `layer_shapes.${id}.tree`, 0, state);
    if (shape.states !== undefined) {
      if (!Array.isArray(shape.states) || shape.states.length > 16) fail(`layer_shapes.${id}`, 'expected state shapes');
      shape.states.forEach((entry, index) => {
        if (!entry || typeof entry.state !== 'string' || !NAME.test(entry.state) || entry.state.length > 80) fail(`layer_shapes.${id}`, 'bad state');
        text(entry.origin, `layer_shapes.${id}.states[${index}].origin`, { max: 100 });
        shapeNode(entry.tree, `layer_shapes.${id}.states[${index}].tree`, 0, state);
      });
    }
  }
  return doc;
}
