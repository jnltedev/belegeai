// Curated categorical palette (readable against both light and dark surfaces
// via alpha-overlay rendering on the frontend). Assigning deterministically
// from the tag name means same-named tags always render the same color
// without needing a manual color picker UI.
export const TAG_COLOR_PALETTE = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#d97706", // amber
  "#059669", // emerald
  "#0891b2", // cyan
  "#dc2626", // red
  "#4f46e5", // indigo
  "#65a30d", // lime
  "#0d9488", // teal
];

export function colorForTagName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[index];
}
