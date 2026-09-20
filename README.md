# GroveDB structure viewer

A static site that shows the complete GroveDB structure of Dash Platform's Drive, one layer at a time: the root trees, every fixed subtree key, the levels keyed by identity, contract, document type, index value, token or epoch, and the element kind at each of them.

The structure is not written here. It is declared as Rust in [`packages/rs-drive/src/structure`](https://github.com/dashpay/platform/tree/v4.2-dev/packages/rs-drive/src/structure) of `dashpay/platform`, checked against a real GroveDB by tests, and exported to [`packages/rs-drive/grovedb-structure.json`](https://github.com/dashpay/platform/blob/v4.2-dev/packages/rs-drive/grovedb-structure.json). The viewer reads that file by git ref from `raw.githubusercontent.com`.

## What it does

- Dive into a tree and the view zooms through its card into the layer below; Backspace or the breadcrumb goes back up. The rail on the left stacks the layers you came through.
- A small flag marks elements that carry storage flags: who paid for the bytes and in which epoch, which is what refunds are computed from. The details say which kind, who the owner is, what that means and how the flags are laid out in bytes.
- Fixed keys are solid cards, templates such as `{identity_id}` are a stack of cards, nodes that are created on first use or deleted later are dashed, and the colour says which family the element kind belongs to.
- **Merk tree** redraws a layer whose keys are all fixed as its real binary tree, recorded from a GroveDB by replaying a proof. Where a root key hangs decides who pays to rewrite it.
- The **protocol version** scrubber at the bottom removes everything a later version introduced, so you can watch the structure grow.
- `/` searches keys, constants and element kinds; `o` opens the whole tree as an outline.

## Links

| Link | Shows |
| --- | --- |
| `#/identities.identity` | the layer below a node |
| `#/identities.identity/keys` | that layer with one element selected |
| `?ref=v4.3-dev` | another branch, tag or commit of `dashpay/platform` |
| `?pv=11` | the structure as of a protocol version |
| `?base=<sha>&head=<owner>/<repo>@<sha>` | what a pull request adds, changes and removes |
| `?embed=1`, `?theme=light` | for an iframe |

In a comparison, new nodes glow green, removed ones stay as red ghosts, changed ones are amber with a before and after in the details, and every ancestor of a change carries a count so the trail is visible from the root. **Play tour** visits each change. `dashpay/platform` posts such a link on every pull request that changes `grovedb-structure.json`.

## Untrusted data

A comparison link can name any fork, so the loaded file is treated as hostile:

- it is validated against the schema, with limits on size, depth and text length, before anything is drawn, and a file that fails is never rendered;
- the page is built with `createElement` and `textContent` only, under a Content Security Policy that allows no inline script or style and network access to `raw.githubusercontent.com` only;
- a fork can only be named by a full commit (`owner/repo@sha`), source and book links are rebuilt from validated repository paths, and a banner names the source whenever it is not `dashpay/platform`.

## Development

No dependencies and no build step.

```bash
python3 -m http.server 4173
```

```bash
node --test
```

On `localhost` a side of a comparison may be a file served next to the page, which is how the fixtures are used:

```
http://localhost:4173/?base=./data/snapshot.json&head=./test/fixtures/pr-head.json
```

`node test/make-fixtures.mjs` rebuilds the fixtures from `data/snapshot.json`, the copy of the structure the site falls back to when GitHub cannot be reached. A scheduled workflow keeps the snapshot current.

`config.json` names the repository, the path of the structure file, the default ref and the refs offered in the picker.
