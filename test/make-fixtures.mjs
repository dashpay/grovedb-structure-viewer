// Builds the fixtures the compare mode is tested with, from the bundled snapshot:
//   pr-head.json   what a pull request adding a root tree, a subtree and a kind change looks like
//   hostile.json   a document that tries to smuggle markup and links; the viewer must refuse it
import { readFileSync, writeFileSync } from 'node:fs';

const read = () => JSON.parse(readFileSync(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
const write = (name, doc) => writeFileSync(new URL(`./fixtures/${name}`, import.meta.url), `${JSON.stringify(doc, null, 1)}\n`);
const find = (node, id) => (node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean));

const head = read();
const leaf = (id, hex, label, kind, description, extra = {}) => ({
  id, key: { type: 'fixed', hex, label, constant: label.toUpperCase() }, kinds: [kind], since: 15, presence: 'always',
  source: 'packages/rs-drive/src/drive/mod.rs', description, children: [], ...extra,
});
const template = (id, name, kind, description, children = []) => ({
  id, key: { type: 'dynamic', name, matcher: { type: 'len', len: 32 }, encoding: 'identifier32', description: `The ${name.replace(/_/g, ' ')}` },
  kinds: [kind], since: 15, presence: 'always', source: 'packages/rs-drive/src/drive/mod.rs', description, children,
});

head.latest_protocol_version = 15;
head.root.children.push({
  ...leaf('moderation', '7e', 'Moderation', 'Tree', 'Moderation teams elected per contract, with their charters and challenges.'),
  children: [
    { ...leaf('moderation.teams', '00', 'Teams', 'Tree', 'One team per moderated contract.'), children: [
      template('moderation.teams.contract', 'contract_id', 'Tree', 'The team of one contract.', [
        leaf('moderation.teams.contract.charter', '00', 'Charter', 'Item', 'What the team may do.', { value: 'serialized ModerationCharter' }),
        { ...leaf('moderation.teams.contract.members', '01', 'Members', 'SumTree', 'The members; the sum is their total power.'), children: [
          template('moderation.teams.contract.members.member', 'identity_id', 'SumItem', 'One member and their power.'),
        ] },
      ]),
    ] },
    { ...leaf('moderation.challenges', '01', 'Challenges', 'CountTree', 'Open challenges against a team.'), children: [] },
  ],
});
find(head.root, 'withdrawals').children.push(
  leaf('withdrawals.fee_band', '06', 'FeeBand', 'Item', 'The fee band the next withdrawal must fall in.', { value: 'two u64, big endian' }),
);
find(head.root, 'balances').kinds = ['BigSumTree'];
find(head.root, 'misc').description += ' Reworded.';
head.root.children = head.root.children.filter((node) => node.id !== 'spent_asset_locks');
write('pr-head.json', head);

const hostile = read();
const first = hostile.root.children[0];
first.description = '<img src=x onerror="document.title=\'pwned\'"><script>document.title="pwned"</script>';
first.source = 'javascript:document.title="pwned"';
first.key.label = '"><svg onload=alert(1)>';
write('hostile.json', hostile);

// Valid by the schema, but every text field carries markup: it must show as text
const markup = read();
const victim = markup.root.children[0];
victim.description = '<img src=x onerror="document.title=\'pwned\'"><b>bold</b>';
victim.key.label = '<script>document.title="pwned"</script>';
victim.key.constant = '<i>constant</i>';
write('markup.json', markup);
