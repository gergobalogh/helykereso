// A kereső. Betölti a helyek.json-t, és mindhárom néven keres rá.

const mezo = document.getElementById("mezo");
const valaszt = document.getElementById("megye");
const talalat = document.getElementById("talalat");
const szures = document.getElementById("szures");
const datum = document.getElementById("datum");

let helyek = [];
let megyek = new Map();
let nevek = new Map(); // q -> keresésre szánt szöveg

/**
 * Levesszük az ékezeteket, hogy "Targu Mures" megtalálja a "Târgu Mureș"-t.
 * A magyar ő/ű és a román ă/â/î/ș/ț is ide esik.
 *
 * Visszaadunk egy szöveget ÉS egy táblót arról, hogy a szöveg minden
 * karaktere eredetileg melyik helyről származott. Erre van szükség, mert
 * "Târgu Mureș" leegyszerűsítve rövidebb lesz ("targu mures"), és egy
 * találati hely csak így tudja megmondani, hol kell aláhúzni az eredeti
 * szövegben.
 */
function normaliz(s) {
  let ki = "";
  const poz = []; // poz[i] = a ki szöveg i. karaktere az s hányadik helye
  for (let i = 0; i < s.length; i++) {
    // NFD-vel szétbontjuk, és eldobjuk a kombináló ékezeteket.
    let c = s[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // A román ékezetek egy része nem bomlik el, ezért kézzel is.
    c = c.replace(/[ăâ]/g, "a").replace(/î/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
    c = c.replace(/[^a-z0-9]+/g, " ");
    if (!c) continue;
    // Az egymás utáni szóközökből csak egy marad.
    if (c === " " && ki.endsWith(" ")) continue;
    for (const betu of c) {
      ki += betu;
      poz.push(i);
    }
  }
  return { ki, poz };
}

/**
 * Kiemeli a szövegben azokat a részeket, amikre a felhasználó keresett.
 * A `keresett` szöveget a normaliz() már leegyszerűsítve adja át.
 */
function kiemeles(szoveg, keresett) {
  if (!keresett) return szoveg;
  const { ki, poz } = normaliz(szoveg);
  const kulcs = keresett.replace(/\s+/g, " ").trim();
  if (!kulcs) return szoveg;
  const start = ki.indexOf(kulcs);
  if (start < 0) return szoveg;

  // A leegyszerűsített szövegbeli kezdő- és végpont vissza az eredetire.
  const elso = poz[start];
  const utolso = poz[Math.min(start + kulcs.length - 1, poz.length - 1)];
  return (
    escapeHtml(szoveg.slice(0, elso)) +
    '<span class="kiemel">' +
    escapeHtml(szoveg.slice(elso, utolso + 1)) +
    "</span>" +
    escapeHtml(szoveg.slice(utolso + 1))
  );
}

/** A Wikidata-címkék tiszta szöveg, de nem bízunk benne, hogy azok. */
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/**
 * A Wikidata-oldal linkje, ahol az ember maga javíthatja a nevet.
 *
 * Az URL-t AZ AZONOSÍTÓBÓL állítjuk össze, nem a letöltött `wikidata`
 * mezőből. Két ok miatt:
 *
 *  1. A korábbi kód `encodeURIComponent(h.wikidata)`-val építette, ami az
 *     EGÉSZ URL-t kódolja — a "https://" is "%3A%2F%2F" lesz belőle. A
 *     böngésző ezt relatív útvonalnak nézi, és a link a saját domainünkre
 *     mutat ("http://localhost:8000/https%3A%2F%2F..."). Csak azért nem
 *     szúrtunk bele, mert a link szövegét néztük, nem a célját.
 *  2. Így a mező nem is kell az URL-hez, és nem lehet belőle kimenő karakter.
 *
 * Az `action=edit` a szerkesztő űrlapját nyitja meg magyarul; innen bárki
 * javíthatja a magyar nevet — ez a legtartósabb javítás, mert a `helyek.json`
 * a következő letöltéskor felülíródik, a Wikidata viszont megmarad.
 */
function wikidataLink(h) {
  const q = h.q;
  if (typeof q !== "string" || !/^Q\d+$/.test(q)) return null;
  return `https://www.wikidata.org/wiki/${q}`;
}

/**
 * A sorban megjelenő név, megkülönböztető toldalékkal együtt.
 *
 * Ha ugyanabban a megyében másik helynek is ugyanaz a magyar neve van
 * ("Butești" a Mogos és az Arada község alatt is valós falu), a sor
 * neve önmagában nem mond semmit, és a megye sem választja szét őket —
 * ezért a szülő község odakerül: "Butești (Mogos község)". A toldalékot
 * a `letolt.mjs` számolja ki, mert ez az adat tulajdonsága, nem a
 * megjelenéséé, és az `ellenoriz.mjs` ugyanazt nézi.
 */
function megjelenitettNev(h) {
  return h.utalo ? `${h.hu} (${h.utalo})` : h.hu;
}

function kirajzol(lista, keresett) {
  talalat.innerHTML = "";
  talalat.style.display = lista.length ? "grid" : "none";

  for (const h of lista) {
    const sor = document.createElement("div");
    sor.className = "sor";

    const hu = document.createElement("span");
    hu.className = "nev";
    hu.innerHTML = kiemeles(megjelenitettNev(h), keresett);
    sor.append(hu);

    const ro = document.createElement("span");
    ro.className = "masik";
    ro.innerHTML = '<span class="cimke">ro</span>' + kiemeles(h.ro, keresett);
    sor.append(ro);

    if (h.de) {
      const de = document.createElement("span");
      de.className = "masik";
      de.innerHTML = '<span class="cimke">de</span>' + kiemeles(h.de, keresett);
      sor.append(de);
    }

    // Község, megye, meg a forrás linkje.
    const meta = document.createElement("span");
    meta.className = "kozseg";
    const resz = [];
    // A letöltő már beírta a szülő község nevét ("Ajton község"), és a
    // toldalék is benne van, úgyhogy nem kell hozzáfűznünk.
    //
    // Kivétel az a toldalék, amit a sor elején már kiraktunk: ugyanaz a
    // szöveg kétszer a sorban ("Butești (Mogos község) · Mogos község ·
    // Nagy-Albás megye") csak egy sort szolgálna.
    if (h.kozsegNev && h.kozsegNev !== h.utalo) resz.push(h.kozsegNev);
    const m = megyek.get(h.megye);
    // A megyeszékhely neve ugyanaz, mint a megyé: akkor sem írjuk ki, ha
    // önmagában áll a sorban ("Kolozsvár · Kolozsvár megye"), mert nem
    // mond semmit.
    if (m && m.hu !== h.hu) resz.push(`${m.hu} megye`);
    // A forrás linkje, és hogyan javíthatja, aki észrevessze a hibát.
    const forras = wikidataLink(h);
    if (forras) {
      // `action=edit` a szerkesztő űrlapját nyitja, magyar felülettel. A
      // hu=1 megmondja a Wikidata-nak, hogy a magyar címkét akarjuk.
      meta.innerHTML =
        escapeHtml(resz.join(" · ")) +
        ` · <a href="${forras}" target="_blank" rel="noopener">Wikidata</a>` +
        ` · <a href="${forras}?action=edit&amp;uselang=hu" target="_blank" ` +
        `rel="noopener" title="Javítsd a magyar nevet a Wikidata-n">javítása</a>`;
    } else {
      // Ez nem fordulhat elő, de ha igen, inkább link nélkül, mint rossz
      // linkkel: a hiba a `console`-ba megy, nem a sorba.
      meta.innerHTML = escapeHtml(resz.join(" · "));
      console.error("Nincs érvényes Wikidata-azonosító:", h);
    }
    sor.append(meta);

    talalat.append(sor);
  }
}

/**
 * Mennyire jó a találat? Kisebb a szám, annál jobb.
 *   0 a neve pontosan a beírt szó ("Kolozsvár")
 *   1 a neve azzal kezdődik ("cluj" -> "cluj napoca")
 *   2 valamelyik szavára illeszkedik elölről ("maros" -> "marosvásárhely")
 *   3 csak a megye neve illeszkedik rá (a hely neve nem is tartalmazza)
 *
 * A megjelenített nevet nézzük, tehát a toldalék is beleszámít: a
 * "Butești Mogos" keresés a Mogos községi Butești-t hozza elöl, nem az
 * Arada községit — pedig a magyar nevük egyformára szól.
 */
function pont(h, keresett) {
  const mezok = [megjelenitettNev(h), h.ro, h.de].filter(Boolean);
  const megye = megyek.get(h.megye);
  let legjobb = 3;
  for (const n of mezok) {
    const { ki } = normaliz(n);
    if (ki === keresett) return 0;
    if (ki.startsWith(keresett)) legjobb = Math.min(legjobb, 1);
    else if (ki.split(" ").some((s) => s.startsWith(keresett))) legjobb = 1;
  }
  return legjobb;
}

/** Sorrend: a jobb találatok elöl, aztán a rövidebb nevek. */
function rendez(lista, keresett) {
  return [...lista].sort(
    (a, b) =>
      pont(a, keresett) - pont(b, keresett) ||
      a.hu.length - b.hu.length ||
      a.hu.localeCompare(b.hu, "hu"),
  );
}

function keres() {
  const nyers = mezo.value.trim();
  const { ki: keresett } = normaliz(nyers);
  const megye = valaszt.value;

  // A megyeválasztó szűkít, a szövegkereső finomít. Ha egyik sincs,
  // nem mutatunk semmit: egy 3000 soros lista nem hasznos.
  if (!keresett && !megye) {
    talalat.innerHTML = "";
    talalat.style.display = "none";
    szures.textContent = helyek.length
      ? `${helyek.length} helység, ${megyek.size} megyéből. Írj egy nevet, vagy válassz megyét.`
      : "";
    return;
  }

  // Minden beírt szónak valamelyik néven elő kell fordulnia elölről
  // ("marosvásárhely mures" is menjen).
  const szavak = keresett.split(" ").filter(Boolean);
  const talalatok = helyek.filter((h) => {
    if (megye && h.megye !== megye) return false;
    if (!keresett) return true;
    const szo = nevek.get(h.q).szavak;
    return szavak.every((s) => szo.some((x) => x.startsWith(s)));
  });

  kirajzol(rendez(talalatok, keresett).slice(0, 300), keresett);
  szures.textContent =
    talalatok.length > 300
      ? `${talalatok.length} találat, az első 300 látszik.`
      : `${talalatok.length} találat.`;
}

let idozito;
mezo.addEventListener("input", () => {
  clearTimeout(idozito);
  idozito = setTimeout(keres, 80);
});

async function betolt() {
  const valasz = await fetch("./helyek.min.json");
  if (!valasz.ok) throw new Error(`HTTP ${valasz.status}`);
  const adat = await valasz.json();
  helyek = adat.helyek;
  megyek = new Map(adat.megyek.map((m) => [m.kod, m]));

  // Egyszer előkészítjük, hogy kereséskor csak össze kell hasonlítani.
  //
  // A megye nevét NEM tesszük bele: ellenkezőre a "kolozsvar" keresés 426
  // találatot adna, és a találatok listájában sehol nem lenne látható, hogy
  // miért illik bele oda (mert a megyébe esik). Ehelyett van egy
  // megyeválasztó, ami látszik, és szűkít.
  //
  // A toldalékot viszont igen, mert az a NÉV része: amit a sorban kiírtunk,
  // azt keresni is lehet. Csak azokon a sorokon, amelyeken tényleg látszik
  // is — minden falu községnevét indexelni épp az lenne, amit a megyénévvel
  // éppen elkerültünk.
  for (const h of helyek) {
    const szoveg = [h.hu, h.ro, h.de ?? "", h.utalo ?? ""].filter(Boolean).join(" ");
    const { ki } = normaliz(szoveg);
    nevek.set(h.q, { hu: megjelenitettNev(h), szavak: ki.split(" ").filter(Boolean) });
  }

  // A megyeválasztó feltöltése.
  const valaszt = document.getElementById("megye");
  for (const m of adat.megyek) {
    const opcio = document.createElement("option");
    opcio.value = m.kod;
    opcio.textContent = m.hu;
    valaszt.append(opcio);
  }
  valaszt.addEventListener("change", keres);

  datum.textContent = adat.generatas.slice(0, 10);
  keres();
}

betolt().catch((e) => {
  talalat.style.display = "none";
  szures.textContent =
    "Nem sikerült betölteni a helységeket. Futtasd a `node letolt.mjs`-t, " +
    "és nyisd meg az oldalt egy kiszolgálón (python3 -m http.server).";
  console.error(e);
});