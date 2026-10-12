// Author: CA
import { RIG_LAYOUTS } from './rig-layout-data.mjs';
import { BACKPACK_LAYOUTS } from './backpack-layout-data.mjs';
const signature = pockets => pockets.map(g => `${g.width}x${g.height}`).sort().join(',');
const bounds = pockets => ({ width: Math.max(...pockets.map(g => g.x + g.width)), height: Math.max(...pockets.map(g => g.y + g.height)) });
export function rigLayout(rig) {
  const reference = RIG_LAYOUTS[rig.id] ?? BACKPACK_LAYOUTS[rig.id];
  const exact = reference?.pockets.map(([x, y, width, height]) => ({ x, y, width, height }));
  if (exact && signature(exact) === signature(rig.grids)) return { reviewed: true, reference: reference.reference, pockets: exact, ...bounds(exact) };
  // A future item or changed pocket dimensions must not use an obsolete layout.
  // Preserve the recorded pocket sizes and clearly label the arrangement.
  let x = 0, y = 0, rowHeight = 0;
  const gap = .16, rowWidth = 9;
  const pockets = rig.grids.map(g => {
    if (x > 0 && x + g.width > rowWidth) { y += rowHeight + gap; x = 0; rowHeight = 0; }
    const pocket = { ...g, x, y };
    x += g.width + gap; rowHeight = Math.max(rowHeight, g.height);
    return pocket;
  });
  return { reviewed: false, pockets, ...bounds(pockets) };
}
