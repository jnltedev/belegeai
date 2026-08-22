import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/// The running version, used for the footer and for comparing against the
/// latest GitHub release.
///
/// Read from package.json, with nothing to configure: the version is a
/// property of what was built, not a deployment decision, and an override
/// could only ever make the footer disagree with the code it describes.
export const APP_VERSION: string = (() => {
  try {
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/// Compares two dotted version numbers. Returns a positive number when `a`
/// is newer, zero when they match, negative when `a` is older.
///
/// Deliberately small: this only ever compares this project's own release
/// tags against its own package version, both plain "major.minor.patch".
/// Anything after a hyphen ("1.2.0-rc.1") counts as older than the release
/// it precedes, which is the convention people expect.
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [core, pre] = value.replace(/^v/, "").split("-", 2);
    const parts = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
    return { parts, pre: pre ?? null };
  };

  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.parts.length, right.parts.length); i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1;
  if (right.pre === null) return -1;
  return left.pre < right.pre ? -1 : 1;
}
