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
  assert.equal(narrow.height, GRID.pad * 2 + 5 * GRID.height + 4 * GRID.gap);
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
  const { boxes, leftover, height } = merkLayout(shape, new Map([['73', 's']]), ids, 700);
  assert.equal(leftover.length, 7);
  const rows = new Set(leftover.map((id) => boxes.get(id).y));
  assert.ok(rows.size > 1, 'more than one row');
  for (const id of leftover) assert.ok(boxes.get(id).x + boxes.get(id).w <= 700, `${id} stays on the stage`);
  assert.ok(height > Math.max(...leftover.map((id) => boxes.get(id).y)));
});
