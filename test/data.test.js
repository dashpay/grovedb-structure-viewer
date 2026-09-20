import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStructure, InvalidStructure, isRepoPath } from '../src/data/validate.js';
import { diffStructures } from '../src/data/diff.js';
import { buildModel, childrenOf, keyBadge, rustPath, milestones, search, ancestry, carriedFlags } from '../src/data/model.js';
import { parseSource, parseRef, rawUrl, blobUrl, BadSource } from '../src/data/load.js';

const snapshot = () => JSON.parse(readFileSync(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
const config = { repo: 'dashpay/platform', structurePath: 'packages/rs-drive/grovedb-structure.json' };

test('the bundled snapshot is valid', () => {
  validateStructure(snapshot());
});

test('validation rejects hostile documents', () => {
  const cases = {
    'a newer schema': (doc) => { doc.schema_version = 2; },
    'an identifier with markup': (doc) => { doc.root.children[0].id = '<img src=x onerror=alert(1)>'; },
    'a source that is a url': (doc) => { doc.root.children[0].source = 'javascript:alert(1)'; },
    'a source that climbs out': (doc) => { doc.root.children[0].source = 'packages/../../etc/passwd'; },
    'a book link with a scheme': (doc) => { doc.root.children[0].book = 'https://evil.example/x.md'; },
    'a kind with markup': (doc) => { doc.root.children[0].kinds = ['Tree<script>']; },
    'a key that is not hex': (doc) => { doc.root.children[0].key.hex = 'zz'; },
    'a dangling reference': (doc) => { doc.root.children[0].reference = 'nowhere.at_all'; },
    'a duplicate identifier': (doc) => { doc.root.children[1].id = doc.root.children[0].id; },
    'a shape of an unknown node': (doc) => { doc.layer_shapes.nowhere = doc.layer_shapes.root; },
    'an endless description': (doc) => { doc.root.children[0].description = 'x'.repeat(10000); },
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    const doc = snapshot();
    corrupt(doc);
    assert.throws(() => validateStructure(doc), InvalidStructure, name);
  }

  const huge = snapshot();
  const filler = huge.root.children[0];
  for (let i = 0; i < 6000; i += 1) huge.root.children.push({ ...filler, id: `filler_${i}`, children: [] });
  assert.throws(() => validateStructure(huge), InvalidStructure, 'too many nodes');
});

test('repository paths cannot leave the repository or carry a scheme', () => {
  assert.ok(isRepoPath('packages/rs-drive/src/drive/mod.rs'));
  for (const bad of ['/etc/passwd', '../x', 'a/../b', 'https://x', 'javascript:alert(1)', '', 'a b', 'a?b', 'a#b']) {
    assert.equal(isRepoPath(bad), false, bad);
  }
});

test('sources name a ref of the platform repository or a commit of a fork', () => {
  assert.deepEqual(parseSource('v4.2-dev', config), { repo: 'dashpay/platform', ref: 'v4.2-dev', foreign: false });
  assert.deepEqual(parseSource('someone/platform@0123abc', config), { repo: 'someone/platform', ref: '0123abc', foreign: true });
  assert.equal(parseSource('DashPay/platform@0123abc', config).foreign, false);
  for (const bad of ['someone/platform@main', 'evil.example/x/y@0123abc', '../x@0123abc', 'a/b/c@0123abc', 'x@', '@0123abc']) {
    assert.throws(() => parseSource(bad, config), BadSource, bad);
  }
  for (const bad of ['../master', 'a//b', 'a b', '', 'x'.repeat(200), 'a?b=c', 'a#b']) {
    assert.throws(() => parseRef(bad), BadSource, bad);
  }
  assert.equal(
    rawUrl(parseSource('someone/platform@0123abc', config), config),
    'https://raw.githubusercontent.com/someone/platform/0123abc/packages/rs-drive/grovedb-structure.json',
  );
  assert.equal(blobUrl({ repo: 'dashpay/platform', ref: 'v4.2-dev' }, 'javascript:alert(1)'), null);
});

test('the model reads keys, paths and versions', () => {
  const model = buildModel(snapshot());
  const keys = model.byId.get('identities.identity.keys');
  assert.equal(keyBadge(keys), '[128]');
  assert.equal(keyBadge(model.byId.get('identities.identity')), '{identity_id}');
  assert.equal(keyBadge(model.byId.get('votes.contested_resource')), "'c' 99");
  assert.equal(rustPath(model, keys), '[RootTree::Identities, identity_id, IdentityRootStructure::IdentityTreeKeys]');
  assert.deepEqual(ancestry(model, keys).map((node) => node.id), ['root', 'identities', 'identities.identity', 'identities.identity.keys']);

  assert.equal(childrenOf(model, model.root, 1).length, 13);
  assert.equal(childrenOf(model, model.root, 10).length, 14);
  assert.equal(childrenOf(model, model.root, 13).length, 17);
  assert.equal(childrenOf(model, model.root, 14).length, 18);
  assert.deepEqual(milestones(model).map((m) => m.pv), [1, 4, 9, 11, 12, 14]);

  const next = model.byId.get('contracts.contract.documents.document_type.index_property.value.next_property');
  assert.deepEqual(childrenOf(model, next).map((node) => node.id), ['contracts.contract.documents.document_type.index_property.value']);

  assert.equal(search(model, 'TOKEN_BALANCES_KEY')[0].id, 'tokens.balances');
  assert.equal(search(model, 'contract_groups', 13).length, 0);
});

test('the diff finds what a pull request adds, changes and removes', () => {
  const base = snapshot();
  const head = snapshot();
  const root = head.root;

  const moderation = structuredClone(root.children.find((node) => node.id === 'versions'));
  const rename = (node, from, to) => { node.id = node.id.replace(from, to); node.children.forEach((child) => rename(child, from, to)); };
  rename(moderation, 'versions', 'moderation');
  moderation.key.hex = '7e';
  moderation.since = 15;
  root.children.push(moderation);

  const balances = root.children.find((node) => node.id === 'balances');
  balances.kinds = ['BigSumTree'];
  const misc = root.children.find((node) => node.id === 'misc');
  misc.description += ' Reworded.';
  root.children = root.children.filter((node) => node.id !== 'spent_asset_locks');

  const { merged, status, changes, below } = diffStructures(base, head);
  assert.equal(status.get('moderation'), 'added');
  assert.equal(status.get('moderation.counter.version'), 'added');
  assert.equal(status.get('balances'), 'changed');
  assert.equal(status.get('spent_asset_locks'), 'removed');
  assert.equal(status.get('spent_asset_locks.outpoint'), 'removed');

  assert.deepEqual(changes.map((change) => [change.id, change.status, change.size]), [
    ['moderation', 'added', 4],
    ['balances', 'changed', 0],
    ['misc', 'changed', 0],
    ['spent_asset_locks', 'removed', 1],
  ]);
  assert.deepEqual(changes[1].fields, ['kinds']);
  assert.equal(changes[1].editorial, false);
  assert.equal(changes[2].editorial, true);

  assert.ok(merged.root.children.some((node) => node.id === 'spent_asset_locks'), 'the removed tree is put back as a ghost');
  assert.equal(below.get('root'), 9);
  assert.equal(below.get('moderation'), 4);
  validateStructure(merged);

  const unchanged = diffStructures(snapshot(), snapshot());
  assert.equal(unchanged.changes.length, 0);
});

test('element flags are optional, validated, searchable and part of the diff', () => {
  // A file written before flags were described is still valid
  const old = snapshot();
  const strip = (node) => { delete node.flags; delete node.flags_note; node.children.forEach(strip); };
  strip(old.root);
  delete old.flag_kinds;
  validateStructure(old);
  assert.deepEqual(carriedFlags(old.root.children[0]), []);

  const head = structuredClone(old);
  const mark = (node) => { node.flags = ['None']; node.children.forEach(mark); };
  mark(head.root);
  head.flag_kinds = [{ name: 'EpochOwned', meaning: 'Who paid, and when.', layout: 'type byte 2, owner id, base epoch' }];
  const identity = head.root.children.find((node) => node.id === 'identities').children[0];
  identity.flags = ['Epoch'];
  identity.flags_note = 'The epoch the identity was created in.';
  validateStructure(head);

  const model = buildModel(head);
  assert.deepEqual(carriedFlags(model.byId.get('identities.identity')), ['Epoch']);
  assert.equal(model.flagKinds.get('EpochOwned').meaning, 'Who paid, and when.');
  assert.ok(search(model, 'storage flags').some((node) => node.id === 'identities.identity'));

  const marked = structuredClone(head);
  const changed = structuredClone(head);
  changed.root.children.find((node) => node.id === 'identities').children[0].flags = ['EpochOwned'];
  const { changes } = diffStructures(marked, changed);
  assert.deepEqual(changes.map((change) => [change.id, change.fields]), [['identities.identity', ['flags']]]);

  for (const bad of [['Sticky'], [], 'Epoch', ['<img>']]) {
    const doc = structuredClone(head);
    doc.root.children[0].flags = bad;
    assert.throws(() => validateStructure(doc), InvalidStructure, JSON.stringify(bad));
  }
});
