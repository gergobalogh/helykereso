// Letölti a Wikidata-ról a helységeket, és kiírja helyek.json-ba.
// Erdély + Partium + Bánság + Kárpátalja + határmegyék (HU/RS), egyben.
//
// Három lépésben dolgozik, mindegyik azért külön, mert a `P131*` (átmenő
// tulajdonság) lefut a SPARQL-végpont időkorlátjába:
//
//   A. minden, aminek van magyar neve, a megyék alatt — osztály
//      szűrés nélkül. Ebből kiderülnek a használt osztályok.
//   B. a földrajzi osztályok megkérdezése: melyik lakott helység? Ez a
//      lépés azért külön, mert a `wdt:P279*` átmenő utat a végpont nem bírja
//      a teljes adatbázison, de 180 osztályon át megy villámgyorsan.
//   C. a A. lépésben talált községek és városok alatt minden, ami magyar
//      nevű — megint osztály szűrés nélkül.
//
// A román név 3.0.0 óta `OPTIONAL`: határon túl (HU, részben UA/RS) sok
// helynek nincs román címkéje a Wikidata-n, és a kötelező szűrés
// kitörölné őket a keresőből. Ahol nincs, ott a soron csak a magyar
// (és ha van, a német) név látszik.
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
import { nemHelyseg, deRomanEkezet, utalok, cirillAtir, szurDuplikat, VERZIO } from "./szabalyok.mjs";
import { gazdagitTerkepAdattal } from "./terkepadat.mjs";

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
  "Q783930", // municipality of Serbia — a vajdasági községek (opština)
];

// Fordítva: vannak osztályok, amiket a Wikidata az "emberi lakhely" alá
// köt, de nem önálló lakhelyek. Ezek kimaradnak: a "Kézdivásárhely
// történelmi központja", a kolozsvári negyedek, a római castrumok és a
// kolostorok nem külön kereshető helységek.
const NEM_ONALLO_LAKHELY = [  "Q1187811", // college town
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

// A fenti listából az a három, ami MELLETTE szóló lakott-hely osztály
// esetén is kizár: a városnegyed, a negyed és az óváros sosem önálló
// helység. A többi (egyetemváros, urbánus terület, kolostor, castrum…)
// csak akkor dönt, ha nincs mellette lakott-hely osztály — különben
// Arad, Temesvár és Resicabánya is kiesne, pedig azok megyeszékhelyek.
const VETO_OSZTALY = [
  "Q123705", // neighborhood
  "Q2983893", // quarter
  "Q676050", // old town
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
//
// 2.0.0 óta Partium+Bánság is bent van (BH, SJ, SM, MM, AR, TM, CS),
// 3.0.0 óta pedig a határon túli tömb: Kárpátalja (UA), négy magyar
// megye és a bánsági körzetek (RS) — egy projektben, mert a történelem
// nem állt meg Trianonnál. Az `orszag` mondja meg, melyik mai országban
// van a megye: a lekérdezés `P17` szűrője és a sorvégi országjelölés
// ebből jön. A magyar megyéknél a `ro` a magyar név átvétele (a román
// a magyar neveket többnyire így használja); a bánsági körzeteknél rendes
// román exonim van. A kárpátaljai bejegyzések járási szintűek (ld. alább).
export const MEGYEK = [
  { q: "Q182624", kod: "CJ", hu: "Kolozsvár", ro: "Cluj", de: "Klausenburg", orszag: "RO" },
  { q: "Q45868", kod: "AB", hu: "Nagy-Albás", ro: "Alba", de: "Alba Iulia", orszag: "RO" },
  { q: "Q182614", kod: "BV", hu: "Brassó", ro: "Brașov", de: "Kronstadt", orszag: "RO" },
  { q: "Q188959", kod: "CV", hu: "Kovászna", ro: "Covasna", de: null, orszag: "RO" },
  { q: "Q190702", kod: "HR", hu: "Hargita", ro: "Harghita", de: "Hargitha", orszag: "RO" },
  { q: "Q191071", kod: "HD", hu: "Hunyad", ro: "Hunedoara", de: "Hunyad", orszag: "RO" },
  { q: "Q190711", kod: "MS", hu: "Maros", ro: "Mureș", de: "Marosburg", orszag: "RO" },
  { q: "Q184797", kod: "SB", hu: "Szeben", ro: "Sibiu", de: "Hermannstadt", orszag: "RO" },
  { q: "Q181513", kod: "BN", hu: "Beszterce-Nászád", ro: "Bistrița-Năsăud", de: "Bistritz", orszag: "RO" },
  { q: "Q179588", kod: "BH", hu: "Bihar", ro: "Bihor", de: null, orszag: "RO" },
  { q: "Q190690", kod: "SJ", hu: "Szilágy", ro: "Sălaj", de: null, orszag: "RO" },
  { q: "Q165459", kod: "SM", hu: "Szatmár", ro: "Satu Mare", de: null, orszag: "RO" },
  { q: "Q188813", kod: "MM", hu: "Máramaros", ro: "Maramureș", de: null, orszag: "RO" },
  { q: "Q179559", kod: "AR", hu: "Arad", ro: "Arad", de: null, orszag: "RO" },
  { q: "Q185586", kod: "TM", hu: "Temes", ro: "Timiș", de: null, orszag: "RO" },
  { q: "Q187925", kod: "CS", hu: "Krassó-Szörény", ro: "Caraș-Severin", de: null, orszag: "RO" },
  // Kárpátalja: az ukrán lánc háromszintes (megye → járás → kistérség →
  // falu), a letöltő viszont kettőt tud (megye → község → falu). Ezért itt
  // a JÁRÁSOK a célok: alattuk a kistérségek, azok alatt a falvak — pont
  // mint Romániában a községek alatt. A megye (oblaszty) külön bejegyzés,
  // hogy a közvetlenül alája kötött városok (ha vannak) se vesszenek el.
  // Mind a `ZK` kódon osztozik: a kijelzésben egy megye ("Kárpátalja").
  { q: "Q170213", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q98659359", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q65203424", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q98637562", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q98663281", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q103820074", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q104539085", kod: "ZK", hu: "Kárpátalja", ro: "Transcarpatia", de: null, orszag: "UA" },
  { q: "Q190518", kod: "SZB", hu: "Szabolcs-Szatmár-Bereg", ro: "Szabolcs-Szatmár-Bereg", de: null, orszag: "HU" },
  { q: "Q185368", kod: "HJB", hu: "Hajdú-Bihar", ro: "Hajdú-Bihar", de: null, orszag: "HU" },
  { q: "Q191616", kod: "BEK", hu: "Békés", ro: "Békés", de: null, orszag: "HU" },
  { q: "Q193031", kod: "CSC", hu: "Csongrád-Csanád", ro: "Csongrád-Csanád", de: null, orszag: "HU" },
  { q: "Q728041", kod: "EBN", hu: "Észak-Bánság", ro: "Banatul de Nord", de: null, orszag: "RS" },
  { q: "Q425782", kod: "KBN", hu: "Közép-Bánság", ro: "Banatul Central", de: null, orszag: "RS" },
  { q: "Q720030", kod: "DBN", hu: "Dél-Bánság", ro: "Banatul de Sud", de: null, orszag: "RS" },
];

// Országok Wikidata-azonosítói a `P17` szűrőhöz. Külön kell, mert egy
// kérés egy `VALUES ?cel` halmazt visz, és a megyék országonként más
// `P17`-et kérnek — a kevert kérés vagy lassú, vagy rossz találatot ad.
const ORSZAG_P17 = { RO: "Q218", UA: "Q212", HU: "Q28", RS: "Q403" };

// Országnevek a sorvégi jelöléshez. A romániai sorokon nincs ország
// (az az alapértelmezett, és a régi sorok nem változnak); a többin ott.
export const ORSZAG_NEV = { HU: "Magyarország", UA: "Ukrajna", RS: "Szerbia" };

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
const JAVITASOK_HU = new URL("./javitasokHu.json", import.meta.url);
const NINCS_MAGYAR_NEV = new URL("./nincsMagyarNev.json", import.meta.url);

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

/** Osztály szűrés NÉLKÜLI lekérdezés: minden magyar nevű dolog a célok alatt. */
const KERDES = (cel, p17, altLang) => `
  SELECT DISTINCT ?hely ?cel ?osztaly ?hu ?ro ?de ?alt WHERE {
    VALUES ?cel { ${cel.map((c) => "wd:" + c).join(" ")} }
    ?hely wdt:P131 ?cel .
    ?hely wdt:P31 ?osztaly .
    OPTIONAL { ?hely rdfs:label ?hu . FILTER(LANG(?hu) = "hu") }
    OPTIONAL { ?hely rdfs:label ?ro . FILTER(LANG(?ro) = "ro") }
    OPTIONAL { ?hely rdfs:label ?de . FILTER(LANG(?de) = "de") }
    ${altLang ? `OPTIONAL { ?hely rdfs:label ?alt . FILTER(LANG(?alt) = "${altLang}") }` : ""}
    ?hely wdt:P17 wd:${p17} .
  }`;

// Tartalék nyelv országonként, ha nincs magyar címke. Kárpátalja falvainak
// zöme ukrán címkés csak — nélkülük a `ZK` kódon 48 hely maradna 500 helyett.
// A tartalékkal bejött sor pótolt nevű (`huPotolt`) és automatikusan
// jelölt: a jelölés itt nem kézi mérés, hanem bizonyos tudás (nincs `hu`
// címke a Wikidata-n), és a "javítása" linkkel pótolható.
const ALT_NYELV = { UA: "uk", RS: "sr" };

async function main() {
  await mkdir(CACHE, { recursive: true });
  const megyeQid = new Map(MEGYEK.map((m) => [m.q, m]));
  const megyeSorrend = new Map();
  for (const [i, m] of MEGYEK.entries()) {
    if (!megyeSorrend.has(m.kod)) megyeSorrend.set(m.kod, i);
  }
  const megyeOrszag = new Map(MEGYEK.map((m) => [m.q, m.orszag]));

  console.log("A. Minden magyar nevű dolog a megyék alatt");
  const megyeSorok = [];
  for (const cc of [...new Set(MEGYEK.map((m) => m.orszag))]) {
    // Országonként külön kérés és külön gyorsítótár (`megye-RO-0.json`):
    // más a `P17` (és a tartaléknyelv), és a kevert `VALUES` halmaz a
    // végponton lassú.
    const celok = MEGYEK.filter((m) => m.orszag === cc).map((m) => m.q);
    megyeSorok.push(
      ...(await lekérdezHalmaz({
        nev: `megye-${cc}`,
        celok,
        osszegyujt: (darab) => KERDES(darab, ORSZAG_P17[cc], ALT_NYELV[cc]),
      })),
    );
  }

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

  console.log("C. Minden magyar nevű dolog a községek alatt");
  const kozsegSorok = [];
  const kozsegCelok = new Map(); // orszag -> község-Q-k
  for (const q of kozsegek.keys()) {
    const cc = megyeOrszag.get(kozsegek.get(q).cel);
    if (!kozsegCelok.has(cc)) kozsegCelok.set(cc, []);
    kozsegCelok.get(cc).push(q);
  }
  for (const [cc, celok] of kozsegCelok) {
    kozsegSorok.push(
      ...(await lekérdezHalmaz({
        nev: `kozseg-${cc}`,
        celok,
        osszegyujt: (darab) => KERDES(darab, ORSZAG_P17[cc], ALT_NYELV[cc]),
      })),
    );
  }

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
  const javitasokHu = JSON.parse(await readFile(JAVITASOK_HU, "utf8"));
  const nincsMagyarNev = new Set(
    Object.keys(JSON.parse(await readFile(NINCS_MAGYAR_NEV, "utf8"))).filter((k) => !k.startsWith("_")),
  );

  // Egy helységnek sokféle P31-je lehet, és a nevét is többször kaptuk meg.
  // Egy-egy sort tartunk meg helységenként, de a német néves sort előnyben
  // részesítjük: ugyanannak a helynek lehet olyan sora is, ahol ?de üres.
  // A román név 3.0.0 óta lehet üres is: Magyarországon és helyenként
  // Kárpátalján/Vajdaságban a Wikidata-n nincs román címke (pl. Szőreg) —
  // a kötelező `FILTER` kitörölné a falut a keresőből, ezért `OPTIONAL`.
  // Ugyanígy a magyar név is `OPTIONAL`: ahol nincs, a tartaléknyelv
  // (`uk`/`sr`) vagy a román adja a megjelenő nevet (lásd `huPotolt`).
  const nevek = new Map();
  for (const s of [...megyeSorok, ...kozsegSorok]) {
    const q = qid(s.hely.value);
    const eddig = nevek.get(q);
    if (!eddig || (!eddig.de && s.de) || (eddig.hu == null && s.hu)) {
      nevek.set(q, {
        hu: s.hu?.value ?? null,
        alt: s.alt?.value ?? null,
        ro: s.ro?.value ?? null,
        de: s.de?.value,
      });
    }
  }

  const helyek = [];
  let kiszurt = 0;
  let nincsMegye = 0;
  let nevNelkul = 0;
  let arvaSzulo = 0;
  let duplikalt = 0;
  let agglomeracio = 0;
  const kihagyottAglomeraciok = [];
  // A hamis német nevek nem kiesnek a listából (a helység valós), csak a
  // német nevük lesz üres. Ezért Map kell, nem számláló: később, a duplikátumok
  // kiszűrése UTÁN szűrjük, hogy csak azok maradjanak benne, akiknek a
  // sora tényleg az adatfájlba került.
  const hamisNemet = new Map();
  const perjelNemet = new Map();
  const altNemet = new Map();

  for (const [q, adat] of [...kozsegek, ...falvak]) {
    // Egy helységnek sok osztálya lehet: Temesvár egyszerre "nagyváros",
    // "egyetemváros" (Q1187811) és "urbánus terület" (Q702492) is a
    // Wikidata-n — és a régi szabály ("bármelyik nem-önálló osztály kizár")
    // emiatt Aradot, Temesvárt és Resicabányát is kitörölte. A döntés most
    // fordított: ha BÁRMELYIK osztálya lakott helyet jelent, az helység —
    // KIVÉVE a három sosem-önálló osztályt. A városnegyed (Q123705), a
    // negyed (Q2983893) és az óváros (Q676050) ugyanis sosem önálló
    // helység, még ha a Wikidata mellé falu-osztályt is ír ("Galac",
    // "Ótorda", "Várdotfalva", "Brassópojána"): azok városrészek, nem
    // bejárható falvak. A többi mellékcímke (egyetemváros, urbánus
    // terület, kolostor, castrum) csak akkor dönt, ha nincs mellette
    // lakott-hely osztály — a `telepules()` azokra eleve hamisat ad.
    // Az agglomerációkat ("Kolozsvár metropolisztérség") ez átengedi, de
    // azokat a NÉV alapján szűrjük (`nemHelyseg`), és az ellenőrző is
    // ugyanazt nézi a kész adaton.
    const veto = [...adat.osztalyok].some((o) => VETO_OSZTALY.includes(o));
    // A `Q21672098` ("village of Ukraine") ukrán falvakat jelöl — hiába
    // hangzik közigazgatásnak a neve, a P279-ágon lakott hely, és a
    // Kárpátalja A-szinten talált 506 ilyen eleme kivétel nélkül falu
    // (Akli, Beregújfalu, Bilke…). Az igazi kistérségek (`Q104841013`,
    // "hromada" — pl. "Ungvár község") nem a lakhely-ágon vannak, tehát
    // maguktól kiesnek; ha egyszer egy kistérség `Q21672098`-címkét kapna,
    // a sor nevéből látszana (…község).
    const lakottHely = !veto && [...adat.osztalyok].some(telepules);
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
    // Ha a szülőnek semmilyen neve nincs a Wikidata-n (pl. Huszt elavult
    // "városi tanácsa", Q12168039 — címke nélküli adminisztratív maradvány),
    // a kapcsot is eldobjuk: névtelen szülőt nem mutatunk, és a hely
    // önállóként szerepel, mint a megyeszékhelyek. Számláljuk, hogy a
    // szűkülés látszódjon, ha a Wikidata címkét kap.
    const szuloQ = kozsegek.has(q) ? null : celQid;
    const szuloNevek = szuloQ ? nevek.get(szuloQ) : null;
    const szuloNev = szuloNevek ? (szuloNevek.hu ?? szuloNevek.alt ?? szuloNevek.ro ?? null) : null;
    if (szuloQ && !szuloNev) arvaSzulo++;
    const s = nevek.get(q);
    // A megjelenő név: magyar, ha van; ha nincs, a tartaléknyelv (`uk`/`sr`)
    // vagy a román. A pótolt nevű sor automatikusan jelölt (`huPotolt`):
    // az nem kézi mérés, hanem bizonyos tudás — nincs `hu` címke, és a
    // "javítása" linkkel pótolható a Wikidata-n.
    const nev = s.hu ?? s.alt ?? s.ro ?? null;
    if (!nev) {
      nevNelkul++;
      continue;
    }
    // A magyar név: a Wikidata adja, kivéve a javitasokHu.json-t, ami a
    // kézzel megjavított magyar neveket tartja (a magyar Wikipedia
    // infoboxa és a KIA által is alátámasztva). Ez a magyar nyelv
    // párja a német javitasok.json-nak.
    const huJav = javitasokHu[q];
    const hu = typeof huJav === "string" ? huJav : nev;
    const huPotolt = huJav === undefined && !s.hu;
    const ro = s.ro;

    // A magyar címke a községnél a hivatalos nevet adja, "község" szóval
    // együtt ("Ajton község"), a faluét meg az egyértelmű "Ajton"-t. Ezt
    // NEM levágjuk: sok községnek pont az egyetlen faluja azonos nevű, és
    // levágás után 556 duplikált sor keletkezett.
    const de = nemetNev(s.de, ro, javitasok, undefined, s.alt);
    // Pontosan azokat számoljuk, amit KIZÁRÓLAG a 4. (ékezet-) szabály vett
    // ki: a szabály nélkül (de a tartaléknyelvvel) megmaradnának. (A nyers
    // alakra nézni nem elég: a 3. szabály áldozatainak felében is van román
    // ékezet, hiszen a román nevet másolták — az 655 sor lenne, nem 4.)
    if (s.de && !de && nemetNev(s.de, ro, javitasok, { ekezet: false }, s.alt)) {
      hamisNemet.set(q, { q, hu, ro, de: s.de });
    }
    //
    // Ugyanígy az 5. (perjel-) szabály áldozatait: a nyers név perjelt
    // vagy zárójelet hordoz, és a két új szabály nélkül megmaradna (a 3.
    // betűrendi áldozatait nem soroljuk ide — azokat nem a perjel
    // miatt hagytuk ki).
    if (
      s.de && !de && /[/()]/.test(s.de) &&
      nemetNev(s.de, ro, javitasok, { ekezet: false, perjel: false }, s.alt)
    ) {
      perjelNemet.set(q, { q, hu, ro, de: s.de });
    }
    // Ugyanígy a 6. szabály áldozatait: a német név az ukrán/szerb név
    // átírása. A próba a másik két új szabály nélkül fut, tartaléknyelv
    // nélkül és tartaléknyelvvel: csak az számít ide, amit a 6. dönt el
    // (a másik szabályok áldozatait azok listázzák).
    if (
      s.de && !de && s.alt &&
      nemetNev(s.de, ro, javitasok, { ekezet: false, perjel: false }, null) !== null &&
      nemetNev(s.de, ro, javitasok, { ekezet: false, perjel: false }, s.alt) === null
    ) {
      altNemet.set(q, { q, hu, ro, de: s.de });
    }

    helyek.push({
      q,
      hu,
      ro,
      de,
      // Az ukrán/szerb címke, ha van: a 6. németnév-szabály ellenőrzi
      // ellene a `de`-t, és a kereső is indexeli (ukránul is lehet
      // keresni). A pótolt nevű sorokban ugyanaz, mint a `hu`.
      alt: s.alt ?? null,
      megye: megye.kod,
      orszag: megye.orszag,
      kozseg: szuloNev ? szuloQ : null,
      kozsegNev: szuloNev,
      // Igaz, ha a fenti magyar név nem létezik, és a román áll helyette.
      // Ekkor a magyar mező TARTALMA nem változik, csak a származása —
      // ezért külön mező, és nem a `hu` lesz üres: a keresőnek a
      // használható (román) nevet kell mutatnia, csak megjelölve.
      //
      // A javitasokHu.json ellentmondás esetén győz: ha van kézzel
      // javított magyar név, akkor van magyar neve, tehát nincs jelölés.
      huNincsNeve: huPotolt || (huJav === undefined && nincsMagyarNev.has(q)),
      huPotolt,
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

  // Ugyanez a két néma hiba a magyar oldalon: a javitasokHu.json és a
  // nincsMagyarNev.json kulcsa sem hiba, ha nem talál helyet, csak csendben
  // nem csinál semmit. Ez a projekt legcsendőbb hibája éppen az volt, ezért
  // mindkettőről szólunk, ha nem ér valamire.
  const huKulcsok = Object.keys(javitasokHu).filter((k) => !k.startsWith("_"));
  const huHibas = huKulcsok.filter((k) => !helyek.some((h) => h.q === k));
  const huHatott = huKulcsok.filter((k) => helyek.some((h) => h.q === k && h.hu === javitasokHu[k]));
  if (huHibas.length) {
    console.log(
      `  figyelem: a javitasokHu.json ${huHibas.length} Q-száma nincs az adatban: ${huHibas.join(", ")}`,
    );
  }
  console.log(`  ${huHatott.length}/${huKulcsok.length} kézi magyar név érvényesült`);

  const jelzettHibas = [...nincsMagyarNev].filter((k) => !helyek.some((h) => h.q === k));
  const jelzett = helyek.filter((h) => h.huNincsNeve);
  if (jelzettHibas.length) {
    console.log(
      `  figyelem: a nincsMagyarNev.json ${jelzettHibas.length} Q-száma nincs az adatban: ${jelzettHibas.join(", ")}`,
    );
  }
  console.log(`  ${jelzett.length} helynek jeleztük, hogy nincs magyar neve`);

  if (agglomeracio) {
    // Kilistázzuk, mert a szűrés a névre épül, és ha a Wikidata átírja a
    // címet, a szabály csendben átenged valamit. Innen látszik, hogy a
    // kizárás még mindig ugyanazokat érinti-e.
    console.log(`  ${agglomeracio} agglomerációt kihagytunk (nem helység, csak egy város és a környéke):`);
    for (const n of kihagyottAglomeraciok) console.log(`    ${n.q} ${n.hu}`);
  }
  if (nincsMegye) console.warn(`  figyelem: ${nincsMegye} helynél nem sikerült a megyét, kihagyva`);
  if (nevNelkul) console.warn(`  figyelem: ${nevNelkul} helynek semmilyen megjeleníthető neve nincs (se hu, se tartalék, se ro), kihagyva`);
  if (arvaSzulo) console.log(`  ${arvaSzulo} hely szülőjének nincs neve a Wikidata-n, önállóként szerepel (pl. Huszt)`);

  // Ugyanaz a román név kétszer, ugyanabban a megyében. Ez LÉTEBNEK tűnik
  // duplikátumnak, de NEM mind az: két különböző falunak lehet ugyanaz a
  // román neve (Alba megyében több "Botești" és "Florești" község alatt is
  // van). A puszta nevük alapján szűrni ezért 93 valódi helyet törölt ki.
  //
  // Ez csak akkor duplikátum, ha azonos a hely: vagy ugyanaz a Q-szám (a
  // Kolozsvár Q100188 és Q16898189 alatt is megvan), vagy az egyik elem a
  // másik községe ("Ajton község" és az "Ajton" falu), vagy mindkettő
  // közvetlenül a megye alatt van (a megyeszékhely és a duplikált bejegyzése).
  //
  // Két megyében lehet ugyanaz a név, és az NEM duplikátum: Dăbâca/Doboka
  // egyszer Kolozsvár, egyszer Hunyad megyében valódi két falu.
  //
  // A kulcs a MAGYAR név: az sosem üres (a pótolt nevű sorokban is van
  // megjelenő név), a román viszont határon túl gyakran hiányzik — és a
  // román szerinti kulcsolás a duplikátum-párokat is széttörné (Komlós:
  // az egyik példány román neve `Hmeliv`, a másiké nincs).
  const nevre = new Map(); // kulcs -> az ilyen nevű sorok
  for (const h of helyek) {
    const kulcs = `${h.megye}|${h.hu.toLowerCase()}`;
    if (!nevre.has(kulcs)) nevre.set(kulcs, []);
    nevre.get(kulcs).push(h);
  }
  // A duplikátum-szűrés a közös `szurDuplikat()` — ugyanaz a leképezés,
  // mint amit az `ellenoriz.mjs` a kész adaton futtat. A csoportosítás
  // magyar ÉS román néven unióz (lásd a `dedupCsoportok()` kommentjét),
  // a döntés pedig bent lévőhöz mér, nem "van-e kisebb bárhol".
  const { marad: megmaradt, kiesett: kihullott, tobbValodi } = szurDuplikat(helyek);
  duplikalt += kihullott.length;
  if (duplikalt) {
    console.log(`  ${duplikalt} duplikált Wikidata-elemet elhagytunk (ugyanarról a helyről van két elem)`);
  }
  // Ha egy néven több valódi hely maradt, kimondjuk: a szűrés ezeket
  // NEM érintette, és ha a szabály valaha szűkülne, ez a lista szól.
  if (tobbValodi.length) {
    console.log(`  ${tobbValodi.length} néven több valódi hely van, mind megtartva:`);
    for (const bent of tobbValodi) {
      const kulcs = `${bent[0].megye}|${[...new Set(bent.map((h) => h.hu))].join(" + ")}`;
      console.log(`    ${kulcs}: ${bent.map((h) => `${h.q} ${h.hu} (${h.kozseg ? nevek.get(h.kozseg)?.hu : "nincs községe"})`).join("  |  ")}`);
    }
  }
  helyek.length = 0;
  helyek.push(...megmaradt);

  // A fentebb kilistázott "több valós hely" esetek következménye: a sorban
  // most két egyforma név áll ("Butești" a Mogos és az Arada község alatt
  // is), és a megye nem elég, hogy megkülönböztesse őket. Ezért a
  // magyar név mellé odakerül a szülő község — "Butești (Mogos község)".
  //
  // Ez NEM új adat: a `kozsegNev` a sor végén már ott volt, csak a szülő
  // községre nem lehet ránézni. A szabály a `szabalyok.mjs`-ben van,
  // mert az `ellenoriz.mjs`-nek a kész adaton ugyanezt kell ellenőriznie:
  // ha a kettő elcsúszik, a toldalék csendben eltűnik.
  const utalo = utalok(helyek);
  for (const h of helyek) h.utalo = utalo.get(h.q) ?? null;
  const utaloNev = new Map(); // megye|hu -> az ilyen sorok
  for (const h of helyek) {
    if (!h.utalo) continue;
    const kulcs = `${h.megye}|${h.hu}`;
    if (!utaloNev.has(kulcs)) utaloNev.set(kulcs, []);
    utaloNev.get(kulcs).push(h);
  }
  if (utalo.size) {
    console.log(
      `  ${utaloNev.size} néven ütközik a megyén belül (ez a szándék), mind toldalékot kapott:`,
    );
    for (const [kulcs, sorok] of utaloNev) {
      console.log(`    ${kulcs}: ${sorok.map((h) => `${h.q} (${h.utalo})`).join("  |  ")}`);
    }
  }

  helyek.sort(
    (a, b) =>
      megyeSorrend.get(a.megye) - megyeSorrend.get(b.megye) ||
      a.hu.localeCompare(b.hu, "hu"),
  );

  // A kereső statikus marad: a böngésző nem geokódol, hanem a letöltéskor
  // kapott koordinátát és pontos Wikipedia-sitelinket olvassa a JSON-ból.
  // A külön Action API gyorsítótára miatt ez a lépés csak az új Q-számokat
  // kéri le, és nem terheli tovább a fenti SPARQL-végpontot.
  await gazdagitTerkepAdattal(helyek);

  // A `ZK` kódon hét bejegyzés osztozik (oblaszty + 6 járás): a kijelzésben
  // egy megye, ezért kóddal szűrve adjuk ki (első előfordulás nyer).
  // A `fajta` a sorvégi felirat szava: a megye "megye", a bánsági körzet
  // "körzet", Kárpátalja puszta név (az régió, nem megye). Ami nincs
  // megadva, az "megye" — a romániai sorok szövege így nem változik.
  const FAJTA = { ZK: null, EBN: "körzet", KBN: "körzet", DBN: "körzet" };
  const megyekKi = [...new Map(MEGYEK.map((m) => [m.kod, m])).values()].map((m) => (
    m.kod in FAJTA ? { ...m, fajta: FAJTA[m.kod] } : m
  ));
  const kimenet = {
    verzio: VERZIO,
    generatas: new Date().toISOString(),
    forras: "Wikidata (CC0) + javitasok.json + javitasokHu.json + nincsMagyarNev.json",
    telepulesOsztaly: [...telepulesOsztaly].sort(),
    megyek: megyekKi,
    helyek,
  };
  await writeFile(KIMENET, JSON.stringify(kimenet, null, 1));
  await writeFile(KIMENET_LEPEG, JSON.stringify(kimenet));

  // Az ékezet-szabály által kiszűrt hamis német neveket kilistázzuk. A
  // "Kész: N német nevet kapott" szám önmagában nem árulja el, hogy miért
  // kevesebb, mint korábban, és a szűlés névre épül, tehát egy
  // Wikidata-átírás után csendben változhatna.
  //
  // A duplikátummal kiszűrtakkal nem számolunk: ha egy sor a
  // duplikátum-szűrés miatt nem kerül az adatfájlba, akkor a hamis német
  // neve sem jelenik meg sehol, tehát nincs mit javítani rajta.
  const bentHamisNemet = [...hamisNemet.values()].filter((x) =>
    helyek.some((h) => h.q === x.q),
  );
  if (bentHamisNemet.length) {
    console.log(
      `  ${bentHamisNemet.length} német nevet hagytunk ki, mert román ékezet volt benne:`,
    );
    for (const x of bentHamisNemet) console.log(`    ${x.q} ${x.hu} / ${x.ro} / ${x.de}`);
  }
  // Ugyanaz az ukrán/szerb átírásokra ("Strymba" az ukrán "Стримба"
  // helyett): egyik rész sem német, tehát nincs mit megmenteni belőle.
  const bentAltNemet = [...altNemet.values()].filter((x) =>
    helyek.some((h) => h.q === x.q),
  );
  if (bentAltNemet.length) {
    console.log(
      `  ${bentAltNemet.length} német nevet hagytunk ki, mert az ukrán/szerb név átírása:`,
    );
    for (const x of bentAltNemet) console.log(`    ${x.q} ${x.hu} / ${x.ro} / ${x.de}`);
  }
  // Ugyanaz a perjeles "német" nevekre ("Avram Iancu / Keményfok"): a
  // Wikidata a román és a magyar nevet írta a német mezőbe. Egyik rész sem
  // német, tehát nincs mit megmenteni belőle.
  const bentPerjelNemet = [...perjelNemet.values()].filter((x) =>
    helyek.some((h) => h.q === x.q),
  );
  if (bentPerjelNemet.length) {
    console.log(
      `  ${bentPerjelNemet.length} német nevet hagytunk ki, mert két nevet fűz össze:`,
    );
    for (const x of bentPerjelNemet) console.log(`    ${x.q} ${x.hu} / ${x.ro} / ${x.de}`);
  }

  console.log(`\nKész: ${helyek.length} helység, ${helyek.filter((h) => h.de).length} német nevet kapott. (verzió ${VERZIO})`);
  for (const m of megyekKi) {
    const db = helyek.filter((h) => h.megye === m.kod);
    const orszag = [...new Set(db.map((h) => h.orszag))].join(",");
    console.log(`  ${m.kod} ${m.hu} (${orszag}): ${db.length}`);
  }
  console.log(`Ide írtam: ${KIMENET.pathname}`);
}

/**
 * A német név, öt szabály szerint:
 *  1. ha szerepel a javitasok.json-ban, az az igazi (kézzel ellenőrzött),
 *  2. zárójeles magyarázatot ("Luna (Cluj)") levágjuk, mert az nem név,
 *  3. ha a Wikidata oda szinte a román nevet másolta, nincs német nevünk,
 *  4. a "német" név, amiben román ékezet van (ă â î ș ț), szintén nem német.
 *  5. ami két nevet fűz össze perjellel ("Avram Iancu / Keményfok"), az sem:
 *     a Wikidata a román és a magyar nevet írta a német mezőbe.
 *  6. ami a tartaléknyelv (ukrán/szerb) átírásával betűre egyezik, az sem:
 *     az ukrán/szerb név latin másolata ("Strymba" == ukrán "Стримба") —
 *     ugyanaz a család, mint a román másolatok, csak cirillből. És ami
 *     cirill betűt tartalmaz, az biztosan nem német (mint a 4. szabály,
 *     csak másik ábécé).
 *
 * A 3. pont trükkös: a Wikidata gyakran a román névből csinál "német" nevet,
 * csak a végződésen ront egy kicsit ("Hodaie" -> "Hodaei"). Ezért nem
 * szövegesen hasonlítunk, hanem a betűk sorrendjétől függetlenül: ha ugyan
 * azok a betűk, ugyanaz a szó.
 *
 * A 4. pont azt fogja meg, amit a 3. átenged. A betűrendi egyezés nem
 * elég, mert a Wikidata olykor egyet elront a román névben
 * ("Idicel-Pădure" -> "Idecel-Pădure", "Glăjărie" -> "Glăjerie"), és ilyenkor
 * már nem ugyanazok a betűk. A német ábécében viszont nincs ă/â/î/ș/ț,
 * tehát ez a jel biztos: öt helységnél a román nevet mutatta "de" jelöléssel.
 */
function nemetNev(deWikidata, ro, javitasok, { ekezet = true, perjel = true } = {}, alt = null) {
  if (!deWikidata && !(ro && ro in javitasok)) return null;
  const tisztitott = deWikidata
    ? deWikidata.replace(/\s*\([^)]*\)\s*$/u, "").trim()
    : null;
  // A kézi javítás elsőbbséget élvez, de az se lehet, ami a román nevét
  // ismétli: az nem német név. Román név nélkül (határon túl gyakori) a
  // 3. szabály nem fut — nincs mihez hasonlítani.
  const jelolt = ro && ro in javitasok ? javitasok[ro] : tisztitott;
  if (ro && ugyanazSzo(jelolt, ro)) return null;
  // A német ábécében nincs ă, â, î, ș vagy ț. Ha ezek egyike szerepel a
  // "német" névben, akkor az biztosan nem német: a Wikidata a román nevet
  // másolta oda, esetleg két nevet fűzve össze ("Cornești / Sövényfalva").
  //
  // Ez azért döntő, mert a magyar ő/ű KÖZÖS ékezet, az nem számít — a
  // "Sövényfalva" magyarul valóban lehetne német helységnév. De a román
  // betűk kizárólag a román nyelvben léteznek.
  //
  // Fontos: a hiányzó német név tisztább, mint egy hamis. A README ezt
  // írja a javitasok.json-ról is: "ha kétséges, ne írj be semmit".
  if (ekezet && deRomanEkezet(jelolt)) return null;
  // Két név perjellel összefűzve ("Avram Iancu / Keményfok",
  // "Dumbrava / Körösdombró") vagy zárójeles maradék a végin túl: a
  // Wikidata a román és a magyar nevet írta a német mezőbe. A 3.
  // (betűrendi) és a 4. (ékezet-) szabály ezt nem fogja meg, mert nincs
  // benne román ékezet — a 9 megyés adatban épp ezért maradt láthatatlan,
  // csak a Partium+Bánság hozta elő.
  if (perjel && /[/()]/.test(jelolt)) return null;
  // Az ukrán/szerb név latin másolata a német mezőben ("Strymba" az ukrán
  // "Стримба" helyett): betűrendi hasonlítás az átírt alakon. A valódi
  // cipszer német nevek (`Schenborn`, `Solotwyno`) nem betűazonosak az
  // ukrán alakkal, tehát megmaradnak. A cirill betűs "német" név pedig
  // eleve nem német — a német ábécében cirill betű sincs.
  if (alt && ugyanazSzo(jelolt, cirillAtir(alt))) return null;
  if (jelolt && /[Ѐ-џ]/.test(jelolt)) return null;
  return jelolt;
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
