// A KIA helységnévtár kiértékelése: melyik helynek van magyar neve, amit a
// Wikidata-on nem találunk?
//
// Futtasd:  node kia.mjs            (a szöveget a .cache/-be teszi újra)
//
// MIÉRT KELL: a letöltő a Wikidata-tól kéri a magyar nevet, és az ott sok
// helyen a román nevét tartalmazza. A magyar lakosság 1910 körül olvadt fel
// ezekben a falvakban, és a hivatalos helységnévtár őrzi a nevüket, amit a
// Wikidata nem. Ez a mérőszám mondja meg, hol lehet magyar nevünk.
//
// A `letolt.mjs`-nek NEM kell ez: az a forrásból nem tud magyar nevet
// kérni, hiszen az nincs is ott. Ez kutatási eszköz, akárcsak a `kutatas.md`.
//
// KIMENET: `kiaMagyarNev.json` — Q-szám → a KIA magyar neve, CSAK ahol
// eltér a romántól. Ez verziózott, mert az `ellenoriz.mjs` ellenőrzi:
//   - a `javitasokHu.json` minden bejegyzésének itt kell lennie (két forrás),
//   - a `nincsMagyarNev.json` egyik Q-száma sem lehet itt (mert akkor
//     lenne magyar neve, és a jelölés hamis lenne).
//
// A két buktató, amibe az első mérés belement — mindkettő a "néma hiba"
// osztályba tartozik, tehát nem dobott kivételt, csak rossz számot adott:
//   1. A PDF-ből jövő szöveg `ş`/`ţ` alakot használ, nem `ș`/`ț`-t. Enélkül
//      a nevünkre illesztés NEM talál semmit, és azt hittük, mindenkinek
//      nincs magyar neve. Ez a mérés azt mérte, hogy sikerült-e a keresés.
//   2. A magyar nevét követő pont után nem whitespace, hanem egy PDF-jel
//      ("•") áll, tehát a szokásos `\.\s*Név:` nem illeszkedik.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const fut = promisify(execFile);

const UA = "mivelkezdjem.hu/1.0 (helynevekereso; kia.mjs)";
const PDF_URL = "https://kia.hu/kiakonyvtar/konyvtar/erdely/erd2002/hnevta02.pdf";
const CACHE = new URL("./.cache/", import.meta.url);
const PDF = new URL("./kia.pdf", CACHE);
const SZOVEG = new URL("./kia.txt", CACHE);
const KIMENET = new URL("./kiaMagyarNev.json", import.meta.url);

/** A magyar KIA román ékezetet nem használ, de a karakter más bájtsor. */
function norm(s) {
  return s
    .normalize("NFC")
    .replace(/ş/g, "ș")
    .replace(/Ş/g, "Ș")
    .replace(/ţ/g, "ț")
    .replace(/Ţ/g, "Ț");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A magyar betűk, a románokkal együtt. A ș/ţ NEM lehet el, mert a
// román KÖZSÉG- és helységnevekben állandóan benne van — és amikor
// kimaradt, a mérés egyetlen községet sem talált, tehát "nincs magyar
// nevük" alakban jelent meg a hiba. Ez a harmadik csendes hiba ebben a
// mérésben (a másik kettő: a ş/ţ alak, és a pont utáni PDF-jel).
const BETU = "A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüűșțŞȚ";

/** Előállítja a .cache/kia.txt-t a .cache/kia.pdf-ből. */
async function szoveg() {
  if (!existsSync(PDF)) {
    console.log(`Letöltöm: ${PDF_URL}`);
    const valasz = await fetch(PDF_URL, { headers: { "User-Agent": UA } });
    if (!valasz.ok) throw new Error(`HTTP ${valasz.status} a KIA PDF-re`);
    await writeFile(PDF, Buffer.from(await valasz.arrayBuffer()));
  }
  if (!existsSync(SZOVEG)) {
    console.log("Alakítom szöveggé (pdftotext -layout)...");
    // A -layout kell: a szöveg két hasábos, és a bejegyzés fele a
    // szomszédos oszlopban van. Enélkül a sorok összekeverednek.
    try {
      await fut("pdftotext", ["-layout", PDF.pathname, SZOVEG.pathname]);
    } catch {
      throw new Error("Nincs pdftotext (a poppler-utils csomagja). Ez kell hozzá.");
    }
  }
  return norm(await readFile(SZOVEG, "utf8"));
}

/**
 * A bejegyzések: "RománNév (Község, AB) MagyarNév. Név: ..." — a magyar név
 * a zárójel után jön, és ponttal záródik.
 *
 * A KÖZSÉGRE IS SZŰKÍTENI KELL. A puszta falu-név több helyet is
 * megjelöl: a "Runc" Alba megyében négy helységet, a "Lunca"-t még
 * többet, és ezeknek más-más magyar nevük van. Ha nem szűkítünk, a
 * találat véletlenül rossz faluban talál magyar nevet — vagyis a mérés
 * olyat állít, amit nem mért.
 */
function bejegyez(kia, ro, kozsegRo, megye) {
  const re = new RegExp(
    `\\b${esc(ro)}\\s*\\(([^)]*?,\\s*${megye}[^)]*)\\)\\s*`,
    "gi",
  );
  const talalat = [];
  for (const m of kia.matchAll(re)) {
    const kozseg = m[1]
      .split(",")[0]
      .trim()
      .replace(/^(or|oraș|com|loc|sat|mun)\.?\s*/i, "")
      .trim();
    if (norm(kozseg).toLowerCase() !== norm(kozsegRo).toLowerCase()) continue;
    const utana = kia
      .slice(m.index + m[0].length, m.index + m[0].length + 140)
      .replace(/\s+/g, " ")
      .trim();
    // Négy karakter a pont és a kulcsszó között, nem kettő: a pont, a PDF
    // jele, a szóköz, és még egy. Ezért [^betű]{0,3} kell \s* helyett.
    const g = new RegExp(
      `^([${BETU}][${BETU} ]{0,40})\\.[^${BETU}]{0,3}(Név:|Névvált|Közigazg|Nemz|Nyelv)`,
    ).exec(utana);
    talalat.push({ kozseg, magyar: g ? g[1].trim() : null, utana: utana.slice(0, 60) });
  }
  return talalat;
}

/** Ugyanaz a szó, csak más betűkkel — a keresés leegyszerűsítéséhez igazodik. */
function ugyanazANev(a, b) {
  const egyszer = (s) =>
    norm(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[ăâ]/g, "a")
      .replace(/î/g, "i")
      .replace(/[șş]/g, "s")
      .replace(/[țţ]/g, "t")
      .replace(/[^a-z0-9]+/g, "");
  const cikk = (s) =>
    s.replace(/([aeiou])l(?=[bcdfghjklmnpqrstvwxz])/g, "$1").replace(/l$/, "");
  return cikk(egyszer(a)) === cikk(egyszer(b));
}

/**
 * A KIA községei önmagukban megadják a magyar → román nevet.
 *
 * A bejegyzés alakja: "Bucium (Bucium, AB, com.) Bucsony." — vagyis a román
 * nevét magyarra fordítva adja. Ebből nem kell a Wikidata-tól kérni a
 * községneveket, és nem is kell rá: a mérésnek a KIA-n belül kell zárulnia,
 * mert akkor újrafuttatható hálózat nélkül is.
 *
 * A `^` NEM elég a sor elejére kötni: a szöveg KÉT HASÁBOS (ez a negyedik
 * csendes hiba ebben a mérésben — a szűrés a második hasáb bejegyzéseit
 * kihagyta, és a mérés azt mondta, hogy azoknak nincs magyar nevük), tehát
 * a bejegyzés nagy szóköz-run után is indulhat.
 */
function kozsegTvor(kia) {
  const map = new Map();
  const re = new RegExp(
    `(?:^\\s{2,}|[ ]{15,})([${BETU}][${BETU} .-]{1,30}?)\\s*\\([^)]*?,\\s*([A-Z]{2}),\\s*` +
      `(?:com|oraş|oraș|mun|top)\\s*\\.?\\)\\s*([^.]{1,40}?)\\s*\\.`,
    "gm",
  );
  for (const m of kia.matchAll(re)) {
    const magyar = m[3].trim().replace(/\s+(község|város)$/u, "");
    if (magyar) map.set(magyar, { ro: m[1].trim(), megye: m[2] });
  }
  return map;
}

/**
 * A Wikidata API hibát 200-as státusszal is ad: a maxlag esetében a
 * válasz `{"error":{"code":"maxlag",...}}` — JSON, csak `entities` nélkül. A
 * parse-ot körülvevő try önmagában nem elég, az `Object.entries(undefined)`
 * dob, és nem tudjuk megállapítani, hogy nem hiba, hanem türelem kell.
 *
 * NEM KELL `&maxlag=5` A PARAMÉTER. A maxlag a QUERY SERVICE (wdqs)
 * terhelését nézi, nem az API-ét, és a wdqs 2026-10-09-én több száz
 * másodperces várólistával állt — miközben a `wbgetentities` egyáltalán nem
 * használja a query service-t. A paraméterrel a `kia.mjs` 25 percig nem
 * tudott végigfutni; nélkül ugyanaz a kérés 0,3 másodperc. A mérés egyetlen
 * API-hívása nem a türelmet igényelte, hanem egy felesleges korlátot.
 *
 * Ez negyedre csúszott bele a mérésbe a látvány kedvéért: ha ez nincs
 * megírva, a mérés csendben megszakad, és a részleges eredmény úgy látszik,
 * mintha kész lenne.
 */
async function api(url, { valtozas = 12 } = {}) {
  for (let proba = 0; ; proba++) {
    const valasz = await fetch(url, { headers: { "User-Agent": UA } });
    const szoveg = await valasz.text();
    if (valasz.ok) {
      try {
        const j = JSON.parse(szoveg);
        if (!j.error) return j;
        if (j.error.code !== "maxlag" && j.error.code !== "ratelimited") {
          throw new Error(`A Wikidata API hibája: ${j.error.code} — ${j.error.info}`);
        }
        // A szerver azt mondja, mennyit kell várni. Hallgatunk rá — de nem a
        // végtelenig: 12 próbálkozás után feladjuk, mert akkor ez már nem
        // mérés, csak várakozás.
        if (proba >= valtozas) {
          throw new Error(
            "A Wikidata API 2 percnél tovább lassú (maxlag). Próbáld újra később; " +
              "ami a cache-ből már megvan, azt nem kérdezzük újra.",
          );
        }
        const varakozas = Math.min(30, Math.max(5, j.error.lag ?? 10));
        console.log(`  (maxlag: ${Math.round(varakozas)} mp múlva újra)`);
        await new Promise((r) => setTimeout(r, varakozas * 1000));
        continue;
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        // nem JSON (HTML), ezért esünk tovább az újrapróbálkozásra
      }
    }
    if (proba >= valtozas) {
      throw new Error(`A Wikidata API nem adott használható választ: ${szoveg.slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, 5000 * (proba + 1)));
  }
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const kia = await szoveg();
  console.log(`A KIA szövege: ${kia.length} karakter`);

  // Kalibráció: mit jelent az üres magyar mező? Ha a KIA az azonos neveket
  // is kiírná, akkor az üres mező azt jelentené, hogy "nincs magyar nevük".
  // Ha viszont soha nem írja ki az azonosat, akkor az üres mező nem
  // bizonyít semmit — és a mérésünk értelmetlen.
  let azonos = 0;
  let elter = 0;
  let ures = 0;
  for (const m of kia.matchAll(
    /^\s{2,}([A-ZĂÂÎȘȚ][\wĂÂÎȘȚ .-]{1,30}?)\s*\(([^)]{1,40}?,\s*[A-Z]{2}[^)]*)\)\s*/gm,
  )) {
    const utana = kia
      .slice(m.index + m[0].length, m.index + m[0].length + 140)
      .replace(/\s+/g, " ")
      .trim();
    const g = new RegExp(
      `^([${BETU}][${BETU} ]{0,40})\\.[^${BETU}]{0,3}(Név:|Névvált|Közigazg|Nemz|Nyelv)`,
    ).exec(utana);
    if (!g) ures++;
    else if (ugyanazANev(g[1], m[1])) azonos++;
    else elter++;
  }
  console.log(
    `\nKalibráció (${ures + azonos + elter} bejegyzés): ` +
      `${azonos} magyar név egyezik a románnal, ${elter} eltér, ${ures} nincs megadva.`,
  );
  if (!azonos) {
    console.log(
      "  figyelem: a KIA SOHA nem írja ki az azonos nevet — tehát az üres\n" +
        "  magyar mező nem bizonyít semmit, és ezt a mérés nem szabad belső\n" +
        "  bizonyítéknak használni.",
    );
  }

  // A célhalmaz: akiknek a magyar neve a románnal egyezik. Őket érdemes
  // nézni, mert ha a KIA magyar neve nem a román, akkor a Wikidata hibás.
  const adat = JSON.parse(await readFile(new URL("./helyek.json", import.meta.url), "utf8"));
  const byQ = new Map(adat.helyek.map((h) => [h.q, h]));
  // A célhalmaz: akiknek a magyar neve a románnal egyezik — ÉS azok, akiket
  // a javitasokHu.json már kijavított. A második feltétel nem mellékes:
  // egy javított hely magyar neve már nem egyezik a románnal, tehát az
  // első szűrés kidobná, és pont azt nem mérnénk, amit éppen javítottunk.
  // Ez a körkörös szűrés el is eshet: a javítás alapja a KIA, a KIA-mérés
  // alapja a javítás.
  const javHu = JSON.parse(
    await readFile(new URL("./javitasokHu.json", import.meta.url), "utf8"),
  );
  const javQ = new Set(Object.keys(javHu).filter((k) => !k.startsWith("_")));
  const cel = adat.helyek.filter(
    (h) => ugyanazANev(h.hu, h.ro) || javQ.has(h.q),
  );
  console.log(`\nA helyek.json-ban ${cel.length} hely, ahol a magyar név a román (` +
    `ebből néhány csak írásmódban tér el — ez is érdekes).`);

  const kiaKozseg = kozsegTvor(kia);
  console.log(
    `A KIA-ból ${kiaKozseg.size} magyar községnév → román név párosítás olvasható ki` +
      " (két hasáb, a másodikat is számítva)",
  );

  // A község román nevét a `helyek.json` nem tartalmazza (csak a Q-számát és
  // a magyar nevét), ezért a Wikidata-tól kell. Gyorsítótárazva, mert a
  // mérés ellenőrzésre használatos, és nem szabad minden futáskor újra
  // leterhelni egy amúgy is lassú API-t.
  //
  // A KIA-ból kiolvasott párosítás a tartalék: ha az API nem válaszol,
  // azokat a községeket nem tudjuk — és ezt KIMONDJUK, nem úgy járunk el,
  // mintha minden községet ismernénk.
  const CACHE_KOZSEG = new URL("./kozseg-labels.json", CACHE);
  const kozsegNev = new Map(
    existsSync(CACHE_KOZSEG) ? JSON.parse(await readFile(CACHE_KOZSEG, "utf8")) : [],
  );
  const kell = [...new Set(cel.map((h) => h.kozseg).filter((q) => q && !kozsegNev.has(q)))];
  console.log(`${kozsegNev.size} község neve a cache-ből, ${kell.length} még hiányzik`);
  let apiHibas = null;
  if (kell.length) {
    try {
      for (let i = 0; i < kell.length; i += 25) {
        const resz = kell.slice(i, i + 25);
        const j = await api(
          "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels" +
            `&languages=ro%7Cen%7Cde&ids=${resz.join("%7C")}`,
        );
        for (const [id, e] of Object.entries(j.entities ?? {})) {
          kozsegNev.set(
            id,
            e.labels?.ro?.value ?? e.labels?.en?.value ?? e.labels?.de?.value ?? null,
          );
        }
        await writeFile(CACHE_KOZSEG, JSON.stringify([...kozsegNev], null, 1) + "\n");
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      apiHibas = e.message;
      console.log(`  figyelem: ${e.message}`);
    }
  }

  // A magyar községnév → Q-szám tábla, mert a KIA-tartalék magyar néven
  // keres, a Wikidata-forrás pedig Q-számon.
  const magyarKozseg = new Map(cel.map((h) => [h.q, h.kozsegNev]));
  const ajanlat = {};
  let bejegyezett = 0;
  let kozsegNincs = 0;
  const nincsKozseg = new Map();
  for (const h of cel) {
    const kozsegMagyar = (magyarKozseg.get(h.q) ?? "").replace(/\s+(község|város)$/u, "");
    const kr = (h.kozseg && kozsegNev.get(h.kozseg)) || kiaKozseg.get(kozsegMagyar)?.ro;
    if (!kr) {
      kozsegNincs++;
      const kulcs = kozsegMagyar || "(nincs szülő község)";
      nincsKozseg.set(kulcs, (nincsKozseg.get(kulcs) ?? 0) + 1);
      continue;
    }
    const b = bejegyez(kia, h.ro, kr, h.megye);
    if (!b.length) continue;
    bejegyezett++;
    const magyar = [...new Set(b.map((x) => x.magyar).filter(Boolean))].filter(
      (n) => !ugyanazANev(n, h.ro),
    );
    if (magyar.length) ajanlat[h.q] = { nev: magyar[0] };
  }

  console.log(
    `\nEbből ${bejegyezett} helynek van KIA-bejegyzése (községre szűkítve), ` +
      `${kozsegNincs} helynek nincs — ezek nem mérve vannak, nem mérve sincsenek.`,
  );
  if (nincsKozseg.size) {
    console.log("  A nem ismert községek (a legtöbb hely itt van):");
    const lista = [...nincsKozseg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [k, n] of lista) console.log(`    ${k}: ${n} hely`);
  }
  console.log(`A KIA magyar nevet ad, ami ELTÉR a romántól: ${Object.keys(ajanlat).length} hely`);
  for (const [q, v] of Object.entries(ajanlat)) {
    const h = byQ.get(q);
    console.log(`  ${q}  ${h.hu} → ${v.nev}   (${h.kozsegNev ?? "-"}, ${h.megye})`);
  }

  // A kézi döntések megőrzése újrafuttatáskor. A KIA-nevek frissülnek
  // (forrásváltozás, javított PDF), a döntés viszont a miénk: egy
  // kézzel elutasított bejegyzést a program nem szabad visszahozni.
  let regi = {};
  if (existsSync(KIMENET)) {
    const beolvasott = JSON.parse(await readFile(KIMENET, "utf8"));
    regi = Object.fromEntries(
      Object.entries(beolvasott).filter(([k, v]) => !k.startsWith("_") && v?.allapot),
    );
    if (Object.keys(regi).length) {
      console.log(
        `\n${Object.keys(regi).length} korábbi kézi döntést tartunk meg ` +
          "(allapot: " + [...new Set(Object.values(regi).map((x) => x.allapot))].join(", ") + ")",
      );
    }
  }
  const kimenet = { ...ajanlat };
  for (const [q, v] of Object.entries(kimenet)) {
    if (regi[q]) {
      kimenet[q] = { ...v, allapot: regi[q].allapot };
      if (regi[q].ok) kimenet[q].ok = regi[q].ok;
      if (regi[q].huWiki !== undefined) kimenet[q].huWiki = regi[q].huWiki;
    } else {
      kimenet[q] = { ...v, allapot: "merve" };
    }
  }

  await writeFile(
    KIMENET,
    JSON.stringify(
      {
        _comment: [
          "A KIA helységnévtárból mért magyar nevek, Q-szám szerint — csak ahol",
          "a magyar név ELTÉR a romántól. A `kia.mjs` írja a nevét, de a",
          "minősítését KÉZZEL kell megadni, és a program megőrzi újrafuttatáskor.",
          "",
          "Forrás: kia.hu/kiakonyvtar/konyvtar/erdely/erd2002/hnevta02.pdf",
          "VÉTELEN azok a bejegyzések, ahol a magyar nevét a KIA kiírja, és nem",
          "azonos a románnal. A KIA ritkán kiírja az azonosat is (a kalibráció",
          "a kia.mjs kimenetében), ezért a HIÁNY itt nem bizonyítja, hogy",
          "nincs magyar név — csak azt, hogy a KIA nem adja meg.",
          "",
          "AZ ALLAPOT:",
          '  \"merve\"    — a kia.mjs találta, de még senki nem döntött róla;',
          "               az ellenőrző EGYELŐRE nem zúg rá, de szól, ha",
          "               ilyen marad (két forrás kell, nem egy)",
          '  \"javítva\"  — két forrás mondja (KIA + magyar Wikipedia infobox),',
          "               bekerült a javitasokHu.json-ba",
          '  \"elutasítva\" — a KIA nem magyar nevet adott, hanem románt',
          "               (\"La padure\"), szaxont (\"Ungefug\", \"Rohrau\"), vagy",
          "               éppen leírást (\"Galbina községrész\"); az \"ok\" mező",
          "               mondja meg, melyik",
          "",
          "AZ ELLENŐRZŐ NÉZI: a javitasokHu.json minden kulcsa itt van \"javítva\"",
          "állapottal, a nincsMagyarNev.json egyik Q-száma sem lehet itt",
          "\"javítva\" állapottal (mert akkor volna magyar neve, és a jelölés hamis",
          "lenne), és nem maradhat feldolgozatlan \"merve\" bejegyzés — mert az",
          "éppen a kétforrás-szabály felülete.",
          "",
          "A MÉRÉS HATÓKÖRE NEM A TELJES ADAT: ha a község románnevét nem",
          "sikerült megkapni (a Wikidata API lassú volt), a hely kimarad, és",
          "a kia.mjs ezt kiírja — nem hallgatja el.",
        ],
        ...kimenet,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`Ide írtam: ${KIMENET.pathname}`);
}

await main();