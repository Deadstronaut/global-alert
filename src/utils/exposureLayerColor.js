/**
 * Deterministic per-dataset color assignment for exposure map layers (spec 042).
 * Okabe-Ito colorblind-safe categorical palette — distinguishable under the
 * most common color-vision-deficiency types (deuteranopia, protanopia,
 * tritanopia), per Constitution Principle VI.
 */

const PALETTE = [
  '#E69F00', // orange
  '#56B4E9', // sky blue
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#999999', // grey (fallback/8th)
]

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Same datasetId always returns the same color within this palette. */
export function colorForDataset(datasetId) {
  const id = String(datasetId ?? '')
  const index = hashString(id) % PALETTE.length
  return PALETTE[index]
}
