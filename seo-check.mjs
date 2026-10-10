#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";

const hibak = [];
const elvart = (feltetel, uzenet) => {
  if (!feltetel) hibak.push(uzenet);
};
const beolvas = (ut) => readFile(new URL(ut, import.meta.url), "utf8");

const [index, adat, robots, manifest] = await Promise.all([
  beolvas("./index.html"),
  beolvas("./helyek.min.json").then(JSON.parse),
  beolvas("./robots.txt"),
  beolvas("./site.webmanifest").then(JSON.parse),
]);

const cim = index.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
const leiras = index.match(/<meta\s+name="description"\s+content="([^"]+)"/s)?.[1] ?? "";
elvart(cim.length >= 30 && cim.length <= 65, `A főoldali title hossza ${cim.length}, 30–65 karakter legyen.`);
elvart(leiras.length >= 120 && leiras.length <= 160, `A meta description hossza ${leiras.length}, 120–160 karakter legyen.`);
elvart((index.match(/<h1\b/g) ?? []).length === 1, "A főoldalon pontosan egy h1 legyen.");
const foCanonical = index.match(/<link rel="canonical" href="([^"]+)" \/>/)?.[1] ?? "";
elvart(foCanonical === "./" || /^https?:\/\//.test(foCanonical), "Hiányzik vagy hibás a főoldali canonical.");
elvart(/name="robots" content="index, follow, max-image-preview:large"/.test(index), "Hiányzik a robots meta.");
for (const mezo of ["og:type", "og:locale", "og:site_name", "og:title", "og:description"]) {
  elvart(index.includes(`property="${mezo}"`), `Hiányzik: ${mezo}.`);
}
elvart(index.includes('name="twitter:card"'), "Hiányzik a Twitter Card meta.");
elvart(index.includes('href="./megyek/"'), "A főoldal nem hivatkozik a statikus jegyzékre.");
elvart(robots === "User-agent: *\nAllow: /\n" || robots.includes("\nSitemap: http"), "A robots.txt hibás.");
elvart(manifest.name === "Helynévkereső" && manifest.lang === "hu", "A webmanifest hibás.");
await access(new URL("./favicon.svg", import.meta.url));
await access(new URL("./og-image.png", import.meta.url));

const ldTalalat = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
try {
  const ld = JSON.parse(ldTalalat?.[1] ?? "");
  const tipusok = new Set(ld["@graph"]?.map((elem) => elem["@type"]));
  for (const tipus of ["WebSite", "WebApplication", "Dataset"]) {
    elvart(tipusok.has(tipus), `A JSON-LD gráfból hiányzik: ${tipus}.`);
  }
} catch (hiba) {
  hibak.push(`A főoldali JSON-LD nem érvényes JSON: ${hiba.message}`);
}

const megyeFajlok = (await readdir(new URL("./megyek/", import.meta.url))).filter(
  (fajl) => fajl.endsWith(".html") && fajl !== "index.html",
);
elvart(megyeFajlok.length === adat.megyek.length, `${adat.megyek.length} helyett ${megyeFajlok.length} megyeoldal van.`);

const megyeIndex = await beolvas("./megyek/index.html");
for (const megye of adat.megyek) {
  const fajl = `${megye.kod.toLowerCase()}.html`;
  elvart(megyeFajlok.includes(fajl), `Hiányzik a megyeoldal: ${fajl}.`);
  elvart(megyeIndex.includes(`href="./${fajl}"`), `A megyeindex nem hivatkozik erre: ${fajl}.`);
  if (!megyeFajlok.includes(fajl)) continue;
  const oldal = await beolvas(`./megyek/${fajl}`);
  const darab = adat.helyek.filter((hely) => hely.megye === megye.kod).length;
  elvart((oldal.match(/<li class="hely"/g) ?? []).length === darab, `${fajl}: nem ${darab} helység szerepel.`);
  const canonical = oldal.match(/<link rel="canonical" href="([^"]+)" \/>/)?.[1] ?? "";
  elvart(canonical === `./${fajl}` || canonical.endsWith(`/megyek/${fajl}`), `${fajl}: hibás canonical.`);
  elvart((oldal.match(/<h1\b/g) ?? []).length === 1, `${fajl}: nem pontosan egy h1 van.`);
}

if (hibak.length) {
  console.error(`SEO-ellenőrzés: ${hibak.length} hiba`);
  for (const hiba of hibak) console.error(`  ✗ ${hiba}`);
  process.exit(1);
}
console.log(`SEO-ellenőrzés rendben: főoldal + ${adat.megyek.length} területi oldal + ${adat.helyek.length.toLocaleString("hu-HU")} helységnév.`);
