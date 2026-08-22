// Copies pdf.js's worker script into public/ so it can be served as a plain
// static asset, independent of any bundler-specific asset resolution. Runs
// automatically via the postinstall hook.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "../node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = path.join(__dirname, "../public");
const dest = path.join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("pdfjs-dist worker not found, skipping copy:", src);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.worker.min.mjs to public/");
