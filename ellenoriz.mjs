// Ellenőrzés a helyek.json-on. Futtasd: node ellenoriz.mjs
//
// Ez a fájl azért van, mert a Wikidata-adat kétféleképpen tud rosszul
// lenni: rossz megyébe kerül egy helység, vagy épp kimarad. Mindkettő
// néma hiba, ezért ellenőrizni kell, nem csak megnézni a darabszámot.

import { readFile } from "node:fs/promises";
import {
  nemHelyseg,
  huRomanSzo,
  huZarojeles,
  huMondat,
  dePerjel,
  deRomanEkezet,
} from "./szabalyok.mjs";

const adat = JSON.parse(await readFile(new URL("./helyek.json", import.meta.url)));
const { helyek, megyek } = adat;
const megyeNev = new Map(megyek.map((m) => [m.kod, m.hu]));
const ro = new Map();
for (const h of helyek) {
  if (!ro.has(h.ro)) ro.set(h.ro, []);
  ro.get(h.ro).push(h);
}
const hu = new Map();
for (const h of helyek) {
  if (!hu.has(h.hu)) hu.set(h.hu, []);
  hu.get(h.hu).push(h);
}

let hibak = 0;
const hiba = (s) => {
  hibak++;
  console.log(`  ✗ ${s}`);
};
const rendben = (s) => console.log(`  ✓ ${s}`);

console.log(`Összesen: ${helyek.length} helység, ${megyek.length} megye\n`);

// 1. A fő helységek megvannak-e, és jó megyében?
console.log("--- A fő helységek (magyar néven):");
const FOK = [
  ["Kolozsvár", "CJ"], ["Brassó", "BV"], ["Marosvásárhely", "MS"],
  ["Nagyszeben", "SB"], ["Vajdahunyad", "HD"], ["Nagyenyed", "AB"],
  ["Csíkszereda", "HR"], ["Segesvár", "MS"], ["Beszterce", "BN"],
  ["Fogaras", "BV"], ["Tövis", "AB"], ["Tusnádfürdő", "HR"],
  // Olyan városok, amelyeknek a Wikidata-n NEM "emberi lakhely" az osztályuk,
// hanem közigazgatási terület. Ezek akkor esnek ki csendben, ha a
// letöltőnek nincs benne a TELEPULESC_IS_KOZIGAZGATAS listában. Külön
// felsoroljuk őket, mert pontosan ez a hibaosztály a leghangosabb.
["Szászrégen", "MS"],        // Reghin, "municipality of Romania"
  ["Dicsőszentmárton", "MS"], // Târnăveni, ugyanígy
  ["Tekeújfalu", "MS"],       // Lunca, ugyanígy
  ["Magyarigen", "AB"],       // Ighiu, falu, "village" — a másik ág
  ["Kézdiszentvincent", "CV"], ["Borosjenő", "HD"],
];
for (const [n, megyeKod] of FOK) {
  const h = hu.get(n);
  if (!h) hiba(`nincs: ${n}`);
  else if (h[0].megye !== megyeKod)
    hiba(`${n} a ${megyeNev.get(h[0].megye)} megyében van, ${megyeNev.get(megyeKod)}ban kellene`);
  else rendben(`${n} / ${h[0].ro}${h[0].de ? " / " + h[0].de : ""}`);
}

// Olyan helységek, amiket a Wikidata-n nincs vagy hibásan van, és ezért
// tudatosan nincsenek az adatban. Ha egyszer valaki hozzáadja őket a
// Wikidata-n, ezt a listát töröld.
console.log("\n--- Tudottan hiányzó helyek (a Wikidata-n sincs magyar nevük):");
for (const n of ["Kézdiszentvincent", "Borosjenő"]) {
  console.log(hu.has(n) ? `  ✓ már bent van: ${n}` : `  – ${n}`);
}

// 2. Megyénként a községek és városok (nincs szülő községük)
console.log("\n--- Megyénként a községek és városok:");
for (const m of megyek) {
  const onallok = helyek.filter((h) => h.megye === m.kod && !h.kozseg);
  console.log(
    `  ${m.kod} ${m.hu} (${helyek.filter((h) => h.megye === m.kod).length} hely, ` +
      `${onallok.length} község/város): ${onallok.slice(0, 5).map((h) => `${h.hu}/${h.ro}`).join(", ")}`,
  );
  if (!onallok.length) hiba(`${m.kod}: egyetlen község vagy város sem van, gyanús`);
}

// 3. Duplikumok
console.log("\n--- Duplikumok:");
const dupHu = [...hu.entries()].filter(([, v]) => v.length > 1);
const dupRo = [...ro.entries()].filter(([, v]) => v.length > 1);
console.log(`  ${dupHu.length} magyar név kétszer vagy többször`);
console.log(`  ${dupRo.length} román név kétszer vagy többször`);
for (const [n, v] of dupHu.slice(0, 6)) {
  console.log(`    ${n}: ${v.map((h) => `${h.q}(${megyeNev.get(h.megye)})`).join(" , ")}`);
}

// Két megyében lehet ugyanaz a név, és az nem hiba (Doboka/Dăbâca egyszer
// Kolozsvár, egyszer Hunyad megyében valódi két falu). Ugyanabban a
// megyében viszont a letöltőnek össze kellett volna szűrnie — kivéve, ha
// a magyar nevek is eltérnek, mert akkor nem ugyanaz a hely.
const dupUgyanMegyeben = [...ro.entries()].filter(
  ([, v]) =>
    v.length > 1 &&
    new Set(v.map((h) => h.megye)).size === 1 &&
    new Set(v.map((h) => h.hu)).size === 1,
);
if (dupUgyanMegyeben.length) {
  hiba(`${dupUgyanMegyeben.length} román név kétszer, ugyanazzal a magyar névvel, ugyanabban a megyében`);
  for (const [n, v] of dupUgyanMegyeben.slice(0, 6)) {
    console.log(`    ${n}: ${v.map((h) => `${h.q}(${megyeNev.get(h.megye)})`).join(" , ")}`);
  }
} else {
  rendben("nincs valódi duplikátum (nincs két azonos nevű hely egy megyében)");
}

// Ugyanaz a magyar és román név: nincs magyar exonim, nem hiba.
const nincsExonim = helyek.filter((h) => h.hu === h.ro);
console.log(`  ${nincsExonim.length} helység, ahol a magyar név megegyezik a románnal`);

// 4. Német nevek
console.log("\n--- Német nevek:");
const deHelyek = helyek.filter((h) => h.de);
console.log(`  ${deHelyek.length} helységnek van német neve`);
// Ugyanaz a szó, ha a betűk sorrendjétől függetlenül egyeznek (a letöltő
// így szűri ki a "Hodaie" -> "Hodaei" típusú hamis német neveket).
const betuSorrend = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "")
    .split("")
    .sort()
    .join("");
const deEgyezo = deHelyek.filter((h) => betuSorrend(h.de) === betuSorrend(h.ro));
if (deEgyezo.length) {
  hiba(`${deEgyezo.length} esetben a "német" név valójában a román név`);
  for (const h of deEgyezo.slice(0, 6)) console.log(`    ${h.hu} / ${h.ro} / ${h.de}`);
} else {
  rendben("nincs olyan német név, ami csak a román nevét ismételné");
}
const deZarojeles = helyek.filter((h) => h.de && h.de.includes("("));
if (deZarojeles.length) {
  console.log(`  ${deZarojeles.length} zárójeles (el nem vágott) német név:`);
  for (const h of deZarojeles.slice(0, 5)) console.log(`    ${h.hu} / ${h.de}`);
}
for (const h of deHelyek.slice(0, 12)) console.log(`    ${h.hu} / ${h.ro} / ${h.de}`);

// 4b. A nyelvi ellenőrzések. Ezek azok a hibák, amiket a `kutatas.md`
// élőben megerősített, és amik eddig csendben átmentek ezen az ellenőrzőn:
// a szerkezeti vizsgálatok nem nézik, hogy egy címke nyelvileg értelmes-e.
//
// Mindegyik a WIKIDATA hibája, nem a kódé, ezért a `ismertHibak.json`
// felsorolja a tudott Q-számokat. Az ismert hibákat nem számítjuk hibának
// (a kutatás dokumentálta őket), de az UJAT igen: ez a különbség az, amit a
// meglévő ellenőrző nem tudott.
console.log("\n--- A nevek nyelve (a Wikidata hibái, nem a kódé):");
const ismertHibak = JSON.parse(
  await readFile(new URL("./ismertHibak.json", import.meta.url), "utf8"),
);

/**
 * Egy hibaosztály ellenőrzése. Az új (nem dokumentált) elemeket `hiba()`
 * jelenti, tehát beleszámolnak a végső összegzésbe.
 */
function nyelviHiba(osztaly, f, mezok) {
  const ismert = ismertHibak[osztaly] ?? {};
  const talalat = helyek.filter((h) => f(mezok.map((m) => h[m]).find(Boolean)));
  const uj = talalat.filter((h) => !(h.q in ismert));
  const javított = Object.keys(ismert)
    .filter((k) => !k.startsWith("_"))
    .filter((q) => !talalat.some((h) => h.q === q));

  const cim = ismert._nev ?? osztaly;
  if (uj.length) {
    hiba(
      `${osztaly}: ${uj.length} ÚJ elem, ami korábban nem volt a listán ` +
        `(${talalat.length} a teljes osztályból)`,
    );
    for (const h of uj.slice(0, 8)) {
      console.log(`    ${h.q} ${h.hu} / ${h.ro}${h.de ? " / " + h.de : ""}`);
    }
    if (uj.length > 8) console.log(`    ... és még ${uj.length - 8}`);
  } else if (talalat.length) {
    console.log(`  ✓ ${talalat.length} ${cim} — mind a ${Object.keys(ismert).filter((k) => !k.startsWith("_")).length} ismert Q-szám (a kutatás dokumentálta)`);
  } else {
    rendben(`nincs ${cim}`);
  }

  // Ha valaki kijavította a Wikidata-n, az elem kiesik a listából. Ez jó
  // hír, de csak akkor, ha tényleg javították: ha a letöltés hibája miatt
  // esett ki, akkor ez egy új, más hiba.
  if (javított.length) {
    console.log(`    ${javított.length} a listából már kiesett: ${javított.slice(0, 8).join(", ")}`);
    console.log(`    → ha ezeket a Wikidata-n javítottad meg, töröld ki az ismertHibak.json-ból`);
  }
  return uj;
}

// Nincs visszagyűjtve az eredmény: a hiba() maga számol, és az összegzés
// a végén abból épül. Azért hívjuk mind az ötöt, hogy mindegyik lefusson.
nyelviHiba("huRomanSzo", huRomanSzo, ["hu"]);
nyelviHiba("huZarojeles", huZarojeles, ["hu"]);
nyelviHiba("huMondat", huMondat, ["hu"]);
nyelviHiba("dePerjel", dePerjel, ["de"]);
nyelviHiba("deRomanEkezet", deRomanEkezet, ["de"]);

// A nem-helység ellenőrzése: ez a letöltő szűrése, tehát itt MINDEN
// találat hibás. A szabály a szabalyok.mjs-ből jön, hogy a kód és az
// ellenőrző ne driftszóljon el (pontos így került be korábban a
// "Marosvásárhely Metropoliszövezet": a szűrés a "metropolisztérséget"
// várta, a Wikidata "Metropoliszövezetet" írt).
const bentAgglomeracio = helyek.filter(nemHelyseg);
if (bentAgglomeracio.length) {
  hiba(`${bentAgglomeracio.length} agglomeráció bent van az adatban (nem helység, csak egy város és a környéke)`);
  for (const h of bentAgglomeracio.slice(0, 8)) {
    console.log(`    ${h.q} ${h.hu} / ${h.ro}`);
  }
} else {
  rendben("nincs agglomeráció az adatban");
}

// A megyeszékhelyek osztálya: a szűrés ezeket a városokat védi, és ha
// kiesnek, csendben tűnnek el. A Q640364 (municipality of Romania) nem a
// "human settlement" alá van kötve a Wikidata-n, ezért a B. lépés nem
// találja meg, és a TELEPULESC_IS_KOZIGAZGATAS listán kell lennie.
console.log(`  – a megyeszékhelyek osztályát a letöltő TELEPULESC_IS_KOZIGAZGATAS listája védi (lásd a README-t)`);

// 5. Magyarul és románul ugyanaz: a Wikidata ilyen "magyar" nevet ad, ahol
// nincs magyar exonim. Nem hiba, de érdemes tudni, mennyi van.
// (A 3. pontban már kiszámoltuk, ott "nincsExonim" a neve.)
const ugyanaz = nincsExonim;
console.log(`\n--- magyar és román név egyforma (nincs magyar exonim): ${ugyanaz.length}`);
for (const h of ugyanaz.slice(0, 8)) console.log(`    ${h.hu}`);

// 6. Belső konzisztencia
console.log("\n--- Belső konzisztencia:");
const gyerekes = helyek.filter((h) => h.kozseg);
const nevtelenKozseg = gyerekes.filter((h) => !h.kozsegNev);
if (nevtelenKozseg.length) {
  hiba(`${nevtelenKozseg.length} helységnek nincs szülő község neve (a letöltő tölti ki)`);
} else {
  rendben(`mind a ${gyerekes.length} falu/kisliget kapott szülő községnevet`);
}
const sajatMagat = helyek.filter((h) => h.kozseg === h.q);
if (sajatMagat.length) hiba(`${sajatMagat.length} helység szülője önmaga`);
const roHelyseg = helyek.filter((h) => h.hu.includes(" község") || h.hu.includes(" város"));
console.log(`  ${roHelyseg.length} "község"/"város" toldalékú magyar név (ez a szándékos)`);

// 7. Amit az oldal keresője elhasznál
console.log("\n--- Amit a kereső használ:");
const mezok = ["hu", "ro", "de", "megye", "kozsegNev", "wikidata"];
for (const m of mezok) {
  const nincs = helyek.filter((h) => h[m] === undefined).length;
  if (nincs) hiba(`${nincs} helységből hiányzik a(z) "${m}" mező`);
}
console.log(`  minden helységben megvan: ${mezok.join(", ")}`);
const kodok = new Set(helyek.map((h) => h.megye));
const ismeretlen = [...kodok].filter((k) => !megyek.some((m) => m.kod === k));
if (ismeretlen.length) {
  hiba(`ismeretlen megyekód: ${ismeretlen.join(", ")}`);
} else {
  rendben("minden megyekód létezik a megyek listában");
}

// 8. A kézi javítások nem hiásszak el a munkát
console.log("\n--- A javitasok.json:");
const jav = JSON.parse(await readFile(new URL("./javitasok.json", import.meta.url), "utf8"));
const kulcsok = Object.keys(jav).filter((k) => !k.startsWith("_"));
console.log(`  ${kulcsok.length} kézzel javított német név`);
const hasznos = kulcsok.filter((k) => {
  // Ha a Wikidata már jól tudja, a javítás felesleges (és felülíró).
  const h = ro.get(k);
  return h?.some((x) => x.de === jav[k]);
});
if (hasznos.length) {
  console.log(`  a Wikidata már ezt mondja (felesleges a javítás): ${hasznos.join(", ")}`);
}
const csakRomant = kulcsok.filter((k) =>
  jav[k].toLowerCase() === k.toLowerCase(),
);
if (csakRomant.length) {
  hiba(`${csakRomant.length} javítás csak a román nevet ismétli: ${csakRomant.join(", ")}`);
}
// A javított nevek tényleg bekerültek-e?
const bent = kulcsok.filter((k) => helyek.some((h) => h.ro === k && h.de === jav[k]));
console.log(`  ${bent.length}/${kulcsok.length} javítás tényleg látszik az adatban`);
if (bent.length === 0) hiba("egyetlen javítás sem érvényesült, talán a kulcs nem a román név?");

// A "felesleges" figyelmeztetés nem mindig igaz: a javítás akkor is kellhet,
// ha a WIKIDATA német neve épp a román nevét ismételte (Cluj-Napoca ->
// "Cluj-Napoca"), mert azt a letöltő eldobja. Csak akkor felesleges, ha a
// Wikidata adott rendes, különböző nevet.
console.log(
  `  a ${hasznos.length} "felesleges" közül lehet, hogy csak azért látszik így, mert a Wikidata a román nevet adta (ilyenkor a javítás kell)`,
);

console.log(
  hibak
    ? `\n${hibak} hiba (a fentiek közül a "Kézdiszentvincent" és a "Borosjenő" tudottan hiányzik).`
    : "\nNincs hiba a fő ellenőrzéseken.",
);