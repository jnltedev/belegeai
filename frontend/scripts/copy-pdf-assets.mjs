// Copies pdf.js's CMap, standard-font, and wasm (JBIG2/OpenJPEG/QCMS)
// assets into public/ as plain static files. Without these, pdf.js falls
// back to no-op stubs for non-embedded fonts and JBIG2-compressed images -
// exactly the compression scanned/faxed documents commonly use - logging
// repeated console warnings and failing to render that content. Runs
// automatically via the postinstall hook, alongside copy-pdf-worker.mjs.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, "../node_modules/pdfjs-dist");
const publicDir = path.join(__dirname, "../public");

const copies = [
  { src: path.join(pkgRoot, "cmaps"), dest: path.join(publicDir, "pdf-cmaps") },
  { src: path.join(pkgRoot, "standard_fonts"), dest: path.join(publicDir, "pdf-standard-fonts") },
  { src: path.join(pkgRoot, "wasm"), dest: path.join(publicDir, "pdf-wasm") },
];

mkdirSync(publicDir, { recursive: true });

for (const { src, dest } of copies) {
  if (!existsSync(src)) {
    console.warn("pdfjs-dist asset dir not found, skipping copy:", src);
    continue;
  }
  cpSync(src, dest, { recursive: true });
  console.log(`Copied ${path.basename(src)} to public/${path.basename(dest)}/`);
}
