#!/usr/bin/env node
// Run from the repo root: node add-cards.js

import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";

const DOWNLOADS = path.join(
  process.env.USERPROFILE || process.env.HOME,
  "Downloads"
);
const IMAGES_DIR = path.join(import.meta.dirname, "dropoutcube", "images");
const GALLERY_JS = path.join(import.meta.dirname, "dropoutcube", "gallery.js");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function newImagesInDownloads() {
  const existing = new Set(fs.readdirSync(IMAGES_DIR));
  return fs
    .readdirSync(DOWNLOADS)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !existing.has(f))
    .sort((a, b) =>
      fs.statSync(path.join(DOWNLOADS, b)).mtimeMs -
      fs.statSync(path.join(DOWNLOADS, a)).mtimeMs
    );
}

function readGalleryEntries() {
  const src = fs.readFileSync(GALLERY_JS, "utf8");
  const match = src.match(/const IMAGES = \[([\s\S]*?)\];/);
  return match ? match[1].trim() : "";
}

function writeGalleryEntries(entriesBlock) {
  let src = fs.readFileSync(GALLERY_JS, "utf8");
  src = src.replace(
    /const IMAGES = \[[\s\S]*?\];/,
    `const IMAGES = [\n${entriesBlock}\n];`
  );
  fs.writeFileSync(GALLERY_JS, src, "utf8");
}

function entryToString(entry, indent = "  ") {
  if (entry.back) {
    return (
      `${indent}{\n` +
      `${indent}  src: "images/${entry.src}",\n` +
      `${indent}  caption: "${entry.caption}",\n` +
      `${indent}  back: "images/${entry.back}",\n` +
      `${indent}  backCaption: "${entry.backCaption}",\n` +
      `${indent}}`
    );
  }
  return `${indent}{ src: "images/${entry.src}", caption: "${entry.caption}" }`;
}

async function main() {
  console.log("\n🃏  Dropout Cube — Add Cards\n");

  const newFiles = newImagesInDownloads();
  if (newFiles.length === 0) {
    console.log("No new images found in Downloads. Exiting.");
    rl.close();
    return;
  }

  console.log(`Found ${newFiles.length} new image(s) in Downloads:\n`);
  newFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log();

  const entries = readGalleryEntries();
  const newEntries = [];
  const filesToCopy = [];
  const usedFiles = new Set();

  let i = 0;
  while (i < newFiles.length) {
    const file = newFiles[i];
    if (usedFiles.has(file)) { i++; continue; }

    console.log(`\n── ${file}`);
    const skip = await ask("  Skip this file? (y/N): ");
    if (skip.trim().toLowerCase() === "y") { i++; continue; }

    const caption = (await ask("  Card name: ")).trim();
    if (!caption) { console.log("  (no name entered, skipping)"); i++; continue; }

    const isDfc = (await ask("  Double-faced card? (y/N): ")).trim().toLowerCase() === "y";

    if (isDfc) {
      console.log("\n  Remaining files:");
      newFiles.filter((f, j) => j !== i && !usedFiles.has(f)).forEach((f, j) => {
        console.log(`    ${j + 1}. ${f}`);
      });
      const backName = (await ask("  Type the filename of the back face: ")).trim();
      const backCaption = (await ask("  Back face card name: ")).trim();

      newEntries.push({ src: file, caption, back: backName, backCaption });
      filesToCopy.push(file, backName);
      usedFiles.add(file);
      usedFiles.add(backName);
    } else {
      newEntries.push({ src: file, caption });
      filesToCopy.push(file);
      usedFiles.add(file);
    }
    i++;
  }

  if (newEntries.length === 0) {
    console.log("\nNothing to add. Exiting.");
    rl.close();
    return;
  }

  // Copy files
  for (const f of filesToCopy) {
    const src = path.join(DOWNLOADS, f);
    const dest = path.join(IMAGES_DIR, f);
    if (!fs.existsSync(src)) {
      console.warn(`\n⚠  File not found in Downloads: ${f}`);
      continue;
    }
    fs.copyFileSync(src, dest);
    console.log(`  Copied: ${f}`);
  }

  // Update gallery.js
  const newBlock =
    (entries ? entries + ",\n" : "") +
    newEntries.map((e) => entryToString(e)).join(",\n");
  writeGalleryEntries(newBlock);
  console.log(`\n  Updated gallery.js (+${newEntries.length} card${newEntries.length !== 1 ? "s" : ""})`);

  // Commit + push
  const push = (await ask("\nCommit and push? (Y/n): ")).trim().toLowerCase();
  if (push !== "n") {
    try {
      execSync("git add dropoutcube/", { stdio: "inherit" });
      const names = newEntries.map((e) => e.caption).join(", ");
      execSync(`git commit -m "Add cards: ${names}"`, { stdio: "inherit" });
      execSync("git push", { stdio: "inherit" });
      console.log("\n✓ Pushed.");
    } catch (e) {
      console.error("\nGit error — changes are saved locally, push manually.");
    }
  }

  rl.close();
}

main();
