// A letöltő és az ellenőrző közös szabályai.
//
// Miért külön fájl: a "nem helység, csak egy város és a környéke" szűrés
// a `letolt.mjs`-ben van, és az `ellenoriz.mjs`nek is ugyanazt kell
// ellenőriznie a kész adaton. Ha a kettő külön van, az egyik elavulhat —
// és pontosan ez történt: a szűrés a "metropolisztérséget" várta, a
// Wikidata pedig "Metropoliszövezetet" ír, így a Marosvásárhely
// agglomeráció csendben bent maradt. Egy szabály, egy hely.

/**
 * Nem önálló helység: egy város és a környéke, amit a keresőnek nem
 * kell megmutatnia, mert nem bejárhető.
 *
 * Osztály szerint ez nem szűrhető ki: a "metropolitan area" (Q1907114) és
 * a "metropolis" (Q200250) is az "emberi lakhely" (Q486972) alá van kötve a
 * Wikidata-n, tehát a `wdt:P279*` alapú szűrés átengedi őket. A BRASSÓ
 * (Q82174) pedig épp a "metropolitan area" osztályt kapta, pedig az
 * nyilvánvalóan helység — tehát az OSZTÁLY alapján nem lehet dönteni.
 *
 * Ezért a NEVÉBŐL ismerjük fel. A minta szándékosan laza: nem a
 * szabályos "metropolisztérséget" keresi, hanem bármit, ami szótöredékként
 * ráemel a teljes névre.
 *
 * Ezt mindhárom néven ellenőrizzük (magyar, román, német), mert a Wikidata
 * ugyanazt a helyet különböző nyelven másképp nevezi meg:
 *   Q1772388  hu "Kolozsvár metropolisztérség", ro "Zone metropolitană..."
 *   Q1165705  hu "Marosvásárhely Metropoliszövezet", ro "Zona metropolitană..."
 * Csak a magyar névet nézve a második átcsúszik, és a keresőben
 * "Marosvásárhely Metropoliszövezet" jelenik meg találatként.
 *
 * Amit a szándékos lazaság ára: ha valaki magyarul elnevez egy falut
 * "Oroszmetropolövezet"-nek, kiesik. Ez sokkal kisebb baj, mint a fordítottja.
 */
export const NEM_HELYSEG_NEVEK = [
  /metropolisz/i, // "metropolisztérség", "Metropoliszövezet"
  /agglomer/i, // "agglomeráció", "agglomerációs övezet"
  /metropolitan/i, // román "Zona metropolitană", német "Metropolitan area"
  /településcsoport/i, // magyar köznyelvi szó
  /várostérség/i,
];

/** Igaz, ha a hely neve (bármelyik nyelven) nem önálló helységet jelez. */
export function nemHelysegEgy(nev) {
  if (!nev) return false;
  return NEM_HELYSEG_NEVEK.some((re) => re.test(nev));
}

/**
 * Igaz, ha a helynek bármelyik neve ilyen. A `letolt.mjs` ezzel dönt
 * kizárásról, az `ellenoriz.mjs` pedig a kész adaton ellenőrzi, hogy nem
 * csúszott-e be ilyen elem — így a szabály egyetlen helyről jön, és a
 * hiba nem lehet néma.
 */
export function nemHelyseg({ hu, ro, de }) {
  return [hu, ro, de].some(nemHelysegEgy);
}

/**
 * Igaz, ha két sor UGYANAZT a helyet írja le — akkor a duplikátum.
 *
 * Ezt a szabályt először a `letolt.mjs`-ben írtam meg, és csak a román
 * nevet nézte (`megye|ro`), hogy kiszűrje a kétszer szereplő Wikidata-
 * elemeket. Ez 67 valódi helyet törölt ki: Alba megyében több "Botești"
 * és "Florești" község alatt is van, tehát a nevük ütközik, de nem ugyanaz
 * a falu. A `kutatas.md` ezt "néma adatvesztés"-nek nevezi.
 *
 * A döntéshez három dolog kell, és egyik sem a név:
 *   - ugyanaz a `q`: egyértelmű duplikátum (Kolozsvár Q100188 és Q16898189),
 *   - az egyik a másik községe: "Ajton község" és az "Ajton" falu, egy hely,
 *   - mindkettő közvetlenül a megye alatt áll: a megyeszékhely és a
 *     duplikált bejegyzése.
 * Ha egyik sem igaz, akkor két különböző hely, és BOTH megmarad — akkor
 * is, ha azonos a román nevük, mert a községük eltér.
 *
 * Az `ellenoriz.mjs` ugyanezt használja, hogy a kész adaton ne tekintse
 * duplikátumnak a valódi kettősöket.
 */
export function ugyanazAHely(a, b) {
  if (!a || !b) return false;
  if (a.q && a.q === b.q) return true;
  if (a.kozseg && a.kozseg === b.q) return true;
  if (b.kozseg && b.kozseg === a.q) return true;
  return a.kozseg == null && b.kozseg == null;
}

/** A Wikidata-sorszám számmá: a kisebb a régebbi, kanonikusabb bejegyzés. */
function qszam(h) {
  return Number(String(h.q).slice(1));
}

/**
 * Duplikátum-csoportok: sorok, amelyekben bármelyik pár osztozhat helyen.
 *
 * Két kulcson uniózunk, megyén belül: a magyar néven (az sosem üres) ÉS a
 * román néven (ha van). Egy kulcs önmagában kevés: a román szerinti
 * csoportosítás széttöri a párokat, ha az egyik példánynak nincs román
 * neve (Komlós: `Hmeliv` vs. semmi), a magyar szerinti pedig széttöri,
 * ha a toldalék miatt tér el ("Ajton" vs. "Ajton község" — a román
 * `Aiton` mindkettőé). Az unió mindkettőt látja.
 *
 * Visszaadja a csoportok listáját (az egyeleműeket is — azok nem
 * duplikátumok, csak a teljességért vannak bent).
 */
export function dedupCsoportok(helyek) {
  const szulo = new Map(); // q -> gyökér-q
  const find = (q) => {
    let gy = q;
    while (szulo.get(gy) !== gy) gy = szulo.get(gy);
    let x = q;
    while (szulo.get(x) !== gy) {
      const kov = szulo.get(x);
      szulo.set(x, gy);
      x = kov;
    }
    return gy;
  };
  const unio = (a, b) => {
    const ga = find(a);
    const gb = find(b);
    if (ga !== gb) szulo.set(ga, gb);
  };
  const latta = new Map(); // kulcs -> [q]
  for (const h of helyek) {
    szulo.set(h.q, h.q);
  }
  for (const h of helyek) {
    const kulcsok = [`${h.megye}|${h.hu.toLowerCase()}`];
    if (h.ro) kulcsok.push(`${h.megye}|${h.ro.toLowerCase()}`);
    for (const k of kulcsok) {
      if (!latta.has(k)) latta.set(k, []);
      latta.get(k).push(h.q);
    }
  }
  for (const qs of latta.values()) {
    for (let i = 1; i < qs.length; i++) unio(qs[0], qs[i]);
  }
  const csoport = new Map(); // gyökér -> [sor]
  for (const h of helyek) {
    const gy = find(h.q);
    if (!csoport.has(gy)) csoport.set(gy, []);
    csoport.get(gy).push(h);
  }
  return [...csoport.values()];
}

/**
 * Duplikátum-szűrés: a kisebb Q-szám nyer az AZONOS HELYŰEK között.
 *
 * A csoporton belül sorrendben haladunk, és ami egy már BENT lévővel
 * ugyanaz a hely, az kiesik. A bent lévőhöz mérés a lényeg (nem "van-e
 * kisebb azonos helyű bárhol"): ha a kisebb példány maga is kiesett,
 * a nagyobbat nem rántja magával — különben egy község a székhelyfalvával
 * együtt a vele azonos nevű szomszéd falut is kitörölné. Ez a 93-as hiba
 * rejtett rokona: néma törlés, név szerint.
 *
 * Visszaadja `{ marad, kiesett, tobbValodi }`: a `tobbValodi` azok a
 * csoportok, ahol több valódi hely maradt — szándékosan, listázva.
 */
export function szurDuplikat(helyek) {
  const marad = [];
  const kiesett = [];
  const tobbValodi = [];
  for (const tagok of dedupCsoportok(helyek)) {
    if (tagok.length === 1) {
      marad.push(tagok[0]);
      continue;
    }
    const sor = [...tagok].sort((a, b) => qszam(a) - qszam(b));
    const bent = [];
    for (const h of sor) {
      if (bent.some((o) => ugyanazAHely(h, o))) kiesett.push(h);
      else bent.push(h);
    }
    marad.push(...bent);
    if (bent.length > 1) tobbValodi.push(bent);
  }
  return { marad, kiesett, tobbValodi };
}

// ───────────────────────────────────────────────────────────────────────────
// A megkülönböztető toldalék
//
// Ez a `ugyanazAHely()` javításának következménye, nem új hiba: ha két
// különböző hely ugyanabban a megyében ugyanazt a magyar nevet viseli, akkor
// mindkettő megmarad (őket különbözteti meg a községük), és a felhasználó
// két sort lát, amelyek egyformák. Alba megyében a "Butești" a Mogos ÉS az
// Arada község alatt is valós falu.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Az a toldalék, ami tényleg megkülönbözteti a sort — vagy `null`, ha nincs.
 *
 * Alapesetben a szülő község neve: ha a csoporton belül senki más nem
 * osztozik rajta, az elég. Ha viszont két helynek ugyanaz a szülő községe
 * (vagy nincs is községük), a községnév nem választaná szét őket — ilyenkor
 * a román név kerül mellé: "Báródbeznye (Beznea)" és "Báródbeznye
 * (Delureni)", két külön falu Barátka községben, ugyanazzal a magyar
 * névvel (a KIA a Delurenire is a Báródbeznyét adja).
 *
 * Két dolog egyik ágra sem ad toldalékot: akinek nincs szülő községe ÉS a
 * román neve sem különbözik (vagy nincs), illetve akinek a magyar nevében
 * már ott a zárójel ("Trifești (Nagylupsa község)", a `huZarojeles`
 * osztályba tartozó Wikidata-hiba) — utóbbinál a sor eleje már elválasztja
 * a testvérétől, és egy második zárójel csak "Trifești (Nagylupsa község)
 * (Nagylupsa község)"-t adna.
 */
function toldalek(h, osztozik) {
  if (h.hu.endsWith(`(${h.kozsegNev})`)) return null;
  if (h.kozsegNev && !osztozik) return h.kozsegNev;
  if (!h.ro || h.hu.endsWith(`(${h.ro})`)) return null;
  return h.ro;
}

/** A csoportosítás kulcsa: a megye és a magyar név együtt. */
function utaloKulcs(h) {
  return `${h.megye}|${h.hu.toLowerCase()}`;
}

/**
 * Megmondja, melyik helységek kapnak megkülönböztető toldalékot.
 *
 * Kulcs a MEGYE és a magyar név együtt, nem a név önmagában: két megyében
 * lehet ugyanaz a név ("Doboka" Kolozsvár- és Hunyad megyében is), és
 * ott a sor végén álló megyefelirat már elválasztja őket. Ugyanabban a
 * megyében viszont a megye nem segít, mert mindkettő ugyanott van.
 *
 * A toldalék általában a hely szülő községének neve — ezt a sor amúgy is
 * megmutatja, tehát nem új adatot vezetünk be, csak oda tesszük, ahol a
 * felhasználó nézi: a neve mellé ("Butești (Mogos község)"). Ha a csoporton
 * belül a község is közös ("Báródbeznye" kétszer Barátka községben), akkor
 * a román név a toldalék ("Báródbeznye (Beznea)"), mert a községnév ott
 * nem választana szét semmit. Ennek két feltétele van,
 * és mindkettőt az `ellenoriz.mjs` nézi a kész adaton:
 *   - minden ilyen helynek van szülő községe, különben nincs mit írni mellé,
 *   - az azonos nevű csoporton belül a községek különböznek, különben a
 *     toldalék sem választaná szét őket.
 *
 * A visszaadott Map `q -> toldalék`. Akinek nincs benne, annak az azonos
 * megyében egyedül van a neve, tehát toldalék sem kell.
 */
export function utalok(helyek) {
  const csoport = new Map(); // megye|hu -> az ilyen nevű sorok
  for (const h of helyek) {
    const kulcs = utaloKulcs(h);
    if (!csoport.has(kulcs)) csoport.set(kulcs, []);
    csoport.get(kulcs).push(h);
  }
  const ki = new Map();
  for (const sorok of csoport.values()) {
    if (sorok.length < 2) continue;
    // Hányan osztoznak egy szülő községen a csoporton belül? Aki egyedül
    // van vele, annak a községnév elég; aki osztozik, annak a román neve
    // kell — különben a toldalék után is két egyforma sor maradna.
    const kozsegDb = new Map();
    for (const h of sorok) {
      kozsegDb.set(h.kozsegNev ?? null, (kozsegDb.get(h.kozsegNev ?? null) ?? 0) + 1);
    }
    for (const h of sorok) {
      // Ha nincs mit írni mellé, nem találunk ki helyette semmit: az
      // `ellenoriz.mjs` szól, ha ez egyáltalán előfordul, mert akkor két
      // sor marad megkülönböztetés nélkül.
      const t = toldalek(h, (kozsegDb.get(h.kozsegNev ?? null) ?? 0) > 1);
      if (t) ki.set(h.q, t);
    }
  }
  return ki;
}

/**
 * Azok a csoportok, ahol a toldalék nem elég a megkülönböztetéshez: két
 * azonos nevű hely ugyanabban a megyében, ugyanabban a községben — vagy
 * nincs is községük, tehát egyáltalán nincs miről toldalékot írni.
 *
 * Ilyen ma nincs, de ha lenne, a keresőnk két azonos sort mutatna, és ezt
 * csendben tenné — ezért ez a visszatérési érték az ellenőrzőé.
 */
export function utaloUtkozes(helyek) {
  const toldalekok = utalok(helyek);
  const csoport = new Map();
  for (const h of helyek) {
    const kulcs = utaloKulcs(h);
    if (!csoport.has(kulcs)) csoport.set(kulcs, []);
    csoport.get(kulcs).push(h);
  }
  return [...csoport.entries()].filter(([, sorok]) => {
    if (sorok.length < 2) return false;
    // Akinek nincs mit megkülönböztetnie, az biztosan egyforma marad a
    // testvérei mellett; a többinél az elég, ha egyik toldalék sem ugyanaz,
    // mint a másiké.
    const t = sorok.map((h) => toldalekok.get(h.q) ?? null);
    if (t.includes(null)) return true;
    return new Set(t).size < sorok.length;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// A nyelvi ellenőrzések
//
// Mindegyik abból indul ki, hogy a magyar címke magyar nyelvű SZÓ kell legyen,
// a német pedig német. A Wikidata-n viszont van, aki román helynevet másol a
// magyar mezőbe, zárójeles megkülönböztetést hagy bent, magyarázó mondatot
// tesz be, illetve a román nevet önti a német mezőbe.
//
// Ezek a WIKIDATA hibái, nem a kódé: a `letolt.mjs` csak átmásolja őket
// (a `kutatas.md` ezt élőben megállapította). Az `ellenoriz.mjs` ezért
// ellenőrzi, hogy NE csússzon be ilyen — de a már ismert Q-számokat nem
// számítja hibának, mert azokról a `kutatas.md` szól, és ha mindegyik piros
// lenne, senki nem látná meg, ha ÚJabb jelenik meg ugyanebben az
// osztályban. A tudott hibák listája az `ismertHibak.json`-ban van.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A "magyar név" nyelvi ellenőrzései.
 *
 * Mindegyik a magyar mezőt nézi, és mindegyik abból indul ki, hogy a magyar
 * címke magyar nyelvű SZÓ kell legyen. A Wikidata-n viszont van, aki román
 * helynevet másol ide, van, aki zárójeles megkülönböztetést hagy bent, és
 * van, aki magyarázó mondatot tesz be.
 *
 * A román helynév-szavak listája nem teljes: a magyar nyelvű helynevek
 * átlátszthatatlanok, és bármelyik szó lehet román. Ezért csak a lista
 * elejéről induló, egyértelműen román szavakat nézzük — a hamis riasztás
 * ugyanolyan rossz, mint a néma hiba.
 */
const ROMAN_HELYNEV_SZAVAK = [
  "dealu", "dealul", "valea", "vale", "dupa", "peste", "dosu", "coasta",
  "gura", "lunca", "oas", "moara", "poiana", "poieni", "fagetu", "culme",
  "platou", "crang", "livada", "padurea", "padure", "capu", "fata", "izvor",
  "prelu", "catun", "baisoara", "culori", "platja", "maluri", "fundatura",
];

const ROMAN_SZO_RE = new RegExp(
  `^(${ROMAN_HELYNEV_SZAVAK.join("|")})(?=[\\s-]|$)`,
  "iu",
);

/** A magyar mező elején román helynév-szó áll ("Valea Albá", "Dealu Mare"). */
export function huRomanSzo(hu) {
  if (!hu) return false;
  return ROMAN_SZO_RE.test(
    hu
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[ăâ]/g, "a")
      .replace(/î/g, "i")
      .replace(/[șş]/g, "s")
      .replace(/[țţ]/g, "t"),
  );
}

/** A magyar mező zárójeles megkülönböztetést tartalmaz ("Pirita (Románia)"). */
export function huZarojeles(hu) {
  return Boolean(hu) && hu.includes("(");
}

/**
 * A magyar mező magyarázó mondat, nem név. Ilyen a magyar mezőben a
 * román helynevek között is van: Q3889960 hu = "Rudafalu Romániában,
 * Hunyad megyében", miközben en = "Ruda".
 *
 * A zárójeles "(Románia)" NEM számít ide — az a `huZarojeles` esete, és
 * két helyen számolva ugyanaz a tíz elem kétszer számolódna.
 *
 * A vessző önmagában NEM mondat: a "Fonóháza, Fonókismező" (Q755305,
 * Fânațe, Bihar) két összeolvadt falu neve — a KIA a Fonóházát adja
 * (Fânațe, Câmpani község, BH). Ami magyaráz, az a "Romániában" és a
 * "megyében" szó, nem az írásjel.
 */
export function huMondat(hu) {
  if (!hu) return false;
  return /\bRomániában\b/.test(hu) || /\bmegyében\b/.test(hu);
}

/** A német mező két nevet fűzött össze perjellel. */
export function dePerjel(de) {
  return Boolean(de) && /[/()]/.test(de);
}

/**
 * A német mezőben román ékezet van: ș, ț, ă, â, î. A német ábécében
 * ilyen betű nincs, tehát ez biztos jele annak, hogy a Wikidata a román
 * nevet másolta oda (a magyar ő/ű közös ékezet, az nem számít).
 */
export function deRomanEkezet(de) {
  return Boolean(de) && /[ăâîșşțţ]/.test(de);
}

/**
 * Két német (vagy általában latin) nevet hajtunk össze az írásmód
 * különbségei nélkül: `Großschlatten` = `Grossschlatten`, `Vallee` =
 * `Vallee`. A KIA `ß`-t és `ss`-t is ír, a Wikidata meg `ß`-t, tehát
 * ezek nélkül ugyanaz a név kétszer kerülne egy listába.
 *
 * Ez NEM a `nemetNev` 3. szabályának (betűrendi egyezés) újraírása: az a
 * másodrend, itt sorrend nem számít. Csak azt mondjuk meg, hogy két
 * felírás ugyanaz a szó-e.
 */
export function hajtasGerman(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/gu, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

/**
 * Igaz, ha a német név használható: nincs benne román ékezet, perjel,
 * zárójel vagy cirill betű. Ez a `nemetNev` 4., 5. és 6. szabálya
 * névre szűrve.
 *
 * A 3. szabály (a román névvel betűrendi egyezés) SZÁNDÉKOLTAN KIMARAD:
 * az a Wikidata másolását szűri, a KIA viszont szótár — a `Breitau`
 * (román `Brateiu`) valódi német név, és nem szabad eldobni. Amit ez a
 * szűrő eldob, az a `kinyeres.mjs`-ben már le van szűrve; itt azért
 * van, hogy az ellenőrző is ugyanezt lássa.
 */
export function deHasznalhato(de) {
  if (!de) return false;
  if (/[ăâîșşțţĂÂÎ]/u.test(de)) return false;
  if (/[/()]/.test(de)) return false;
  if (/[Ѐ-џ]/u.test(de)) return false;
  return true;
}

/**
 * Az adat és a felület verziója.
 *
 * Miért kell: a `helyek.json` a `letolt.mjs`-ben készül, az oldal ezt
 * olvassa, és a kettő nem egyszerre frissül — a git be van kapcsolva, de a
 * site-on futó példányról nem látszik, melyik commit adatait látja a
 * felhasználó. A footerben megjelenő verzió ezt megmondja: ha a szám
 * nem egyezik a `CHANGELOG.md` legfrissebb bejegyzésével, akkor a
 * `helyek.json` nincs a legfrissebb letöltésből.
 *
 * Mikor kell emelni:
 *   - nagyobb (2.0.0): a felület vagy az adat értelme megváltozott (pl. a
 *     toldalék megjelent, új mező, törölt helység);
 *   - kisebb (1.1.0): új ellenőrzés, új szabály, ami nem változtatja meg a
 *     felhasználó által látott adatot;
 *   - egyébként nem: a napi letöltés nem ír új verziót.
 *
 * A szám a `letolt.mjs`-ben kerül a `helyek.json`-ba, a `keres.js` a
 * footerben mutatja, az `ellenoriz.mjs` pedig egyezést szól kő, ha hiányzik
 * vagy nem egyezik a `szabalyok.mjs`-belivel.
 */
export const VERZIO = "4.0.0";

/**
 * Cirill átírás latinra (ukrán + szerb cirill). Közös helyen kell, mert
 * két fogyasztója van: a `keres.js` ezzel indexeli a pótolt nevű sorokat
 * (különben a cirill név kereshetetlen lenne), és a `letolt.mjs` 6.
 * németnév-szabálya ezzel fogja meg az ukrán/szerb név latin másolatát
 * (`Strymba` == ukrán `Стримба`).
 */
const CIRILL_TERKEP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "je",
  ж: "zh", з: "z", и: "y", і: "i", ї: "ji", й: "j", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
  ю: "ju", я: "ja", ђ: "d", ј: "j", љ: "lj", њ: "nj", ћ: "c",
  џ: "dz", ы: "y", э: "e", ё: "jo", ъ: "",
};

export function cirillAtir(s) {
  // Kisbetűsítve: a térkép csupa kisbetűs, a bemenet vegyes is lehet.
  return s.toLowerCase().replace(/[Ѐ-џ]/g, (b) => CIRILL_TERKEP[b] ?? "");
}

/**
 * Ugyanaz a név, csak más betűkkel: "Vále" / "Vale",
 * "După Plese" / "După Pleșe", "Dealul Ștefăniței" / "Dealu Ștefăniței".
 *
 * Miért kell: a `nincsMagyarNev.json` állítása az, hogy "amit a sorban
 * látsz, az a román név". Ez bizonyos magyar nevű helyen is igaz lenne,
 * ha valaki éppen magyarul írta át (a "Vále" a magyar helységnévtárban is
 * így jelenik meg) — tehát a KÉT betűsoros összehasonlítás hamis
 * ellenőrzés lenne, és a 121-ből 4-et feleslegesen zúgna rá.
 *
 * Ez ugyanaz a leegyszerűsítés, amit a `keres.js` `normaliz()` csinál a
 * kereséshez (ékezet, pont, kötőjel, kis-nagybetű), csak itt nincs szó,
 * ahol a találat lenne.
 *
 * A definitív szócikk váltakozik is: "Dealu Ștefăniței" és
 * "Dealul Ștefăniței" ugyanaz a földrajzi név, tehát az "-u" / "-ul" nem
 * hordoz jelentést. Ezért a mássalhangzó előtt álló "ul"-t "u"-ra
 * egyszerűsítjük. Csak ezen az ellenőrzésen fut: nem keresési találatra,
 * hanem az állítás igazságára.
 */
export function ugyanazANev(a, b) {
  if (!a || !b) return false;
  const egyszer = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[ăâ]/g, "a")
      .replace(/î/g, "i")
      .replace(/[șş]/g, "s")
      .replace(/[țţ]/g, "t")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const cikk = (s) => s.replace(/([aeiou])l(?=[bcdfghjklmnpqrstvwxz])/g, "$1").replace(/l$/, "");
  return cikk(egyszer(a)) === cikk(egyszer(b));
}
