// A magyar Wikipedia infoboxának "magyar név" mezője minden helységnél.
//
// MIÉT EZ A FŐ FORRÁS: a KIA erős POSZITÍV bizonyíték (ha ad magyar nevet,
// az valódi), de gyenge NEGATÍV (nem írja ki az azonos nevét sem — a
// kalibrációja 3,1%). A Wikipedia infoboza fordított: a "magyar név" mező
// üres, HA NINCS magyar neve, és a többi nyelvet külön kitöltik. Tehát a
// KIA hiánya NEM bizonyít semmit, ez a mező viszont igen.
//
// A mérés két döntést ad:
//   - ahol a mező NEM üres és különbözik a romántól → van magyar nevünk
//     (a javitasokHu.json-be kerül, ha két forrás is mondja);
//   - ahol ÜRES → nincs magyar neve (a nincsMagyarNev.json-ba kerül).
//     Ez pozitív bizonyíték, nem a KIA hallgatása.
//
// Futtasd:  node infobox.mjs     (előbb: python3 -m http.server nem kell)
//
// Az eredmény a .cache/infobox.json-ba kerül — onnan folytatja, ha a
// Wikidata API megakad. A KIMENET a javitasokHu.json és a
// nincsMagyarNev.json kézi döntéseiben jelenik meg; ez a mérés csak a
// lehetőségeket írja ki, nem dönt.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const UA = "mivelkezdjem.hu/1.0 (helynevekereso; infobox.mjs)";
const EREGMENY = new URL("./.cache/infobox.json", import.meta.url);

/**
 * A Wikidata API `maxlag` hibát ad 200-as státusszal, és ilyenkor a válasz
 * JSON, csak `entities` nélkül.
 *
 * A `&maxlag=5` PARAMÉTERT NEM KELL MEGADNI. A maxlag a QUERY SERVICE
 * (wdqs) terhelését nézi, nem az API-ét; a wdqs 2026-10-09-én több száz
 * másodperces háttérrel futott, miközben a `wbgetentities` egyáltalán nem
 * használja. A paraméterrel a mérés 25 percig nem tudott végigfutni,
 * nélkül ugyanaz a kérés 0,3 másodperc.
 */
async function api(url, { valtozas = 8 } = {}) {
  for (let proba = 0; ; proba++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    const t = await r.text();
    if (r.ok) {
      try {
        const j = JSON.parse(t);
        if (!j.error) return j;
        if (j.error.code !== "maxlag" && j.error.code !== "ratelimited")
          throw new Error(`A Wikidata API hibája: ${j.error.code} — ${j.error.info}`);
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
    if (proba >= valtozas) throw new Error(`Nem sikerült: ${t.slice(0, 100)}`);
    const varakozas = Math.min(30, 5 * (proba + 1));
    console.log(`  (nem sikerült, ${varakozas} mp múlva újra: ${t.slice(0, 60)})`);
    await new Promise((x) => setTimeout(x, varakozas * 1000));
  }
}

/**
 * Kivennük a magyar nevet az infoboxából.
 *
 * Két mocskos forma jön vissza, és mindkettő mérés, nem név:
 *   "Lunca (Alsóvidra)"  — a cikk cíkéhez hasonló minősítés került a mezőbe;
 *   "7"                  — egy korábbi magyarázatsorszám szorult bele.
 * Ezeket nem szabad magyar névként kezelni, különben pont az a hiba
 * keletkezik, amit ez a mérés keres.
 */
function infoboxNev(szoveg) {
  const nyers = szoveg.trim();
  if (!nyers) return { mezo: "", nev: null, ok: false, megjegyzes: "üres" };
  const toroktelen = nyers.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!toroktelen) return { mezo: nyers, nev: null, ok: false, megjegyzes: "csak minősítés" };
  if (!/^[\p{L}][\p{L}\- .']*$/u.test(toroktelen))
    return { mezo: nyers, nev: null, ok: false, megjegyzes: "nem név (szám vagy jelölés)" };
  return { mezo: nyers, nev: toroktelen, ok: true };
}

function ugyanazANev(a, b) {
  const egyszer = (s) =>
    s
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

async function main() {
  const adat = JSON.parse(await readFile(new URL("./helyek.json", import.meta.url), "utf8"));

  // Csak azok, ahol a magyar név egyezik a románnal. Ha eltér, akkor van
  // magyar nevünk, és nincs mit mérni.
  //
  // A laza összevetés (ugyanazANev) szándékos: a "Vále"/"Vale" és a
  // "Dealu Ștefăniței"/"Dealul Ștefăniței" is ide tartozik — ezeknél is
  // felmerülhet a kérdés, hogy van-e magyar nevük.
  const cel = adat.helyek.filter((h) => ugyanazANev(h.hu, h.ro));
  console.log(`${cel.length} hely, ahol a magyar név a románnal egyezik (vagy csak írásmódban tér el)`);

  const eredmeny = existsSync(EREGMENY) ? JSON.parse(await readFile(EREGMENY, "utf8")) : {};
  const hiany = cel.filter((h) => eredmeny[h.q]?.mezo === undefined);
  console.log(`${cel.length - hiany.length} hely kész a cache-ből, ${hiany.length} hátra`);

  // A sitelink-eket kötegben, mert az API 50-nél többet nem bír
  for (let i = 0; i < hiany.length; i += 50) {
    const resz = hiany.slice(i, i + 50);
    const j = await api(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks" +
        `&sitefilter=huwiki&ids=${resz.map((h) => h.q).join("%7C")}`,
    );
    for (const h of resz) {
      eredmeny[h.q] = {
        cikk: j.entities?.[h.q]?.sitelinks?.huwiki?.title ?? null,
      };
    }
    await writeFile(EREGMENY, JSON.stringify(eredmeny, null, 1) + "\n");
    await new Promise((x) => setTimeout(x, 400));
  }

  // A cikkek szövege egyenként: egy cikk infoboxa önmagában nem kérdezhető.
  let kész = 0;
  for (const h of hiany) {
    if (!eredmeny[h.q]?.cikk) continue;
    const cikk = eredmeny[h.q].cikk;
    const j = await api(
      "https://hu.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&rvprop=content" +
        `&rvslots=main&titles=${encodeURIComponent(cikk)}`,
    );
    const oldal = Object.values(j.query?.pages ?? {})[0];
    const szoveg = oldal?.revisions?.[0]?.slots?.main?.["*"] ?? "";
    const m = /\|\s*magyar név\s*=\s*([^\n|]*)/i.exec(szoveg);
    eredmeny[h.q].mezo = m ? m[1] : "";
    kész++;
    if (kész % 50 === 0) {
      await writeFile(EREGMENY, JSON.stringify(eredmeny, null, 1) + "\n");
      console.log(`  ${kész} cikk kész`);
    }
    await new Promise((x) => setTimeout(x, 350));
  }
  await writeFile(EREGMENY, JSON.stringify(eredmeny, null, 1) + "\n");

  // ---- a döntési táblázat ----
  const magyarNev = []; // van magyar neve, ami nem a román
  const ures = []; // a mező üres: NINCS magyar neve
  const azonos = []; // a mező a román nevet adja: ez a neve
  const zaj = []; // a mezőben nem név van
  const nincsCikk = [];
  const nemMert = []; // nincs cikk, vagy a cikk még nincs lekérve
  for (const h of cel) {
    const e = eredmeny[h.q];
    // A NEM MÉRT és a MÉRT ÜRES két különböző dolog, és a kettőt összekeverni
    // a legveszélyesebb hiba: a "még nem néztük meg" olyan eredményt ad,
    // mintha megnéztük volna, és a mérés csendben teljesnek látszik.
    // Ez a projekt negyedik csendes hibája — és itt épp az ellenőrzés
    // tanulságát alkalmazzuk a mérésre magára.
    if (!e || e.mezo === undefined) {
      nemMert.push(h);
      continue;
    }
    if (!e.mezo) {
      ures.push(h);
      continue;
    }
    const t = infoboxNev(e.mezo);
    if (!t.ok) {
      zaj.push({ h, ...t });
      continue;
    }
    if (ugyanazANev(t.nev, h.ro)) azonos.push(h);
    else magyarNev.push({ h, ...t });
  }

  console.log(`\n--- A ${cel.length} hely infoboza:`);
  console.log(`  a mező ÜRES → nincs magyar neve:            ${ures.length}`);
  console.log(`  a mező a román nevét adja → ez a neve:      ${azonos.length}`);
  console.log(`  a mező magyar nevet ad, más:                 ${magyarNev.length}`);
  console.log(`  a mezőben nem név van (zaj):                ${zaj.length}`);
  console.log(`  NEM MÉRT (nincs cikk vagy elmaradt lekérés): ${nemMert.length}`);

  console.log(`\n--- VAN magyar neve, érdemes megnézni:`);
  for (const x of magyarNev)
    console.log(`  ${x.h.q}  ${x.h.hu} → ${x.nev}   (${x.h.kozsegNev ?? "-"}, ${x.h.megye})`);

  console.log(`\n--- Zaj a mezőben (nem név):`);
  for (const x of zaj)
    console.log(`  ${x.h.q}  ${x.h.hu} → "${x.mezo}" (${x.megjegyzes})`);

  if (nemMert.length) {
    console.log(`\n--- Nem mért (a mérés ezekről NEM mond semmit):`);
    for (const h of nemMert.slice(0, 25)) console.log(`  ${h.q}  ${h.hu} (${h.kozsegNev ?? "-"})`);
    if (nemMert.length > 25) console.log(`  ... és még ${nemMert.length - 25}`);
    console.log(
      "\nNEM KÉSZ: a fenti helyek infoboxa nem olvasható, tehát a 'nincs magyar neve'\n" +
        "jelöléshez NEM szabad belőlük negatív bizonyítékot venni.",
    );
  }
}

await main();