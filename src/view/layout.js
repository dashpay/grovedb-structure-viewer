// Pure layout: where each card of a layer goes. No DOM in here.

export const GRID = { width: 232, maxWidth: 420, height: 104, gap: 16, pad: 28, narrowPad: 16, narrow: 520 };
export const MERK = { width: 176, height: 46, gapX: 56, gapY: 10, pad: 28 };

/** Cards in rows, centred, fixed keys first in key order then templates */
export function gridLayout(ids, stageWidth) {
  const { height, gap } = GRID;
  const pad = stageWidth < GRID.narrow ? GRID.narrowPad : GRID.pad;
  const usable = stageWidth - pad * 2;
  const columns = Math.max(1, Math.min(ids.length || 1, Math.floor((usable + gap) / (GRID.width + gap))));
  // A single column takes the stage's width, so a phone is not mostly margin
  const width = columns === 1 ? Math.max(160, Math.min(GRID.maxWidth, usable)) : GRID.width;
  const rowWidth = columns * width + (columns - 1) * gap;
  const left = Math.max(pad, (stageWidth - rowWidth) / 2);
  const boxes = new Map();
  ids.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    boxes.set(id, { x: left + column * (width + gap), y: pad + row * (height + gap), w: width, h: height });
  });
  const rows = Math.ceil(ids.length / columns);
  return { boxes, edges: [], height: pad * 2 + rows * height + Math.max(0, rows - 1) * gap, leftover: [] };
}

/**
 * The layer drawn as its Merk: the root on the left, children to the right,
 * keys ascending from top to bottom (so the upper child is the left child).
 * `idOfKey` maps a key's hex to the card showing it. Cards the shape does not
 * hold are listed under it; `groupOf` names the group a left over card belongs to.
 */
export function merkLayout(shape, idOfKey, ids, stageWidth, groupOf) {
  const { height, gapY, pad } = MERK;
  const placed = [];
  let row = 0;
  let depthMax = 0;
  const walk = (node, depth, parent, side) => {
    if (node.left) walk(node.left, depth + 1, node, 'left');
    const id = idOfKey.get(node.hex);
    node.row = row;
    node.depth = depth;
    row += 1;
    depthMax = Math.max(depthMax, depth);
    placed.push({ node, id, parent, side });
    if (node.right) walk(node.right, depth + 1, node, 'right');
  };
  walk(shape, 0, null, null);

  // Deep trees get narrower columns before they get a scrollbar
  const columns = depthMax + 1;
  const room = stageWidth - pad * 2;
  const gapX = columns * MERK.width + depthMax * MERK.gapX > room ? 36 : MERK.gapX;
  const width = Math.max(132, Math.min(MERK.width, Math.floor((room - depthMax * gapX) / columns)));
  const treeWidth = columns * width + depthMax * gapX;
  const left = Math.max(pad, (stageWidth - treeWidth) / 2);
  const at = (node) => ({ x: left + node.depth * (width + gapX), y: pad + node.row * (height + gapY), w: width, h: height });

  const boxes = new Map();
  const edges = [];
  for (const { node, id, parent, side } of placed) {
    if (id === undefined) continue;
    const box = at(node);
    boxes.set(id, box);
    if (parent && idOfKey.get(parent.hex) !== undefined) {
      const from = at(parent);
      edges.push({
        from: idOfKey.get(parent.hex), to: id, side,
        x1: from.x + from.w, y1: from.y + from.h / 2, x2: box.x, y2: box.y + box.h / 2,
      });
    }
  }

  // Cards the shape does not hold go below it, grouped by why they are not
  // there, each group under its own label and in rows that wrap to the stage
  const leftover = ids.filter((id) => !boxes.has(id));
  const groups = new Map();
  for (const id of leftover) {
    const label = groupOf ? groupOf(id) : '';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(id);
  }
  const notes = [];
  let bottom = pad + row * (height + gapY);
  const perRow = Math.max(1, Math.floor((stageWidth - left - pad + 12) / (width + 12)));
  for (const [label, members] of groups) {
    bottom += 36;
    notes.push({ label, x: left, y: bottom - 26, ids: members });
    members.forEach((id, index) => {
      boxes.set(id, { x: left + (index % perRow) * (width + 12), y: bottom + Math.floor(index / perRow) * (height + gapY), w: width, h: height });
    });
    bottom += Math.ceil(members.length / perRow) * (height + gapY);
  }
  return { boxes, edges, height: bottom + pad, leftover, notes, left };
}

/** The nearest card in a direction, for arrow key navigation */
export function neighbour(boxes, fromId, direction) {
  const from = boxes.get(fromId);
  if (!from) return boxes.keys().next().value;
  const centre = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const origin = centre(from);
  let best;
  let bestScore = Infinity;
  for (const [id, box] of boxes) {
    if (id === fromId) continue;
    const c = centre(box);
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) continue;
    const score = along + across * 3;
    if (score < bestScore) { bestScore = score; best = id; }
  }
  return best ?? fromId;
}
