import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridLayout, merkLayout, neighbour, GRID } from '../src/view/layout.js';

test('the grid wraps to the stage width and centres its rows', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const wide = gridLayout(ids, 1000);
  assert.equal(wide.boxes.get('a').y, wide.boxes.get('c').y);
  assert.ok(wide.boxes.get('e').y > wide.boxes.get('a').y);
  const narrow = gridLayout(ids, 320);
  assert.equal(new Set([...narrow.boxes.values()].map((box) => box.x)).size, 1);
  assert.equal(narrow.height, GRID.narrowPad * 2 + 5 * GRID.height + 4 * GRID.gap);
});

test('a single column fills a narrow stage instead of floating in it', () => {
  for (const stageWidth of [262, 320, 440]) {
    const { boxes } = gridLayout(['a', 'b'], stageWidth);
    const box = boxes.get('a');
    assert.equal(box.x, GRID.narrowPad, `${stageWidth}: left edge`);
    assert.equal(box.x + box.w, stageWidth - GRID.narrowPad, `${stageWidth}: right edge`);
  }
  // The number of columns never drops as the stage widens
  let last = 0;
  for (let stageWidth = 240; stageWidth <= 1400; stageWidth += 1) {
    const { boxes } = gridLayout(['a', 'b', 'c', 'd'], stageWidth);
    const columns = new Set([...boxes.values()].map((box) => box.x)).size;
    assert.ok(columns >= last, `${stageWidth}: ${columns} columns after ${last}`);
    last = columns;
  }
  // Wide enough for one column only, but not so wide the card stretches without end
  const { boxes } = gridLayout(['a', 'b'], 500);
  assert.equal(boxes.get('a').w, GRID.maxWidth);
  assert.equal(boxes.get('a').x, (500 - GRID.maxWidth) / 2);
});

test('the merk layout keeps keys ascending downwards and the root leftmost', () => {
  const shape = { hex: '40', left: { hex: '20', left: { hex: '10' } }, right: { hex: '60' } };
  const idOfKey = new Map([['40', 'docs'], ['20', 'ids'], ['10', 'tokens'], ['60', 'balances']]);
  const { boxes, edges, leftover } = merkLayout(shape, idOfKey, ['tokens', 'ids', 'docs', 'balances', 'late'], 1200);
  const order = ['tokens', 'ids', 'docs', 'balances'];
  for (let i = 1; i < order.length; i += 1) assert.ok(boxes.get(order[i]).y > boxes.get(order[i - 1]).y);
  assert.ok(boxes.get('docs').x < boxes.get('ids').x);
  assert.ok(boxes.get('ids').x < boxes.get('tokens').x);
  assert.deepEqual(edges.map((edge) => `${edge.from}>${edge.to}:${edge.side}`).sort(), ['docs>balances:right', 'docs>ids:left', 'ids>tokens:left']);
  assert.deepEqual(leftover, ['late']);
  assert.ok(boxes.get('late').y > boxes.get('balances').y);
});

test('arrow keys find the nearest card in a direction', () => {
  const { boxes } = gridLayout(['a', 'b', 'c', 'd'], 600);
  assert.equal(neighbour(boxes, 'a', 'right'), 'b');
  assert.equal(neighbour(boxes, 'a', 'down'), 'c');
  assert.equal(neighbour(boxes, 'd', 'up'), 'b');
  assert.equal(neighbour(boxes, 'a', 'left'), 'a');
});

test('cards outside the shape wrap below it instead of running off the stage', () => {
  const shape = { hex: '73' };
  const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const groupOf = (id) => (id < 'e' ? 'Not in the layer yet' : 'No longer in the layer');
  const { boxes, leftover, height, notes } = merkLayout(shape, new Map([['73', 's']]), ids, 700, groupOf);
  assert.equal(leftover.length, 7);
  const rows = new Set(leftover.map((id) => boxes.get(id).y));
  assert.ok(rows.size > 1, 'more than one row');
  for (const id of leftover) assert.ok(boxes.get(id).x + boxes.get(id).w <= 700, `${id} stays on the stage`);
  assert.ok(height > Math.max(...leftover.map((id) => boxes.get(id).y)));
  // A one key tree has no edges; what is missing is still explained, group by group
  assert.deepEqual(notes.map((note) => [note.label, note.ids]), [['Not in the layer yet', ['a', 'b', 'c', 'd']], ['No longer in the layer', ['e', 'f', 'g']]]);
  assert.ok(notes[1].y > Math.max(...notes[0].ids.map((id) => boxes.get(id).y)));
});
