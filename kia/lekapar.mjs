// A szabo.adatbank.ro lekaparása a nyers `raw.json`-ba.
//
// Egyszer futott, 201 kérés (laponként 30 sor), párhuzamosan 10 szállal.
// A KIA 2021-10-23-án frissült utoljára, tehát a leképezés azóta nem
// változik — de ha mégis, a `raw.json` újrarakható ezzel.
//
//   node kia/lekapar.mjs
//
// NEM ír semmit a helyek.json-ba vagy a javitasok*-ba. Csak a `kia/raw.json`.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITT = dirname(fileURLToPath(import.meta.url));
const ALAP = "https://szabo.adatbank.ro/index.php";
const LAP = 30;
// A KIA 6026 helységet hirdet, de a lapokon 6024 adatsor van. A kettő közti
// kettő nem hiba: a laponkénti számozás (0-30, 31-60, ...) nem fedi le a
// 6025-6026-ot. Ezért a mérőszám 6024, és ezt ellenőrizzük.
const OSSZES = 6024;

const html = async (n) => {
  const v = await fetch(`${ALAP}?kezd=${n}`);
  if (!v.ok) throw new Error(`${n}: HTTP ${v.status}`);
  return v.text();
};

function sorok(oldal) {
  const ki = [];
  // A KIA Dreamweaver-táblázat: minden adatsor egy <tr>, aminek hat <td>-je van,
  // és a harmadik a megye.
  for (const tr of oldal.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)) {
    const tds = [...tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gu)];
    if (tds.length !== 6) continue;
    const c = tds.map((t) =>
      t[2]
        .replace(/<[^>]+>/gu, " ")
        .replace(/&nbsp;/gu, " ")
        .replace(/&#(\d+);/gu, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/gu, " ")
        .trim(),
    );
    // A fejléc sort kiszűrjük a "megye" feliratával, NEM az üres megyével:
    // van olyan adatsor is, aminek a megye-áblakapja üres (lásd lent).
    if (c[2] === "megye") continue;
    // Kisbetűvel kezdődő sor: a fejléc, vagy az oldal törmeléke. Ez a
    // szűrő adja a pontos sort számot (6226 - 202 = 6024).
    if (!/^[A-ZŞŞŢŢĂÂÎÇşţăâîç]/u.test(c[0])) continue;
    ki.push(c);
  }
  return ki;
}

// A román nevet a szögletes zárójeles változatoktól elválasztjuk, mert két
// külön adottra való: "Abrud-Sat [Abrudsat, Abruzel]" -> ro/vari.
function szeld(s) {
  const m = /^(.*?)\s*\[(.*)\]\s*$/u.exec(s);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ""];
}

const kezd = [];
for (let n = 1; n <= OSSZES; n += LAP) kezd.push(n);
console.log(`${kezd.length} lap lekapása (${LAP} sor/lap, ${OSSZES} sor)...`);

let kesz = [];
let mert = 0;
for (let i = 0; i < kezd.length; i += 10) {
  const reszek = await Promise.all(
    kezd.slice(i, i + 10).map(async (n) => sorok(await html(n))),
  );
  kesz.push(...reszek.flat());
  mert += 10;
  process.stdout.write(`\r  ${mert}/${kezd.length} lap, ${kesz.length} sor`);
}
console.log(`\n  kész: ${kesz.length} sor`);

const raw = kesz.map((c) => {
  const [ro, vari] = szeld(c[0]);
  return {
    ro,
    vari,
    befogado: c[1].replace(/;$/u, "").trim(),
    megye: c[2].replace(/;$/u, "").trim(),
    hu: c[3].replace(/;$/u, "").trim(),
    de: c[4].replace(/;$/u, "").trim(),
    mas: c[5].trim(),
  };
});

writeFileSync(join(ITT, "raw.json"), JSON.stringify(raw));
console.log(`  -> kia/raw.json (${raw.length} sor)`);

// Némely sor megye-áblakapja üres a KIA oldalán. Ezeket NEM dobjuk el —
// eldobjuk a `kinyeres.mjs`-ben, ahol a megyekulcs alapján dől el —, de
// megmondjuk, hány van belőlük, mert különben a sorszám nem egyezik a
// hirdetett 6026-tal, és senki nem tudja, miért.
const megyenNelkuli = raw.filter((r) => !r.megye);
if (megyenNelkuli.length) {
  console.log(`  ${megyenNelkuli.length} sor megye nélkül (a KIA oldalán üres a cella):`);
  for (const r of megyenNelkuli.slice(0, 12)) {
    console.log(`      ${r.ro}${r.hu ? `  =  ${r.hu}` : ""}`);
  }
  if (megyenNelkuli.length > 12) console.log(`      ... és még ${megyenNelkuli.length - 12}`);
}

if (raw.length !== OSSZES) {
  console.error(
    `  FIGYELEM: ${OSSZES} helyett ${raw.length} sor. Vagy a KIA átalakult, ` +
      `vagy a lapozás elcsúszott. Nézd meg kézzel a 2. lapot, mielőtt megbízol benne.`,
  );
  process.exitCode = 1;
}
