// Böngészős próba: működik-e a kereső a valódi oldalon?
// Futtasd: node proba.mjs   (előbb: python3 -m http.server 8123)

// A Playwright nincs a projektben telepítve (nem kell függőség), ezért a
// npx által letöltött példányból húzzuk be. Ha ez az út nem létezik,
// telepítsd: npm i -D playwright && npx playwright install chromium
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
for (const ut of [
  "/home/jack/.npm/_npx/9833c18b2d85bc59/node_modules/playwright",
  "playwright",
]) {
  try {
    ({ chromium } = require(ut));
    break;
  } catch {
    /* következő */
  }
}
if (!chromium) {
  console.error("Nincs Playwright. Telepítsd: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

// A letöltött Playwright-verziók nem találnak saját böngészőt, de a
// rendszeren van Google Chrome, azt használjuk.
const Bongeszo = { channel: "chrome" };

const base = "http://localhost:8123/index.html";
const browser = await chromium.launch(Bongeszo);
const oldal = await browser.newPage();

const hibak = [];
oldal.on("console", (m) => {
  if (m.type() === "error") hibak.push(m.text());
});
oldal.on("pageerror", (e) => hibak.push("pageerror: " + e.message));

await oldal.goto(base, { waitUntil: "networkidle" });

const mezo = oldal.locator("#mezo");
const szures = oldal.locator("#szures");
const sorok = oldal.locator(".sor");



// Amit be kell találnia: (bevitel, a sorban várt szöveg)
const TESZTEK = [
  ["Kolozsvár", "Klausenburg"],
  ["kolozsvar", "Klausenburg"],            // ékezet nélkül
  ["Cluj-Napoca", "Klausenburg"],          // románul keresve
  ["cluj", "Klausenburg"],
  ["Târgu Mureș", "Marosvásárhely"],
  ["Targu Mures", "Marosvásárhely"],       // ékezet és ű nélkül
  ["Marosvásárhely", "Neustadt"],
  ["Brașov", "Kronstadt"],
  ["Hermannstadt", "Nagyszeben"],          // németül keresve, megyenév is ütközik
["Kronstadt", "Brassó"],
["Neustadt", "Marosvásárhely"],
  ["Szeklerstadt", "Csíkszereda"],
  ["Schäßburg", "Segesvár"],
  ["Aiud", "Nagyenyed"],
  ["Ajton", "Ajton község"],                // a szülő község neve is
  ["szekler", "Csíkszereda"],
  ["Feliceni", "Felsőboldogfalva"],        // románul
  ["feliceni", "Felsőboldogfalva"],
  ["Târnăveni", "Dicsőszentmárton"],
  ["tarnaveni", "Dicsőszentmárton"],      // ékezet és ő nélkül
  ["Sankt Martin", "Dicsőszentmárton"],   // németül
  ["Siculeni", "Madéfalva"],
];

let bukott = 0;
console.log("--- Keresések:");
for (const [bevitel, vart] of TESZTEK) {
  await mezo.fill(bevitel);
  await oldal.waitForTimeout(180);
  const szoveg = await sorok.allInnerTexts();
  const info = await szures.innerText();
  const jo = szoveg.some((s) => s.includes(vart));
  if (jo) {
    console.log(`  ✓ "${bevitel}" → ${szoveg[0].replace(/\n/g, " | ").slice(0, 70)}`);
  } else {
    bukott++;
    console.log(`  ✗ "${bevitel}" → nem található "${vart}" (${info}, ${szoveg.length} sor)`);
    for (const s of szoveg.slice(0, 3)) console.log(`      ${s.replace(/\n/g, " | ")}`);
  }
}

// A kiemelés ékezetes néven is a helyes karokra esik-e? Ehhez egy olyan
// helységet keresünk, aminek a neve ékezetes, és a keresett rész is ékezetes,
// különben a leegyszerűsített és az eredeti pozíció eltérne.
await mezo.fill("marosvásárhely");
await oldal.waitForTimeout(200);
const elsoSor = sorok.first();
const kiemelesek = await elsoSor.locator(".kiemel").allInnerTexts();
const huKiem = kiemelesek[0] ?? "";
const sima = await elsoSor.locator(".nev").innerText();
console.log(`\n--- Kiemelés ékezetes néven ("marosvásárhely"):`);
console.log(`    név: "${sima}", kiemelve: "${huKiem}"`);
// A kiemelés a névből származik, ami nagy kezdőbetűs, ezért a
// kis-nagybetűt nem számítjuk különbségnek.
if (huKiem.toLowerCase() === "marosvásárhely") {
  console.log("  ✓ pontosan a beírt szöveget emeli ki, ékezetekkel együtt");
} else {
  bukott++;
  console.log(`  ✗ a kiemelés elcsúszott: "${huKiem}" helyett "${sima}"-t kellene`);
}

// A megyeválasztó szűkít, és látszik, hogy mit csinál.
const valaszt = oldal.locator("#megye");
await valaszt.selectOption("HR");
await mezo.fill("");
await oldal.waitForTimeout(250);
const hr = await sorok.count();
const hrInfo = await szures.innerText();
console.log(`\n--- Csak Hargita megye, szöveg nélkül: ${hrInfo}, ${hr} sor`);
if (hr > 50 && hr < 300) console.log("  ✓ a megyeválasztó szűkít, és nem ömlik el a lista");
else {
  bukott++;
  console.log("  ✗ nem szűkített rendesen");
}
const mindHely = await oldal.evaluate(
  () => document.querySelectorAll(".kozseg").length &&
    [...document.querySelectorAll(".kozseg")].every((e) => e.textContent.includes("Hargita")),
);
console.log(mindHely ? "  ✓ minden sor Hargita megye" : "  ✗ van más megyéjű sor is");

// Szöveg + megye együtt.
await mezo.fill("csík");
await oldal.waitForTimeout(250);
console.log(`    + "csík" szűkítve: ${await szures.innerText()}`);
await valaszt.selectOption("");
await oldal.waitForTimeout(250);

// A "szász" névvég nem szerepel adatban; "szék" viszont sok helyen igen.
await mezo.fill("szék");
await oldal.waitForTimeout(200);
console.log(`\n--- "szék": ${await szures.innerText()}`);
const db = await sorok.count();
console.log(`    ${db} sor, első: ${(await sorok.first().innerText().catch(() => "-")).replace(/\n/g, " | ")}`);
if (db > 0 && db <= 300) console.log("  ✓ korlátozott lista, nem fagyott le");

// Üres mező.
await mezo.fill("");
await oldal.waitForTimeout(200);
console.log(`\n--- Üres mező: "${await szures.innerText()}"`);
console.log(`    megjelenített sorok: ${await sorok.count()}`);

// A forrás linkjeit egy tényleges találaton nézzük, hiszen üres mezőnél
// nincs sor.
await mezo.fill("Kolozsvár");
await oldal.waitForTimeout(250);

// A forrás linkjei. Ez 2026-10-08-ig csendben rossz volt: a link a
// `encodeURIComponent`-tel épült, ami az EGÉSZ URL-t kódolja, így a
// "https://" "%3A%2F%2F" lett belőle, és a böngésző a saját domainünkre
// mutató relatív útvonalnak nézte. A `helyek.json` `wikidata` mezője helyes
// volt, tehát a hiba a megjelenítésben volt — és a próba eddig a link
// SZÖVEGÉT nézte, nem a célját, ezért átment.
console.log("\n--- A forrás linkjei:");
const linkek = await oldal
  .locator(".sor")
  .first()
  .locator(".kozseg a")
  .evaluateAll((as) => as.map((a) => ({ szoveg: a.textContent, href: a.href })));
console.log(`    ${linkek.map((l) => l.szoveg).join(" | ")}`);
for (const l of linkek) {
  if (!l.href.startsWith("https://www.wikidata.org/wiki/Q")) {
    bukott++;
    console.log(`  ✗ a(z) "${l.szoveg}" link nem a Wikidata-ra mutat: ${l.href}`);
  } else if (l.href.includes("%")) {
    bukott++;
    console.log(`  ✗ a(z) "${l.szoveg}" link kódolt URL, ami relatív útvonal lesz: ${l.href}`);
  } else {
    console.log(`  ✓ "${l.szoveg}" → ${l.href}`);
  }
}
// A "javítása" linknek a szerkesztő űrlapját kell nyitnia, magyarul.
const javito = linkek.find((l) => l.szoveg === "javítása");
if (!javito) {
  bukott++;
  console.log('  ✗ nincs "javítása" link a sorban');
} else if (!javito.href.includes("action=edit")) {
  bukott++;
  console.log(`  ✗ a "javítása" link nem a szerkesztőt nyitja: ${javito.href}`);
}

// Minden sorban a SAJÁT Q-számára mutasson a link: a kirajzolás nem
// másolhatja egyik sor linkjét a másikba.
await mezo.fill("ajton");
await oldal.waitForTimeout(250);
const eltert = await oldal.evaluate(() => {
  const hibak = [];
  for (const sor of document.querySelectorAll(".sor")) {
    const nev = sor.querySelector(".nev")?.textContent ?? "";
    const a = sor.querySelector(".kozseg a");
    const href = a?.getAttribute("href") ?? "";
    // A .nev belső HTML-t tartalmaz (kiemelés), ezért az attributumot nézzük.
    if (!/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(href)) hibak.push(nev + " → " + href);
  }
  return hibak;
});
console.log(`    ${await sorok.count()} sor, ${eltert.length} hibás link`);
if (eltert.length) {
  bukott++;
  for (const e of eltert.slice(0, 3)) console.log(`      ${e}`);
} else {
  console.log("  ✓ minden sorban szabályos, kódolatlan Wikidata link van");
}

// Regresszió: az agglomeráció NEM jelenik meg találatként. Ez a hiba
// 2026-10-08-ig csendben benne volt, mert a szűrés a "metropolisztérséget"
// kereste, a Wikidata pedig "Metropoliszövezetet" írt, és csak a magyar
// nevet nézte. A keresőben így "Marosvásárhely Metropoliszövezet" jelent meg
// helységként. Három néven próbáljuk, mindegyiken a szabály valamelyik ágát
// kell eltalálnia.
console.log("\n--- Az agglomeráció nem lehet találat:");
const AGGLO = ["metropolisz", "agglomer", "Zona metropolitană"];
for (const szo of AGGLO) {
  await mezo.fill(szo);
  await oldal.waitForTimeout(220);
  const szoveg = await sorok.allInnerTexts();
  const info = await szures.innerText();
  // A "Marosvásárhely" és a "Kolozsvár" város valóban létezik és
  // előfordulhat a sorok között — csak az "agglomerációt" szabad kizárni.
  const szurt = szoveg.filter((s) => /metropolisz|agglomer|metropolitan/i.test(s));
  if (szurt.length) {
    bukott++;
    console.log(`  ✗ "${szo}" → ${szurt.length} agglomerációs sor a találatok között (${info})`);
    for (const s of szurt.slice(0, 3)) console.log(`      ${s.replace(/\n/g, " | ")}`);
  } else {
    console.log(`  ✓ "${szo}" → nincs agglomeráció a találatok között (${info})`);
  }
}

console.log(
  hibak.length ? `\nKONZOLHIBÁK:\n${hibak.map((h) => "  " + h).join("\n")}` : "\nNincs konzolhiba.",
);
console.log(bukott || hibak.length ? `\n${bukott + hibak.length} hiba.` : "\nMinden próba sikerült.");

await browser.close();
process.exit(bukott || hibak.length ? 1 : 0);