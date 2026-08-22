// Mirrors backend/src/lib/tag-color.ts's TAG_COLOR_PALETTE exactly - the
// color picker on the tags management page only ever offers these, since
// the backend's PATCH /api/tags/:id route rejects anything else.
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
