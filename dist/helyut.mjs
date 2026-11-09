// A helyoldalak címe: `hely/<megyekód>/<név>`, pl. `hely/ms/szoverd`.
// A `seo.mjs` ezzel írja a fájlokat, a `keres.js` ezzel linkel rájuk, hogy
// a kettő soha ne térjen el.
//
// A név a magyar név ékezet nélkül. Ha egy megyében két hely neve
// ugyanarra jön ki (a `letolt.mjs` utaló toldaléka szerinti esetek, pl. két
// Butești), a község neve kerül mögé; ha az sem választja szét, a
// Wikidata-azonosító. A cirill nevű kárpátaljai és vajdasági sorok
// latin betűsre írva kapnak címet.

const CIRILL = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ь: "", ю: "iu", я: "ia", ђ: "dj", ј: "j", љ: "lj", њ: "nj", ћ: "c",
  џ: "dz", ы: "y", э: "e", ъ: "", ё: "e",
};

export function utNev(szoveg) {
  return String(szoveg ?? "")
    .toLocaleLowerCase("hu-HU")
    .replace(/[Ѐ-ӿ]/g, (betu) => CIRILL[betu] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Q-szám → `hely/<megye>/<név>` (kiterjesztés és perjel nélkül). */
export function helyUtak(helyek) {
  const csoport = new Map();
  for (const hely of helyek) {
    const kulcs = `${hely.megye.toLowerCase()}/${utNev(hely.hu) || hely.q.toLowerCase()}`;
    if (!csoport.has(kulcs)) csoport.set(kulcs, []);
    csoport.get(kulcs).push(hely);
  }
  const utak = new Map();
  for (const [kulcs, tagok] of csoport) {
    if (tagok.length === 1) {
      utak.set(tagok[0].q, `hely/${kulcs}`);
      continue;
    }
    const toldalekos = tagok.map((hely) => {
      const kozseg = utNev((hely.kozsegNev ?? "").replace(/\s+(község|város|municípium)$/i, ""));
      return [hely, kozseg ? `${kulcs}-${kozseg}` : `${kulcs}-${hely.q.toLowerCase()}`];
    });
    const db = new Map();
    for (const [, ut] of toldalekos) db.set(ut, (db.get(ut) ?? 0) + 1);
    for (const [hely, ut] of toldalekos) {
      utak.set(hely.q, `hely/${db.get(ut) > 1 ? `${kulcs}-${hely.q.toLowerCase()}` : ut}`);
    }
  }
  return utak;
}
