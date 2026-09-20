// Element kinds grouped into families that share a colour and an icon.

const FAMILIES = {
  Tree: 'tree',
  SumTree: 'sum', BigSumTree: 'sum', ProvableSumTree: 'sum',
  CountTree: 'count', ProvableCountTree: 'count',
  CountSumTree: 'countsum', ProvableCountSumTree: 'countsum', ProvableCountProvableSumTree: 'countsum',
  ProvableSumIndexedTree: 'indexed', ProvableCountIndexedTree: 'indexed', ProvableCountProvableSumIndexedTree: 'indexed',
  CommitmentTree: 'opaque', MmrTree: 'opaque', BulkAppendTree: 'opaque', DenseAppendOnlyFixedSizeTree: 'opaque', PrivateDocumentStore: 'opaque',
  Item: 'item', ItemWithBackwardsReferences: 'item',
  SumItem: 'sumitem', ItemWithSumItem: 'sumitem', SumItemWithBackwardsReferences: 'sumitem', ItemWithSumItemWithBackwardsReferences: 'sumitem',
  Reference: 'ref', ReferenceWithSumItem: 'ref', BidirectionalReference: 'ref',
};

const ICONS = { tree: 'tree', sum: 'sum', count: 'count', countsum: 'sum', indexed: 'tree', opaque: 'lock', item: 'item', sumitem: 'sum', ref: 'ref' };

export const FAMILY_NAMES = {
  tree: 'Tree', sum: 'Sum trees', count: 'Count trees', countsum: 'Count and sum trees', indexed: 'Indexed trees',
  opaque: 'Non-Merk trees', item: 'Item', sumitem: 'Sum items', ref: 'References',
};

export function family(kind, model) {
  if (FAMILIES[kind]) return FAMILIES[kind];
  const info = model?.kinds.get(kind);
  if (info?.is_reference) return 'ref';
  if (info?.is_opaque) return 'opaque';
  return info?.is_tree ? 'tree' : 'item';
}

export const familyClass = (kind, model) => `k-${family(kind, model)}`;
export const familyIcon = (kind, model) => ICONS[family(kind, model)];

/** `ProvableCountSumTree` reads better as `Provable count sum tree` */
export function kindLabel(kind) {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c) => ` ${c.toLowerCase()}`);
}
