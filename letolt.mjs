// Letölti a Wikidata-ról az erdélyi helységeket, és kiírja helyek.json-ba.
//
// Három lépésben dolgozik, mindegyik azért külön, mert a `P131*` (átmenő
// tulajdonság) lefut a SPARQL-végpont időkorlátjába:
//
//   A. minden, aminek van magyar és román neve, a megyék alatt — osztály
//      szűrés nélkül. Ebből kiderülnek a használt osztályok.
//   B. a földrajzi osztályok megkérdezése: melyik lakott helység? Ez a
//      lépés azért külön, mert a `wdt:P279*` átmenő utat a végpont nem bírja
//      a teljes adatbázison, de 180 osztályon át megy villámgyorsan.
//   C. a A. lépésben talált községek és városok alatt minden, ami magyar és
//      román nevű — megint osztály szűrés nélkül.
//
// Az A. és C. lépés eredményét helyben (JavaScriptben) szűrjük osztályra, az
// osztálylistát a B. lépés adja. Így nem kell felsorolni a román
// adminisztráció néhány osztályát kézzel: bármit használnak, ez észreveszi.
//
// A kérések SZÁZONKÉNT, egymás után mennek (nem párhuzamosan), és minden
// csomag eredménye a .cache/ mappába kerül, hogy egy félbeszakadt futás után
// ne kelljen elölről kezdeni.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { nemHelyseg } from "./szabalyok.mjs";

const VEGEGPL = "https://query.wikidata.org/sparql";
const USER_AGENT = "mivelkezdjem.hu helynevekereso (https://mivelkezdjem.hu)";
const EMBER = "Q486972"; // "human settlement" — minden emberi lakhely ősosztálya

// A román adminisztráció NAGY RÉSZE nem "emberi lakhely", hanem
// közigazgatási terület a Wikidata-n, így a `P279* emberi lakhely`
// (Q486972) keresés nem találja meg őket. Ezek nélkül kimaradna az összes
// község ÉS a megyeszékhelyek többsége.
//
// Ez nem véletlen: a "municipality of Romania" (Q640364) a "municipality"
// (Q15284) alá van kötve, ami az "adminisztrative territorial entity"-hez
// tartozik, nem a lakhelyhez. Csak a "county seat in Romania" (Q34843301)
// kapcsolódik a "city"-hez (Q515), és így a lakhelyhez is.
//
// Ezért itt újabb osztályokat kell felsorolni. Ha a Wikidata újat vezet be,
// a hiba néma: a helység egyszerűen nem jelenik meg az oldalon. Az
// `ellenoriz.mjs` ilyenkor a "fő helységek" listáján szól.
const TELEPULESC_IS_KOZIGAZGATAS = [
  "Q659103", // commune of Romania — a községek, kb. 544
  "Q640364", // municipality of Romania — a megyeszékhelyek, kb. 33
  "Q34843301", // county seat in Romania
  "Q34842263", // township seat
  "Q34841063", // seat of the local council
  "Q16858213", // town in Romania
  "Q15921247", // constituent locality
  "Q1907114", // metropolitan area
];

// Fordítva: vannak osztályok, amiket a Wikidata az "emberi lakhely" alá
// köt, de nem önálló lakhelyek. Ezek kimaradnak: a "Kézdivásárhely
// történelmi központja", a kolozsvári negyedek, a római castrumok és a
// kolostorok nem külön kereshető helységek.
const NEM_ONALLO_LAKHELY = [
  "Q1187811", // college town
  "Q123705", // neighborhood
  "Q140456098", // rural ensemble
  "Q15661340", // ancient city
  "Q160742", // abbey
  "Q201759", // slum
  "Q20616831", // submerged settlement
  "Q21507948", // former village
  "Q2583015", // ghetto in Nazi-occupied Europe
  "Q2983893", // quarter
  "Q44613", // monastery
  "Q5228121", // dava (Dacian fortified settlement)
  "Q66626342", // urban ensemble
  "Q676050", // old town
  "Q702492", // urban area
  "Q88205", // castrum
  "Q89477", // castellum
];

// Az agglomerációk ("Kolozsvár metropolisztérség") NEM helységek, de
// osztály szerint nem szűrhetők ki, mert a "metropolitan area" (Q1907114)
// és a "metropolis" (Q200250) is az "emberi lakhely" alá van kötve a
// Wikidata-n. Ezt a `szabalyok.mjs` dönti el, a NÉV alapján, és az
// `ellenoriz.mjs` ugyanazt a szabályt ellenőrzi a kész adaton.

// Erdély megyéi. A rövid kód a román megyekód (CJ, MS, ...), a q a
// Wikidata-azonosító. A `de` név akkor kell, ha biztos vagy benne; a `null`
// azt jelenti "nincs rendes német nevem", és akkor a kereső sem próbál
// rákeresni a megye német nevére.
export const MEGYEK = [
  { q: "Q182624", kod: "CJ", hu: "Kolozsvár", ro: "Cluj", de: "Klausenburg" },
  { q: "Q45868", kod: "AB", hu: "Nagy-Albás", ro: "Alba", de: "Alba Iulia" },
  { q: "Q182614", kod: "BV", hu: "Brassó", ro: "Brașov", de: "Kronstadt" },
  { q: "Q188959", kod: "CV", hu: "Kovászna", ro: "Covasna", de: null },
  { q: "Q190702", kod: "HR", hu: "Hargita", ro: "Harghita", de: "Hargitha" },
  { q: "Q191071", kod: "HD", hu: "Hunyad", ro: "Hunedoara", de: "Hunyad" },
  { q: "Q190711", kod: "MS", hu: "Maros", ro: "Mureș", de: "Marosburg" },
  { q: "Q184797", kod: "SB", hu: "Szeben", ro: "Sibiu", de: "Hermannstadt" },
  { q: "Q181513", kod: "BN", hu: "Beszterce-Nászád", ro: "Bistrița-Năsăud", de: "Bistritz" },
];

// Egy-egy kérés ennyi helységet vehet fel. Nagyobb érték gyorsabb, de a
// végpontnak is el kell bírnia a WHERE részt.
const CHUNK = 120;

// Kérésenkénti szünet. A Wikidata kieséskor 1 kérés/perc-re szorul
// (2026 októberében épp ez volt), ilyenkor lassabb automatikusan.
const ALAP_SZUNET = 1500;
const MAX_VARAKOZAS = 90_000;

const CACHE = new URL("./.cache/", import.meta.url);
const KIMENET = new URL("./helyek.json", import.meta.url);
const KIMENET_LEPEG = new URL("./helyek.min.json", import.meta.url);
const JAVITASOK = new URL("./javitasok.json", import.meta.url);

const varakozas = (ms) => new Promise((r) => setTimeout(r, ms));

function darabol(tomb, meret) {
  const darabok = [];
  for (let i = 0; i < tomb.length; i += meret) darabok.push(tomb.slice(i, i + meret));
  return darabok;
}

/** Egy SPARQL kérés POST-tal, újrapróbálással és 429-es várakozással. */
async function kdez(query, magyarázat) {
  let varakozasMost = ALAP_SZUNET;
  for (let proba = 0; proba < 6; proba++) {
    if (proba > 0) await varakozas(varakozasMost);
    let valasz;
    try {
      valasz = await fetch(VEGEGPL, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      console.error(`  hiba: ${e.message}`);
      varakozasMost = Math.min(varakozasMost * 2, MAX_VARAKOZAS);
      continue;
    }

    // 429 = túl sok kérés. A végpont ilyenkor azt is megmondja, meddig várjunk.
    if (valasz.status === 429) {
      const szoveg = await valasz.text();
      const perc = szoveg.match(/1 req \/ (\d+) min/);
      const mp = perc ? Number(perc[1]) * 60_000 : varakozasMost;
      console.warn(`  túl gyorsan kérdeztünk, ${Math.round(mp / 1000)}mpet várok`);
      varakozasMost = Math.min(Math.max(mp, varakozasMost) + 5000, MAX_VARAKOZAS);
      continue;
    }
    if (!valasz.ok) {
      console.error(`  HTTP ${valasz.status}: ${(await valasz.text()).slice(0, 200)}`);
      varakozasMost = Math.min(varakozasMost * 2, MAX_VARAKOZAS);
      continue;
    }

    const json = await valasz.json();
    console.log(`  ✓ ${magyarázat} (${json.results.bindings.length} sor)`);
    return json.results.bindings;
  }
  throw new Error(`Nem sikerült lekérdezni: ${magyarázat}`);
}

/** Sorszám nélküli Wikidata-azonosító: .../Q1234 -> Q1234 */
const qid = (uri) => uri.split("/").pop();

/**
 * A kéréseket százonként, egymás után futtatja, és a részleteket a
 * .cache/{nev}-{index}.json fájlokban tartja. Szándékosan sorban: párhuzamosan
 * buktatnak ki a rate limitet, és a Wikidata amúgy is soronként kezeli.
 */
async function lekérdezHalmaz({ nev, celok, osszegyujt }) {
  const sorok = [];
  for (const [i, darab] of darabol(celok, CHUNK).entries()) {
    const fajl = new URL(`${nev}-${i}.json`, CACHE);
    if (existsSync(fajl)) {
      console.log(`  · ${nev}-${i}.json a gyorsítótárban (${darab.length} cél)`);
      sorok.push(...JSON.parse(await readFile(fajl, "utf8")));
      continue;
    }
    const uj = await kdez(osszegyujt(darab), `${nev} #${i} (${darab.length} cél)`);
    await writeFile(fajl, JSON.stringify(uj));
    sorok.push(...uj);
  }
  return sorok;
}

/** Osztály szűrés NÉLKÜLI lekérdezés: minden magyar+román nevű dolog a célok alatt. */
const KERDES = (cel) => `
  SELECT DISTINCT ?hely ?cel ?osztaly ?hu ?ro ?de WHERE {
    VALUES ?cel { ${cel.map((c) => "wd:" + c).join(" ")} }
    ?hely wdt:P131 ?cel .
    ?hely wdt:P31 ?osztaly .
    ?hely rdfs:label ?hu . FILTER(LANG(?hu) = "hu")
    ?hely rdfs:label ?ro . FILTER(LANG(?ro) = "ro")
    OPTIONAL { ?hely rdfs:label ?de . FILTER(LANG(?de) = "de") }
    ?hely wdt:P17 wd:Q218 .
  }`;

async function main() {
  await mkdir(CACHE, { recursive: true });
  const megyeQid = new Map(MEGYEK.map((m) => [m.q, m]));
  const megyeSorrend = new Map(MEGYEK.map((m, i) => [m.kod, i]));

  console.log("A. Minden magyar+román nevű dolog a megyék alatt");
  const megyeSorok = await lekérdezHalmaz({
    nev: "megye",
    celok: MEGYEK.map((m) => m.q),
    osszegyujt: KERDES,
  });

  const kozsegek = new Map(); // q -> { cel: megyeQid, osztalyok: Set }
  const osztalyok = new Set();
  for (const s of megyeSorok) {
    const q = qid(s.hely.value);
    if (!kozsegek.has(q)) {
      kozsegek.set(q, { cel: qid(s.cel.value), osztalyok: new Set() });
    }
    kozsegek.get(q).osztalyok.add(qid(s.osztaly.value));
    osztalyok.add(qid(s.osztaly.value));
  }
  console.log(`  ${kozsegek.size} különböző hely a megyék alatt, ${osztalyok.size} osztály`);

  console.log("C. Minden magyar+román nevű dolog a községek alatt");
  const kozsegSorok = await lekérdezHalmaz({
    nev: "kozseg",
    celok: [...kozsegek.keys()],
    osszegyujt: KERDES,
  });

  const falvak = new Map(); // q -> { cel: kozsegQid, osztalyok: Set }
  for (const s of kozsegSorok) {
    const q = qid(s.hely.value);
    if (kozsegek.has(q)) continue; // a községeket már betettük
    if (!falvak.has(q)) falvak.set(q, { cel: qid(s.cel.value), osztalyok: new Set() });
    falvak.get(q).osztalyok.add(qid(s.osztaly.value));
    osztalyok.add(qid(s.osztaly.value));
  }
  console.log(`  ${falvak.size} további hely a községek alatt`);

  // B. Melyik osztály emberi lakhely? Ez a szűrés Őgy nem fut időkorlatba.
  console.log("B. Melyik osztály emberi lakhely?");
  const telepulesOsztaly = new Set(
    (
      await kdez(
        `SELECT DISTINCT ?osztaly WHERE {
           VALUES ?osztaly { ${[...osztalyok].map((o) => "wd:" + o).join(" ")} }
           ?osztaly wdt:P279* wd:${EMBER} .
         }`,
        `${osztalyok.size} osztály megvizsgálva`,
      )
    ).map((s) => qid(s.osztaly.value)),
  );
  console.log(`  ${osztalyok.size} osztály közül ${telepulesOsztaly.size} a lakhely`);

  // Így döntjük el, hogy egy osztály lakhely-e:
  //   - ha a Wikidata "emberi lakhely" alá köti, igen, KIVÉVE ha a fenti
  //     NEM_ONALLO_LAKHELY listában van (negyed, kolostor, castrum stb.),
  //   - ha közigazgatási helységként van megadva (község), szintén igen.
  const telepules = (o) =>
    NEM_ONALLO_LAKHELY.includes(o) ? false
    : TELEPULESC_IS_KOZIGAZGATAS.includes(o) ? true
    : telepulesOsztaly.has(o);

  const kiszurtOsztalyLista = [...osztalyok].filter((o) => !telepules(o));
  if (kiszurtOsztalyLista.length) {
    console.log(
      `  a többi (${kiszurtOsztalyLista.length}) nem önálló lakhely, kiesik: templom, kastély, út stb.`,
    );
  }

  const javitasok = JSON.parse(await readFile(JAVITASOK, "utf8"));

  // Egy helységnek sokféle P31-je lehet, és a nevét is többször kaptuk meg.
  // Egy-egy sort tartunk meg helységenként, de a német néves sort előnyben
  // részesítjük: ugyanannak a helynek lehet olyan sora is, ahol ?de üres.
  const nevek = new Map();
  for (const s of [...megyeSorok, ...kozsegSorok]) {
    const q = qid(s.hely.value);
    const eddig = nevek.get(q);
    if (!eddig || (!eddig.de && s.de)) {
      nevek.set(q, { hu: s.hu.value, ro: s.ro.value, de: s.de?.value });
    }
  }

  const helyek = [];
  let kiszurt = 0;
  let nincsMegye = 0;
  let duplikalt = 0;
  let agglomeracio = 0;
  const kihagyottAglomeraciok = [];

  for (const [q, adat] of [...kozsegek, ...falvak]) {
    // Ha a helynek BÁRMELYIK osztálya a nem-önálló-lakhelyek közül van,
    // eldobjuk. Így van, aki több osztályú is (a "Kolozsvár metropolisztérség"
    // egyszerre metropolisztérség és metropolis, és a második osztály
    // különben átcsúszott volna).
    const nemOnallo = [...adat.osztalyok].some((o) => NEM_ONALLO_LAKHELY.includes(o));
    const lakottHely = !nemOnallo && [...adat.osztalyok].some(telepules);
    // Mindhárom névet nézzük, nem csak a magyart: a Wikidata ugyanazt az
    // agglomerációt magyarul "Metropoliszövezet"-nek, románul "Zona
    // metropolitană"-nak hívja, és csak egyik nyelven lehet eltalálni.
    if (lakottHely && nemHelyseg(nevek.get(q))) {
      agglomeracio++;
      kihagyottAglomeraciok.push({ q, hu: nevek.get(q).hu });
      continue;
    }
    if (!lakottHely) {
      kiszurt++;
      continue;
    }

    const celQid = adat.cel;
    // Az A. lépésben a ?cel maga a megye, a C.-ben a szülő község.
    // Egy falunál tehát meg kell nézni, hogy a szülő község melyik megyében
    // van; a megyeszékhelynél nincs szülő község, az maga a megye alatt van.
    const megyeQ = kozsegek.has(q)
      ? kozsegek.get(q).cel
      : (kozsegek.get(celQid)?.cel ?? celQid);
    const megye = megyeQid.get(megyeQ);
    if (!megye) {
      nincsMegye++;
      continue;
    }

    const s = nevek.get(q);
    const hu = s.hu;
    const ro = s.ro;

    // A magyar címke a községnél a hivatalos nevet adja, "község" szóval
    // együtt ("Ajton község"), a faluét meg az egyértelmű "Ajton"-t. Ezt
    // NEM levágjuk: sok községnek pont az egyetlen faluja azonos nevű, és
    // levágás után 556 duplikált sor keletkezett.
    helyek.push({
      q,
      qSzam: Number(q.slice(1)),
      hu,
      ro,
      de: nemetNev(s.de, ro, javitasok),
      megye: megye.kod,
      kozseg: kozsegek.has(q) ? null : celQid,
      kozsegNev: kozsegek.has(q) ? null : nevek.get(celQid)?.hu ?? null,
      wikidata: `https://www.wikidata.org/wiki/${q}`,
    });
  }

  if (kiszurt) console.log(`  ${kiszurt} nem-lakott dolgot kihagytunk (templom, kastély, út stb.)`);
  // A javitasok.json rossz kulcsa néma hiba: a javítás nem érvényesül és
  // nem szólunk. Ezért nézzük meg, hogy hatott-e.
  const javKulcsok = Object.keys(javitasok).filter((k) => !k.startsWith("_"));
  const javHibas = javKulcsok.filter((k) => !helyek.some((h) => h.ro === k));
  const javHatott = javKulcsok.filter((k) =>
    helyek.some((h) => h.ro === k && h.de === javitasok[k]),
  );
  if (javHibas.length) {
    console.log(
      `  figyelem: a javitasok.json ${javHibas.length} kulcsa nem illik egyetlen helyhez sem: ${javHibas.join(", ")}`,
    );
  }
  console.log(`  ${javHatott.length}/${javKulcsok.length} kézi német név érvényesült`);

  if (agglomeracio) {
    // Kilistázzuk, mert a szűrés a névre épül, és ha a Wikidata átírja a
    // címet, a szabály csendben átenged valamit. Innen látszik, hogy a
    // kizárás még mindig ugyanazokat érinti-e.
    console.log(`  ${agglomeracio} agglomerációt kihagytunk (nem helység, csak egy város és a környéke):`);
    for (const n of kihagyottAglomeraciok) console.log(`    ${n.q} ${n.hu}`);
  }
  if (nincsMegye) console.warn(`  figyelem: ${nincsMegye} helynél nem sikerült a megyét, kihagyva`);

  // Ugyanaz a román név kétszer, ugyanabban a megyében: ugyanarról a
  // helyről van két Wikidata-elem (ilyen például a Kolozsvár: Q100188 és
  // Q16898189). A kisebb Q-számú nyer, mert a Wikidata sorszámai korán
  // létrejött elemekre utalnak — ez a kanonikus bejegyzés.
  //
  // Két megyében lehet ugyanaz a név, és az NEM duplikátum: Dăbâca/Doboka
  // egyszer Kolozsvár, egyszer Hunyad megyében valódi két falu. Azokat
  // megtartjuk mindkettőt.
  const nevre = new Map();
  for (const h of helyek) {
    const kulcs = `${h.megye}|${h.ro.toLowerCase()}`;
    const eddig = nevre.get(kulcs);
    if (!eddig) {
      nevre.set(kulcs, h);
      continue;
    }
    if (h.qSzam < eddig.qSzam) nevre.set(kulcs, h);
    duplikalt++;
  }
  if (duplikalt) {
    console.log(`  ${duplikalt} duplikált Wikidata-elemet elhagytunk (ugyanaz a hely kétszer ugyanabban a megyében)`);
  }
  helyek.length = 0;
  helyek.push(...nevre.values());
  for (const h of helyek) delete h.qSzam;

  helyek.sort(
    (a, b) =>
      megyeSorrend.get(a.megye) - megyeSorrend.get(b.megye) ||
      a.hu.localeCompare(b.hu, "hu"),
  );

  const kimenet = {
    generatas: new Date().toISOString(),
    forras: "Wikidata (CC0) + javitasok.json",
    telepulesOsztaly: [...telepulesOsztaly].sort(),
    megyek: MEGYEK,
    helyek,
  };
  await writeFile(KIMENET, JSON.stringify(kimenet, null, 1));
  await writeFile(KIMENET_LEPEG, JSON.stringify(kimenet));

  console.log(`\nKész: ${helyek.length} helység, ${helyek.filter((h) => h.de).length} német nevet kapott.`);
  for (const m of MEGYEK) {
    console.log(`  ${m.kod} ${m.hu}: ${helyek.filter((h) => h.megye === m.kod).length}`);
  }
  console.log(`Ide írtam: ${KIMENET.pathname}`);
}

/**
 * A német név, három szabály szerint:
 *  1. ha szerepel a javitasok.json-ban, az az igazi (kézzel ellenőrzött),
 *  2. ha a Wikidata oda szinte a román nevet másolta, nincs német nevenk,
 *  3. zárójeles magyarázatot ("Luna (Cluj)") levágjuk, mert az nem név.
 *
 * A 2. pont trükkös: a Wikidata gyakran a román névből csinál "német" nevet,
 * csak a végződésen ront egy kicsit ("Hodaie" -> "Hodaei"). Ezért nem
 * szövegesen hasonlítunk, hanem a betűk sorrendjétől függetlenül: ha ugyan
 * azok a betűk, ugyanaz a szó.
 */
function nemetNev(deWikidata, ro, javitasok) {
  if (!deWikidata && !(ro in javitasok)) return null;
  const tisztitott = deWikidata
    ? deWikidata.replace(/\s*\([^)]*\)\s*$/u, "").trim()
    : null;
  // A kézi javítás elsőbbséget élvez, de az se lehet, ami a román nevét
  // ismétli: az nem német név.
  const jelolt = ro in javitasok ? javitasok[ro] : tisztitott;
  return ugyanazSzo(jelolt, ro) ? null : jelolt;
}

/** Igaz, ha a két szó ugyanazok betűkből áll, bár más sorrendben. */
function ugyanazSzo(a, b) {
  const rendez = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z]/g, "")
      .split("")
      .sort()
      .join("");
  return rendez(a) === rendez(b) && rendez(a).length > 0;
}

main().catch((e) => {
  console.error("\nNem sikerült:", e.message);
  process.exit(1);
});