#!/usr/bin/env node

// A Sites-ra publikált, kizárólag futáshoz szükséges statikus csomag.
// A forrásfájlok és kutatási segédletek nem kerülnek a nyilvános webgyökérbe.

import { cp, mkdir, rm } from "node:fs/promises";

const gyoker = new URL("./", import.meta.url);
const dist = new URL("./dist/", import.meta.url);
const fajlok = [
  "index.html",
  "keres.js",
  "szabalyok.mjs",
  "helyek.json",
  "helyek.min.json",
  "favicon.svg",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "og-image.png",
  "megyek",
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const fajl of fajlok) {
  await cp(new URL(fajl, gyoker), new URL(fajl, dist), { recursive: true });
}

console.log(`Publikálható statikus csomag: ${fajlok.length} gyökérelem a dist/ alatt.`);
