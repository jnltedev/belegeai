// Server-only. Deliberately reads process.env directly (never a
// NEXT_PUBLIC_ variable, which Next.js would bake into the client bundle at
// build time) so that changing LOGO_FILENAME in .env and restarting the
// frontend container takes effect immediately, matching every other
// env-driven setting in this app - no image rebuild needed.
//
// LOGO_FILENAME accepts two forms:
//   - a bare filename (e.g. "logo.svg") - served by Next's own static
//     handler straight from public/branding/, which docker-compose bind-
//     mounts from ./branding/ on the host.
//   - a full http(s) URL - used verbatim as the <img>/favicon src, for a
//     logo hosted elsewhere instead of uploaded into ./branding/.
export function getLogoUrl(): string | null {
  const value = process.env.LOGO_FILENAME?.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Otherwise treat it as a bare filename, no path traversal - this is
  // admin-controlled config, not user input, but there's no reason to
  // allow anything else.
  if (!/^[\w.-]+\.(png|svg)$/i.test(value)) return null;
  return `/branding/${value}`;
}
