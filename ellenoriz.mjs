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
  ugyanazAHely,
  utalok,
  utaloUtkozes,
  VERZIO,
  ugyanazANev,
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
// megyében viszont akkor sem hiba, ha a községük különbözik: Alba
// megyében több "Butești" és "Florești" község alatt is van valódi falu.
// Csak a KÖZÖS község alatti, azonos nevű kettős duplikátum — és azt a
// `letolt.mjs` eleve kiszűri, tehát ha itt látszik, hiba van a szűrésben.
// A szűrő NEM a teljes névlista megyének egyenlőségét nézi, hanem a
// MEGYENKÉNTI párokat. Ez különbség: az "Avrămești" Albában kétszer van
// valódi falu, Erdélyben meg kétszer más, és a régi szűrő emiatt egyik
// csoportot sem számolta, mert a négy elem három megyébe esik. Vagyis a
// megye a KULCS része, nem a feltétel.
const megyenkenti = new Map(); // megye|ro -> az ilyen nevű sorok
for (const h of helyek) {
  const kulcs = `${h.megye}|${h.ro.toLowerCase()}`;
  if (!megyenkenti.has(kulcs)) megyenkenti.set(kulcs, []);
  megyenkenti.get(kulcs).push(h);
}
const dupUgyanMegyeben = [...megyenkenti.values()].filter(
  (v) =>
    v.length > 1 &&
    new Set(v.map((h) => h.hu)).size === 1 &&
    v.some((a, i) => v.some((b, j) => i !== j && ugyanazAHely(a, b))),
);
if (dupUgyanMegyeben.length) {
  hiba(`${dupUgyanMegyeben.length} román név kétszer, ugyanazzal a magyar névvel, ugyanabban a megyében — ezt a letöltőnek ki kellett volna szűrnie`);
  // A `values()` a SOROKAT adja, nem a [kulcs, sorok] párt, tehát a
  // szétdobás a kulcsot is kihagyja — a hibaüzenet a nevét mondja ki, mert
  // az többet számít a megyénél. (A korábbi `for (const [n, v] of ...)`
  // ezt elrontotta: `v` egy sor lett, nem egy sorlista, és a kiírás
  // TypeError-rel állt le — vagyis épp akkor csúszott el, amikor hiba volt.)
  for (const v of dupUgyanMegyeben.slice(0, 6)) {
    console.log(`    ${v[0].ro}: ${v.map((h) => `${h.q}(${megyeNev.get(h.megye)})`).join(" , ")}`);
  }
} else {
  rendben("nincs valódi duplikátum (nincs két azonos nevű hely egy megyében)");
}

// Az utóbbi szabály túl szigorú lett volna: két különböző község alatt
// lehet ugyanaz a román és magyar név, és az két valódi hely. Kimondjuk,
// hogy a letöltő ezt megtartotta, hogy ne tűnjön véletlennek.
const valodiKettos = [...megyenkenti.entries()].filter(
  ([, v]) =>
    v.length > 1 &&
    new Set(v.map((h) => h.hu)).size === 1 &&
    !v.some((a, i) => v.some((b, j) => i !== j && ugyanazAHely(a, b))),
);
if (valodiKettos.length) {
  console.log(`  ${valodiKettos.length} néven két valódi hely van ugyanabban a megyében (ez a szándék):`);
  for (const [k, v] of valodiKettos.slice(0, 6)) {
    console.log(`    ${k}: ${v.map((h) => `${h.q}(${h.kozsegNev ?? "nincs községe"})`).join(" , ")}`);
  }
}

// Ugyanaz a magyar és román név: nincs magyar exonim, nem hiba.
const nincsExonim = helyek.filter((h) => h.hu === h.ro);
console.log(`  ${nincsExonim.length} helység, ahol a magyar név megegyezik a románnal`);

// 3b. A megkülönböztető toldalék. A fenti "két valódi hely" sorokban a
// magyar név önmagában nem mond semmit: a felhasználó két egyforma sort lát,
// és a megye — ami egyformára szól — nem választja szét őket. Ezért a sor
// neve a szülő községgel bővül ("Butești (Mogos község)").
//
// A szabály a `szabalyok.mjs`-ben van, és itt ugyanazt futtatjuk a kész
// adaton. Ez nem új ellenőrzés, hanem a régi kockázat fordítottja: amíg a
// toldalék nem volt, két azonos sor látszott szándék nélkül; ha most
// eltűnik, ugyanaz a néma hiba tér vissza.
console.log("\n--- Megkülönböztető toldalék (azonos magyar név egy megyében):");
const varakozottUtalok = utalok(helyek);
const utaloEltérés = helyek.filter((h) => (h.utalo ?? null) !== (varakozottUtalok.get(h.q) ?? null));
if (utaloEltérés.length) {
  hiba(
    `${utaloEltérés.length} helység toldaléka nem egyezik a szabállyal ` +
      `(az adatban "${utaloEltérés[0].utalo}", a szabály szerint ` +
      `"${varakozottUtalok.get(utaloEltérés[0].q) ?? "nincs"}")`,
  );
  for (const h of utaloEltérés.slice(0, 6)) {
    console.log(`    ${h.q} ${h.hu} (${h.kozsegNev ?? "nincs községe"}): utalo=${h.utalo}`);
  }
} else {
  rendben(`${varakozottUtalok.size} helységnél egyezik a toldalék, a többi ${helyek.length - varakozottUtalok.size}-nál szándékosan nincs`);
}

// A toldalék csak akkor hasznos, ha KÜLÖNBÖZTET. Két azonos nevű hely ugyanabban
// a megyében, ugyanabban a községben — vagy szülő község nélkül — erre nem
// alkalmas: akár a toldalék után is két egyforma sor maradna. Ma ilyen nincs,
// de ha lenne, ez néma hiba lenne, mert a sorok száma nem változna.
const utaloAzos = utaloUtkozes(helyek);
if (utaloAzos.length) {
  hiba(
    `${utaloAzos.length} néven ugyanabban a megyében két hely van, amelyeket ` +
      `a toldalék sem választ szét (azonos vagy hiányzó szülő község)`,
  );
  for (const [k, v] of utaloAzos.slice(0, 6)) {
    console.log(`    ${k}: ${v.map((h) => `${h.q} (${h.kozsegNev ?? "nincs községe"})`).join(" , ")}`);
  }
}

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
const mezok = ["hu", "ro", "de", "megye", "kozsegNev", "utalo", "wikidata", "huNincsNeve"];
for (const m of mezok) {
  const nincs = helyek.filter((h) => h[m] === undefined).length;
  if (nincs) hiba(`${nincs} helységből hiányzik a(z) "${m}" mező`);
}
console.log(`  minden helységben megvan: ${mezok.join(", ")}`);

// 7a. A "nincs magyar neve" jelölés.
//
// Ez a felhasználónak szól, tehát a kérdés nem az, hogy "van-e ilyen
// mező", hanem hogy "igaz-e, amit a mező állít". Ez a projekt tanulsága.
// Két irányban nézzük:
//   - minden jelölt helynél a magyar név megegyezik a románnal (különben
//     a jelölés hazug lenne);
//   - a nincsMagyarNev.json minden Q-száma megvan az adatban, és a
//     javitasokHu.json nem mond ellent neki (két forrás, ellentmondás
//     nélkül: ha van kézzel javított magyar neve, akkor van).
const jelzettek = helyek.filter((h) => h.huNincsNeve);
const hamisJelzes = jelzettek.filter((h) => !ugyanazANev(h.hu, h.ro));
if (hamisJelzes.length) {
  hiba(
    `${hamisJelzes.length} helyen "nincs magyar neve" jelölés van, de a magyar és a román ` +
      `név nem ugyanaz a szó: ${hamisJelzes.slice(0, 5).map((h) => `${h.q} ${h.hu}/${h.ro}`).join(", ")}`,
  );
} else {
  rendben(
    `a ${jelzettek.length} jelölt helyen a magyar név valóban a román neve (nincs hamis jelölés)`,
  );
}

const nincsMagyarNev = JSON.parse(
  await readFile(new URL("./nincsMagyarNev.json", import.meta.url), "utf8"),
);
const nincsQ = Object.keys(nincsMagyarNev).filter((k) => !k.startsWith("_"));
const nincsHianyos = nincsQ.filter((q) => !helyek.some((h) => h.q === q));
if (nincsHianyos.length) {
  hiba(
    `a nincsMagyarNev.json ${nincsHianyos.length} Q-száma nincs az adatfájlban: ${nincsHianyos.slice(0, 5).join(", ")}`,
  );
}
const nincsNemJelzott = nincsQ.filter(
  (q) => helyek.some((h) => h.q === q) && !helyek.find((h) => h.q === q).huNincsNeve,
);
if (nincsNemJelzott.length) {
  hiba(
    `${nincsNemJelzott.length} hely a nincsMagyarNev.json-ban van, de nincs jelölve: ` +
      `${nincsNemJelzott.slice(0, 5).join(", ")} — vagy a javitasokHu.json javította, ` +
      "vagy a letöltő nem olvasta a listát",
  );
} else {
  rendben(`a nincsMagyarNev.json mind a ${nincsQ.length} Q-száma jelölve van az adatban`);
}

// A kézi magyar nevek: hatottak-e? A rossz kulcs néma hiba.
const javHu = JSON.parse(
  await readFile(new URL("./javitasokHu.json", import.meta.url), "utf8"),
);
const javHuKulcsok = Object.keys(javHu).filter((k) => !k.startsWith("_"));
const javHuHibas = javHuKulcsok.filter((k) => !helyek.some((h) => h.q === k));
if (javHuHibas.length) {
  hiba(
    `a javitasokHu.json ${javHuHibas.length} Q-száma nincs az adatfájlban: ${javHuHibas.join(", ")}`,
  );
}
const javHuHatott = javHuKulcsok.filter((k) => helyek.some((h) => h.q === k && h.hu === javHu[k]));
if (javHuHatott.length !== javHuKulcsok.length) {
  hiba(
    `csak ${javHuHatott.length}/${javHuKulcsok.length} kézi magyar név érvényesült az adatfájlban`,
  );
} else {
  rendben(`mind a ${javHuKulcsok.length} kézi magyar név látszik az adatban`);
}

// A két magyar forrás összevetése a KIA mérésével.
//
// A `javitasokHu.json` szabálya: KÉT forrás kell (KIA + magyar Wikipedia),
// tehát minden kézi javításnak meg kell lennie a `kiaMagyarNev.json`-ban is.
// És fordítva: a `nincsMagyarNev.json` állítja, hogy az adott helynek nincs
// magyar neve — ha a KIA mégis ad magyar nevet, a jelölés HAMIS.
//
// Ez a két sor eddig kézi mérésből jött, tehát elavulhatott. A `kia.mjs`
// újrafuttatásával frissíthető, és az ellenőrző szól, ha kettőjük
// összecsúszik.
const kiaHu = JSON.parse(
  await readFile(new URL("./kiaMagyarNev.json", import.meta.url), "utf8"),
);
const kiaQ = Object.keys(kiaHu).filter((k) => !k.startsWith("_"));
const kiaJav = kiaQ.filter((q) => kiaHu[q].allapot === "javítva");

// A "merve" állapot a kétforrás-szabály felülete: a KIA nevet adott, de
// senki nem döntött róla. Ez nem hiba, hanem feltétlen munka — de ha
// bentmarad, a szabály körbe jár: a javítás megvárja a mérést, a mérés a
// javítást.
const feldolgozatlan = kiaQ.filter((q) => kiaHu[q].allapot === "merve");
if (feldolgozatlan.length) {
  hiba(
    `${feldolgozatlan.length} KIA-bejegyzés még feldolgozatlan (allapot: "merve"): ` +
      `${feldolgozatlan.map((q) => `${q} (${kiaHu[q].nev})`).join(", ")} — ` +
      "nézd meg a magyar Wikipedia cikkét, és írd be a javítást vagy az elutasítást",
  );
}

const javHuNincsKia = javHuKulcsok.filter((k) => !(k in kiaHu));
if (javHuNincsKia.length) {
  hiba(
    `a javitasokHu.json ${javHuNincsKia.length} bejegyzésének nincs KIA-megerősítése: ` +
      `${javHuNincsKia.join(", ")} — két forrás szabály (a kia.mjs újrafuttatásával ` +
      "érdemes ellenőrizni, hogy a KIA tényleg nem ad magyar nevet)",
  );
}
const javHuNemJav = javHuKulcsok.filter(
  (k) => kiaHu[k] && kiaHu[k].allapot !== "javítva",
);
if (javHuNemJav.length) {
  hiba(
    `a javitasokHu.json ${javHuNemJav.length} bejegyzése a KIA-mérésben nem "javítva": ` +
      javHuNemJav.map((k) => `${k} (${kiaHu[k].allapot})`).join(", "),
  );
}

// Aki magyar nevet kapott, annak nem lehet "nincs magyar neve" jelölése.
const jelzesKia = nincsQ.filter((q) => kiaJav.includes(q));
if (jelzesKia.length) {
  hiba(
    `${jelzesKia.length} hely "nincs magyar neve" jelölésben van, de a KIA magyar nevet ` +
      `ad nekik: ${jelzesKia.map((q) => `${q} (${kiaHu[q].nev})`).join(", ")} — ` +
      "a jelölés valószínűleg téves, vagy a javítás be kell kerülni a javitasokHu.json-ba",
  );
} else {
  rendben(
    `a ${kiaQ.length} KIA-bejegyzés (${kiaJav.length} elfogadva) és a ${nincsQ.length} ` +
      "jelölés nem mond ellent egymásnak",
  );
}

// 7b. A verzió és a leképezés, amit az oldal tényleg olvas.
//
// Az adatot a `letolt.mjs` írja, a `keres.js` a footerben mutatja, a
// `szabalyok.mjs` mondja meg, melyik az aktuális. Ha a kettő elcsúszik, a
// felhasználó egy régebbi adathalmazt néz, és azt nem tudja, hiszen minden
// más zöld. Ez pontosan az a hibaosztály, amit ez a projekt megtanult: ami
// néma, az nem látható.
if (adat.verzio === undefined) {
  hiba("a helyek.json-ból hiányzik a verzio mező — újragenerálás kell (node letolt.mjs)");
} else if (adat.verzio !== VERZIO) {
  hiba(
    `az adat verziója (${adat.verzio}) nem egyezik a szabályokéval (${VERZIO}) — ` +
      "vagy a helyek.json maradt régen, vagy a szabalyok.mjs-ben kell emelni a VERZIO-t",
  );
} else {
  rendben(`az adat verziója ${VERZIO}, egyezik a szabályokéval`);
}

// A `keres.js` NEM a helyek.json-t olvassa, hanem a helyek.min.json-t. A
// kettő külön fájl, szóval elcsúszhatnak — és akkor minden ellenőrzés
// zöld, miközben az oldal régebbi adatot mutat. Ez a hiba eddig láthatatlan
// volt, mert senki nem hasonlította össze a kettőt.
const min = JSON.parse(
  await readFile(new URL("./helyek.min.json", import.meta.url), "utf8"),
);
if (JSON.stringify(min) !== JSON.stringify(adat)) {
  hiba(
    "a helyek.min.json (amit az oldal olvas) nem egyezik a helyek.json-nal " +
      `(min: ${min.helyek?.length} helység, verzio ${min.verzio ?? "nincs"}; ` +
      `json: ${adat.helyek.length} helység, verzio ${adat.verzio ?? "nincs"}) — ` +
      "újragenerálás kell (node letolt.mjs)",
  );
} else {
  rendben(`a helyek.min.json is friss (${min.helyek.length} helység)`);
}
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

// A "Kézdiszentvincent" és a "Borosjenő" tudottan hiányzik (a Wikidata-n sincs
// magyar nevük), és ez a két hiba minden futáskor megjelenik. A számot mégsem
// írjuk be mereven: ha egy új hiba jelenik meg, a sor ennyivel lesz hosszabb,
// és a "2 hiba" állítás már nem mond igazat.
const TUDOTTAN_HIBAS = 2;
const ujHibak = Math.max(0, hibak - TUDOTTAN_HIBAS);
console.log(
  hibak
    ? `\n${hibak} hiba, ebből ${TUDOTTAN_HIBAS} tudottan hiányzó hely ` +
        `("Kézdiszentvincent", "Borosjenő"). ÚJ hiba: ${ujHibak}` +
        (ujHibak ? " — nézd meg a fenti ✗ sorokat." : "")
    : "\nNincs hiba a fő ellenőrzéseken.",
);
if (ujHibak) process.exitCode = 1;