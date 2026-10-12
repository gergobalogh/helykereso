// A szabo.adatbank.ro (Szabó M. Attila: Erdélyi és moldvai helységnévtár)
// adataiból kinyeri, ami a `helyek.json`-hoz illeszthető.
//
// FONTOS: ez a fájl semmit nem ír bele a letöltési láncba. Nem nyúl a
// `javitasok.json`-hoz, a `javitasokHu.json`-hoz vagy a `helyek.json`-hoz,
// és a `letolt.mjs` nem hívja. Csak a `kia/` alá ír adatot, azért, hogy
// el lehessen dönteni, mi kerüljön be — és hogy a döntés nyomon
// követhető legyen.
//
// Bemenet:  a `kia/raw.json` (a lekapart KIA, a `lekapar.mjs`-sel keletkezik)
// Kimenet: a `*.json` fájlok ebben a mappában, mind Q-szám szerint.
//
//   node kia/kinyeres.mjs
//
// A leképezés a KIA sorát a mi `helyek.json` egyik sorához köti, megyénként,
// a román néven (97%), magyar néven csak akkor, ha a román nem talál (3%).
// Amit nem tudunk kötni, az a `nem-talalt.json`-ba kerül, nem vész el.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITT = dirname(fileURLToPath(import.meta.url));
const olvas = (p) => JSON.parse(readFileSync(p, "utf8"));

const helyek = olvas(join(ITT, "..", "helyek.json")).helyek;
const megyek = olvas(join(ITT, "..", "helyek.json")).megyek;
const KIA = olvas(join(ITT, "raw.json"));

// ── néverősítés ────────────────────────────────────────────────────────────
// A KIA ş/ţ-et (cedilla) ír, a Wikidata ș/ț-t (vessző alatt). Mindkettőt
// eldobjuk, mert a szöveges összevetés nem érzékeny rá, melyik volt.
function hajtas(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[şŞ]/g, "s")
    .replace(/[ţŢ]/g, "t")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, "")
}

const SZOVEGBEN = [
  // a KIA magyar mezője nem névlista, hanem bibliográfiai jegyzet: tele van
  // félmondatokkal. Ezeket NEM szabad névként kiírni, de eldobni sem
  // szabad — a szöveg maga információ.
  /alapít/iu,
  /érkezett/iu,
  /része/iu,
  /részek/iu,
  /községközp/iu,
  /tanyák?:/iu,
  /negyedik/iu,
  /\d{4}\b/u, // "1776-ban"
  /[.!?]\s+\p{Ll}/u, // mondat van a részben
];

/** Igaz, ha a töredék valós helynév, és nem jegyzet. */
function tisztanNev(s) {
  // Két karakteres magyar falunév is van ("Bő", "Kő", "Szék"), tehát a
  // hossz nem lehet kizáró ok — különben az ilyen nevű falak teljesen
  // kiesnek, és senki nem látja meg, miért.
  if (!s || s.length < 2) return false;
  if (s.split(/\s+/).length > 5) return false;
  return !SZOVEGBEN.some((re) => re.test(s));
}

/**
 * A KIA magyar mezőjében a név és a hozzáfűzött jegyzet gyakran egy
 * darabban jön: "Erősd. A Székföld része." vagy "Bő (Albeg)". A nevet
 * kivágjuk, a jegyzetet levágjuk — különben a falu nevét elveszítenénk
 * egy mondat miatt, ami róla szól.
 */
function nevsJegyzet(frages) {
  let s = frages.trim();
  // "Név. Jegyzet." — a mondat eleje a név, ha rövid és szó nélküli
  const mondat = /^([\p{L}][\p{L}\s'’-]{1,30}?)\.\s+\p{Lu}/u.exec(s);
  if (mondat) s = mondat[1];
  return s.replace(/\s+v\.?\s*$/u, "").trim();
}

/**
 * A zárójeles jegyzetet levágja a névről, DE csak akkor, ha a zárójel
 * tartalma szöveg, nem magyarázó név. Különben a "Bordos [A Székely
 * Partium része]" falu nevét elveszítenénk egy megjegyzés miatt, holott
 * a KIA pont a nevét írta oda, és a megjegyzés csak tájékoztat.
 *
 * Visszaadja [nev, jelegyz] alakban — a jelegyz üres, ha nem volt.
 */
function nevreZarojeles(s) {
  const z = /^(.+?)\s*[\[(\u201c]([^\]\)\u201d]*)[\])\u201d]\s*$/u.exec(s);
  if (!z) return [s, ""];
  const tartalom = z[2].trim();
  // A "+" azt jelenti, hogy a hely több falu egyesítése — a zárójel tehát
  // soha nem része a névnek: "Hármasfalu (Atosfalva + Csókfalva)". A
  // benne levő falunevek hasznosak, ezért a jegyzet megy a `szoveg` közé,
  // nem vész el.
  const osszevonva = tartalom.includes("+");
  if (!osszevonva && !tartalom) return [s, ""];
  if (!osszevonva && !SZOVEGBEN.some((re) => re.test(tartalom))) return [s, ""];
  return [z[1].trim(), s];
}

/** A KIA zárójeles helymegjelölését leveszi: "Keißd [in Weinland]" -> "Keißd" */
const helyMegjeloles = (s) => s.replace(/\s*\[[^\]]*\]/g, "").trim();

/** A KIA " } " jelölése: "saját név } befogadó település". */
function ketResz(s) {
  const i = (s ?? "").indexOf("}");
  if (i < 0) return [s ?? "", ""];
  return [s.slice(0, i), s.slice(i + 1)];
}

// ── a KIA német mezője ─────────────────────────────────────────────────────
// "Nevez, másneve (g); szász (s)" — a zárójel a NYELVET jelöli:
// g német, s szász, hrv horvát, bg bolgár. Csak a g-et vesszük.
function nimet(mezo) {
  const nemet = [];
  const szasz = [];
  for (const darab of (mezo ?? "").split(";")) {
    let s = darab.trim();
    if (!s) continue;
    const jel = /\(([^)]*)\)\s*$/u.exec(s);
    const nyelv = jel ? jel[1] : "";
    if (jel) s = s.slice(0, jel.index).trim();
    if (nyelv && !/\bg\.?/u.test(nyelv)) {
      // (s), (hrv), (bg) — a szászt félretessük, a többit eldobjuk
      if (/s/iu.test(nyelv)) szasz.push(helyMegjeloles(s));
      continue;
    }
    const [sajat, befog] = ketResz(s);
    for (let nev of helyMegjeloles(sajat).split(",")) {
      nev = nev.replace(/\s+v\.?\s*$/u, "").trim();
      if (!nev) continue;
      nemet.push(befog ? `${nev} } ${helyMegjeloles(befog)}` : nev);
      if (/s/iu.test(nyelv)) szasz.push(nev);
    }
  }
  return [nemet.filter((x, i) => nemet.indexOf(x) === i), szasz];
}

// ── a KIA magyar és román nevei ─────────────────────────────────────────────
// A magyar mező szerkezete: "saját magyar név(ek) } befogadó község".
// Egy sorban lehet több név ("Érábrány, Felsőábrány"), zárójeles magyarázat,
// sőt félmondat is. A tisztákat elválasztjuk a jegyzetektől.
function magyarNev(mezo) {
  const [sajat, befog] = ketResz(mezo);
  const nevek = [];
  const szoveg = [];
  for (let n of sajat.replace(/;;+/gu, ",").split(/[,;]/u)) {
    n = nevsJegyzet(n);
    if (!n) continue;
    const [nev, jelegyz] = nevreZarojeles(n);
    if (tisztanNev(nev)) {
      nevek.push(nev);
      if (jelegyz) szoveg.push(jelegyz);
    } else {
      szoveg.push(n);
    }
  }
  return { nevek, szoveg, befogado: helyMegjeloles(befog).trim() || null };
}

// A román mezőt a `lekapar.mjs` már kettévágta: `ro` a név, `vari` a
// szögletes zárójel tartalma. Néha " + " jellel összefűzve (összevont község).
function romanValtozat(sor) {
  return (sor.vari ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 1);
}

// ── illesztés ──────────────────────────────────────────────────────────────
// Megyenként, román néven. A magyar név csak tartalék, és csak akkor
// használjuk, ha a román névre nincs találat a KIA sorában — különben a
// két azonos nevű falu rossz párosodna.
function utszorok(lista) {
  const ro = new Map();
  const hu = new Map();
  const novel = (t, x) => {
    if (!t) return;
    if (!ro.has(t)) ro.set(t, []);
    ro.get(t).push(x);
  };
  for (const x of lista) {
    if (x.ro) novel(hajtas(x.ro), x);
    for (const n of (x.hu ?? "").split(/[,;/]/u)) {
      const t = hajtas(n.replace(/[^A-Za-z0-9 ]/gu, ""));
      if (t.length < 3) continue;
      if (!hu.has(t)) hu.set(t, []);
      hu.get(t).push(x);
    }
  }
  return { ro, hu };
}

// A megyeneveket mindkét oldalon UGYANAZZAL a hajtas()-sal kell bontani, különben
// a "Bistriţa-Năsăud" és a "Bistrița-Năsăud" két különböző megyekulcs lesz, és
// az összes székely megye néma módon kiesik. (Ez volt az első futás hibája:
// 907 német név a python-s változat 1803 helyett.)
const kiaByMegye = new Map();
for (const k of KIA) {
  const c = hajtas(k.megye);
  if (!kiaByMegye.has(c)) kiaByMegye.set(c, []);
  kiaByMegye.get(c).push(k);
}

const enIndex = utszorok(helyek.filter((h) => h.orszag === "RO"));

function illessz(sor) {
  const [sajat] = ketResz(sor.hu);
  const roKulcs = hajtas(sor.ro);
  const ro = roKulcs ? enIndex.ro.get(roKulcs) : null;
  if (ro?.length) return ro[0];
  for (const n of (sajat || "").split(/[,;]/u)) {
  const t = hajtas(n.replace(/[^A-Za-z0-9 ]/gu, ""));
    if (t.length > 2 && enIndex.hu.get(t)?.length) return enIndex.hu.get(t)[0];
  }
  return null;
}

// ── összegyűjtés ───────────────────────────────────────────────────────────
const MEGYENEV = new Map(megyek.map((m) => [m.kod, m.hu]));
const RO_MEGYE_KOD = new Map(
  megyek.filter((m) => m.orszag === "RO").map((m) => [hajtas(m.ro), m.kod]),
);

const nemet = new Map();
const magyar = new Map();
const roman = new Map();
const nemTalalt = [];

// Egy helyhez TÖBB KIA sor is illeszkedhet — és illeszkedik is. Az Abrud
// környéki falvak egy része ma egyetlen település, a KIA viszont mindegyiket
// külön sorban tartja ("Abrud mun.", "Abrud-Sat-Cristea"), és mindegyiknek
// van német neve. Ha Mapbe írunk, a későbbi felülírja az előbbit, és a
// második sor német neve csendben eltűnik. Ezért gyűjtünk, és a névlista
// az összes illeszkedett sorból áll.
const illesztett = new Map();

for (const sor of KIA) {
  const kod = RO_MEGYE_KOD.get(hajtas(sor.megye));
  if (!kod) continue; // moldviai és más, nem romániai megyék — nincs miről szólni

  // ÖSSZETETT sor: "Săcele (Baciu + Cernat + …)" egyszerre ír le több
  // falut. Egyetlen helyhez nem köthető, a magyar nevéből rosszul sülne el.
  if (sor.ro.includes("+")) continue;

  const en = illessz(sor);
  if (!en) {
    const [nNemet] = nimet(sor.de);
    const hu = magyarNev(sor.hu);
    const vari = romanValtozat(sor);
    if (nNemet.length || hu.nevek.length || vari.length) {
      nemTalalt.push({ ro: sor.ro, megye: sor.megye, hu: sor.hu, de: nNemet, vari });
    }
    continue;
  }

  if (!illesztett.has(en.q)) {
    illesztett.set(en.q, { en, kod, sorok: [] });
  }
  illesztett.get(en.q).sorok.push(sor);
}

// A névlista összefogása több sorból, sorrend megőrzésével.
function unioInto(out, lista) {
  for (const x of lista ?? []) if (!out.includes(x)) out.push(x);
}

for (const [q, { en, kod, sorok }] of illesztett) {
  const alap = {
    q,
    megye: kod,
    megyeNev: MEGYENEV.get(kod) ?? kod,
    hu: en.hu,
    ro: en.ro,
    deNekunk: en.de ?? null,
    kiaSorok: sorok.map((s) => s.ro),
  };

  const nNemet = [];
  const szasz = [];
  const huNev = [];
  const huJegyzet = [];
  const huBefog = [];
  const vari = [];
  for (const s of sorok) {
    const [n, sz] = nimet(s.de);
    unioInto(nNemet, n);
    unioInto(szasz, sz);
    const hu = magyarNev(s.hu);
    unioInto(huNev, hu.nevek);
    unioInto(huJegyzet, hu.szoveg);
    if (hu.befogado) unioInto(huBefog, hu.befogado);
    unioInto(vari, romanValtozat(s));
  }

  if (nNemet.length) {
    nemet.set(q, { ...alap, kiaDe: nNemet, kiaSzasz: szasz.length ? szasz : null });
  }
  // Csak akkor érdekes, ha van NÉV, amit mi nem adunk meg: a KIA első magyar
  // neve általában éppen a miénk, azzal nem kell foglalkozni.
  const ujMagyar = huNev.filter((n) => n !== en.hu);
  if (ujMagyar.length || huJegyzet.length) {
    magyar.set(q, {
      ...alap,
      kiaHuNev: huNev,
      kiaHuTorteneti: ujMagyar,
      kiaHuBefogado: huBefog.length ? huBefog : null,
      ...(huJegyzet.length ? { kiaHuJegyzet: huJegyzet } : {}),
    });
  }
  if (vari.length) {
    roman.set(q, { ...alap, kiaVari: vari });
  }
}

// ── kiírás ─────────────────────────────────────────────────────────────────
// Az "új" és a "már van" szétválasztása: az előbbit érdemes átnézni, az utóbbi
// legtöbbször csak írásmód (Großschlatten vs Grossschlatten).
const egyeztet = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/ß/gu, "ss")
    .replace(/[^a-z]/gu, "");

function ujonVan(r) {
  if (!r.deNekunk) return "uj";
  return new Set(r.kiaDe.map(egyeztet)).has(egyeztet(r.deNekunk)) ? "irasmod" : "valos";
}

const szam = (m, tipus) => [...m.values()].filter((r) => ujonVan(r) === tipus).length;
const fej = (fajl, leiras) => [
  leiras,
  "",
  `GENERÁLVA: ${new Date().toISOString().slice(0, 10)}, a kia/raw.json-ból (${KIA.length} sor).`,
  "A `kia/kinyeres.mjs` írja ide. A letöltési lánc NEM olvassa — külön döntés kell.",
  "",
  `q: a mi helységünk Wikidata-azonosítója (a helyek.json kulcsa).`,
];

const nOut = [...nemet.values()];
writeFileSync(
  join(ITT, "nemet-nevek.json"),
  JSON.stringify(
    {
      _comment: fej(
        "nemet-nevek.json",
        "A KIA német nevei, a mi helységeinkhez Q-szám szerint. A ' } ' jel a KIA saját " +
          "jelölése: balra a hely neve, jobbra az, amelyikbe beolvasztották.",
      ),
      osszes: nOut.length,
      uj: nOut.filter((r) => !r.deNekunk).length,
      marad_irasmod: szam(nemet, "irasmod"),
      marad_valos: szam(nemet, "valos"),
      helyek: Object.fromEntries(nOut.map((r) => [r.q, r])),
    },
    null,
    1,
  ),
);

const mOut = [...magyar.values()];
writeFileSync(
  join(ITT, "magyar-nevek.json"),
  JSON.stringify(
    {
      _comment: fej(
        "magyar-nevek.json",
        "A KIA magyar neve(i) — a miénk mellett. Ez a legnagyobb hiányunk: a KIA " +
          "sorainak fele egynél több magyar nevet ad. kiaHuJegyzet: félmondatot " +
          "tartalmazó részek, NEM nevek, külön tartva.",
      ),
      osszes: mOut.length,
      osszes_tortenet: mOut.reduce((n, r) => n + (r.kiaHuNev?.length ?? 0), 0),
      helyek: Object.fromEntries(mOut.map((r) => [r.q, r])),
    },
    null,
    1,
  ),
);

const rOut = [...roman.values()];
writeFileSync(
  join(ITT, "roman-valtozatok.json"),
  JSON.stringify(
    {
      _comment: fej(
        "roman-valtozatok.json",
        "A román név régi alakjai a KIA szögletes zárójeleiből. A keresőn " +
          "hasznos: régebben írt román alakra senki nem keres, hacsak nincs a sorban.",
      ),
      osszes: rOut.length,
      osszes_valtozat: rOut.reduce((n, r) => n + r.kiaVari.length, 0),
      helyek: Object.fromEntries(rOut.map((r) => [r.q, r])),
    },
    null,
    1,
  ),
);

writeFileSync(
  join(ITT, "nem-talalt.json"),
  JSON.stringify(
    {
      _comment: fej(
        "nem-talalt.json",
        "KIA sorok, amiket nem sikerült a mi egyik helyünkhöz kötni. Nagyrészt " +
          "településbe olvasztott falak (Turda Nouă), városrészek és szász " +
          "fürdőhelyek — olyan nevek, amiket mi a 'human settlement' osztály miatt " +
          "nem is tartunk.",
      ),
      osszes: nemTalalt.length,
      sorok: nemTalalt,
    },
    null,
    1,
  ),
);

// ── a letöltőnek átadható, ellenőrzött német nevek ─────────────────────────
// A `letolt.mjs` ezt olvassa. A szűrés ugyanaz a minta, amit a Wikidata-n
// alkalmazunk a `nemetNev()`-vel, de két ponton szükséges eltérés:
//
//   * A KIA-sorok a 3. szabályt NEM kapják (nem anagrammára kell nézni).
//     Ott a "betűrendi egyezés" a másolást jelzi; itthon viszont a forrás
//     szótár, és a `Breitau` (román `Brateiu`) pont valódi német név. Amit
//     eldobunk, az az EGYEZŐ név (`Arad` = `Arad`, `Deva` = `Deva`) —
//     az nem hiba, csak nincs mit hozzátenni: a kereső már megtalálja a
//     román és a magyar néven.
//   * A magyarral egyező nevet sem tesszük be (`Bethlen`, `Wolfsberg`),
//     ugyanezért.
//
// A sorrend NEM véletlen: a KIA útmutatója szerint "mindenik nyelvi sorozat
// a hivatalosnak tekinthető alakváltozattal kezdődik", tehát az első név a
// hivatalos, és az kerül a `de` mezőbe. A többi a `deAlt` listába.
function hajtasGerman(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/ß/gu, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

const eldobvaNemet = { befogado: 0, ures: 0, perjel: 0, romEkezet: 0, cirill: 0, ugyanazRo: 0, ugyanazHu: 0 };

const bevitelnem = {};
for (const [q, r] of nemet) {
  const nevek = [];
  for (let n of r.kiaDe) {
    // "Kleinblasendorf } Blasendorf" — a jobb oldal a befogadó község
    // német neve, nem a helyé. 39 ilyen van; nem tesszük indexelésre, mert
    // a keresőben összekeveredne a község valódi nevével.
    if (n.includes("}")) {
      eldobvaNemet.befogado++;
      n = n.split("}")[0].trim();
    }
    if (!n || n.length < 2) {
      eldobvaNemet.ures++;
      continue;
    }
    // A `nemetNev` 4./5./6. szabálya: román ékezet, perjel-zárójel, cirill.
    if (/[ăâîșşțţĂÂÎŞŢ]/u.test(n)) {
      eldobvaNemet.romEkezet++;
      continue;
    }
    if (/[/()]/.test(n)) {
      eldobvaNemet.perjel++;
      continue;
    }
    if (/[Ѐ-џ]/u.test(n)) {
      eldobvaNemet.cirill++;
      continue;
    }
    const f = hajtasGerman(n);
    if (f && f === hajtasGerman(r.ro)) {
      eldobvaNemet.ugyanazRo++;
      continue;
    }
    if (f && f === hajtasGerman(r.hu)) {
      eldobvaNemet.ugyanazHu++;
      continue;
    }
    if (!nevek.includes(n)) nevek.push(n);
  }
  if (nevek.length) bevitelnem[q] = nevek;
}

writeFileSync(
  join(ITT, "nemetJavitasok.json"),
  JSON.stringify(
    {
      _comment: [
        "A KIA német nevei, ellenőrizve, a letöltő számára.",
        "GENERÁLVA: a kia/kinyeres.mjs írja, a kia/raw.json-ból.",
        "Kulcs: a mi helységünk Q-száma. Érték: a német nevek listája,",
        "  a KIA sorrendjében — az első a hivatalos alak, tehát a `de`",
        "  mezőbe kerül, a többi a `deAlt`-ba.",
        "",
        "FORRÁS: Szabó M. Attila: Erdélyi és moldvai helységnévtár",
        "(szabo.adatbank.ro, 2021-10-23). Ez a digitális változata az",
        "Erdélyi helységnévszótár 2., bővített és javított kiadásának,",
        "és NEM CC0: az Erdélyi Magyar Adatbank (Transindex) szerzői jogú",
        "műve. A licencet lásd a README.md-ben.",
      ],
      forras: "Szabó M. Attila: Erdélyi és moldvai helységnévtár (szabo.adatbank.ro, 2021-10-23)",
      eldobva: eldobvaNemet,
      osszes_hely: Object.keys(bevitelnem).length,
      osszes_nev: Object.values(bevitelnem).reduce((n, v) => n + v.length, 0),
      tobbnev_hely: Object.values(bevitelnem).filter((v) => v.length > 1).length,
      helyek: bevitelnem,
    },
    null,
    1,
  ),
);

console.log(`  ellenőrzött német név a letöltőnek : ${Object.keys(bevitelnem).length} hely, ` +
  `${Object.values(bevitelnem).reduce((n, v) => n + v.length, 0)} név ` +
  `(${Object.values(bevitelnem).filter((v) => v.length > 1).length} helynek egynél több)`);
console.log(`  ellenőrzéskor eldobva            : ` +
  Object.entries(eldobvaNemet).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", "));

// Lapátható formák, mert egy 600 soros JSON-t nehéz átnézni.
function tsv(fajl, lista, oszlopok) {
  const fej = ["q", "megye", "magyar", "román", ...oszlopok].join("\t");
  const sorok = lista.map((r) =>
    [r.q, r.megyeNev ?? "", r.hu ?? "", r.ro ?? "", ...(r.kiaDe ?? r.kiaHuNev ?? [])]
      .join("\t"),
  );
  writeFileSync(join(ITT, fajl), fej + "\n" + sorok.join("\n") + "\n");
}
tsv("nemet-nevek.tsv", nOut, ["német"]);
tsv("magyar-nevek.tsv", mOut, ["magyar_név_ami_nincs_nálunk"]);

// ── számolás ───────────────────────────────────────────────────────────────
const roHely = helyek.filter((h) => h.orszag === "RO");
const p = (n) => String(n).padStart(5);
console.log(`a mi ${roHely.length} romániai helyünk közül:`);
console.log(`  KIA német nevet ad   : ${p(nOut.length)}  (új ${szam(nemet, "uj")}, csak írásmód ${szam(nemet, "irasmod")}, valós ${szam(nemet, "valos")})`);
console.log(`  KIA magyar neve ad   : ${p(mOut.length)}  (összesen ${mOut.reduce((n, r) => n + (r.kiaHuNev?.length ?? 0), 0)} magyar névtöredék)`);
console.log(`  KIA román változatot : ${p(rOut.length)}`);
console.log(`  nem kötöttük helyhez : ${p(nemTalalt.length)}`);
console.log(`  a KIA ${KIA.length} sorából ennyi tartozik a romániai adatunkhoz`);
