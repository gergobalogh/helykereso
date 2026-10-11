// A kereső. Betölti a helyek.json-t, és mindhárom néven keres rá.

// Országnevek a sorvégi jelöléshez. Csak határon túl látszik: Románia az
// alapértelmezett, és a romániai sorokon nincs ország. (A `letolt.mjs`
// `ORSZAG_NEV`-jének a tükre — szándékosan nincs importálva, mert ez
// statikus oldal, nincs építési lépés.)
const ORSZAG_NEV = { HU: "Magyarország", UA: "Ukrajna", RS: "Szerbia" };

const mezo = document.getElementById("mezo");
const valaszt = document.getElementById("megye");
const talalat = document.getElementById("talalat");
const szures = document.getElementById("szures");
const datum = document.getElementById("datum");
const verzio = document.getElementById("verzio");
const terkepPanel = document.getElementById("terkep-panel");
const terkepElem = document.getElementById("terkep");
const terkepUzenet = document.getElementById("terkep-uzenet");
const keresDoboz = document.querySelector(".keres-wrap");

// Elég hosszú ahhoz, hogy gépelés közben ne rajzoljuk újra folyton a listát,
// de rövid marad, hogy a kereső ne érződjön lomha válaszúnak.
const KERESES_KESLELTETES = 160;
// Az analitikához hosszabb csendet várunk, hogy egy begépelt név egyetlen
// esemény legyen, ne külön esemény minden rövid gépelési szünet után.
const MERES_KESLELTETES = 800;

let helyek = [];
let megyek = new Map();
let nevek = new Map(); // q -> keresésre szánt szöveg
let terkep = null;
let jeloloReteg = null;
let jelolok = new Map(); // q -> Leaflet circleMarker
let kivalasztottQ = null;
let meresiIdozito = null;
let utolsoKeresesMeres = null;

/** Az analitika hibája vagy blokkolása soha ne akadályozza a keresőt. */
function umamiEsemeny(nev, adat) {
  try {
    const kuldes = window.umami?.track?.(nev, adat);
    if (kuldes && typeof kuldes.catch === "function") kuldes.catch(() => {});
  } catch {
    // A kereső reklám-/követésblokkoló mellett is teljes értékű marad.
  }
}

function talalatSav(darab) {
  if (darab === 0) return "0";
  if (darab === 1) return "1";
  if (darab <= 10) return "2-10";
  if (darab <= 50) return "11-50";
  if (darab <= 300) return "51-300";
  return "300+";
}

/**
 * Egy befejezett keresést mérünk. A beírt szöveget szándékosan nem küldjük
 * el: a hossza, a szavak száma és az eredményessége elég a használati mód
 * megértéséhez anélkül, hogy szabad szöveget gyűjtenénk.
 */
function keresestMer(osszegzes, indito) {
  clearTimeout(meresiIdozito);
  meresiIdozito = null;
  if (!osszegzes) {
    utolsoKeresesMeres = null;
    return;
  }

  const adat = { ...osszegzes, trigger: indito };
  const alairas = JSON.stringify(adat);
  if (alairas === utolsoKeresesMeres) return;
  utolsoKeresesMeres = alairas;
  umamiEsemeny("Search", adat);
}

function keresestMerKesobb(osszegzes) {
  clearTimeout(meresiIdozito);
  if (!osszegzes) {
    meresiIdozito = null;
    utolsoKeresesMeres = null;
    return;
  }
  meresiIdozito = setTimeout(() => keresestMer(osszegzes, "text"), MERES_KESLELTETES);
}

function talalatMuveletetMer(muvelet, q) {
  const rang = [...talalat.children].findIndex((sor) => sor.dataset.q === q) + 1;
  const adat = { action: muvelet };
  if (rang > 0) adat.rank = rang;
  umamiEsemeny("Search result", adat);
}

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
/**
 * Cirill átírás latinra — a közös `szabalyok.mjs`-ből. A pótolt nevű sorok
 * (`huPotolt`) ukrán/szerb nevet mutatnak (cirill írással) — átírás nélkül
 * a keresőindex üres lenne, és a falu megtalálhatatlan.
 */
import { cirillAtir } from "./szabalyok.mjs";

function normaliz(s) {
  let ki = "";
  const poz = []; // poz[i] = a ki szöveg i. karaktere az s hányadik helye
  for (let i = 0; i < s.length; i++) {
    // NFD-vel szétbontjuk, és eldobjuk a kombináló ékezeteket.
    let c = s[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // A cirill betűket előbb átírjuk, mert a latin szűrő különben
    // mindet eldobná (lásd `cirillAtir` a `szabalyok.mjs`-ben).
    c = cirillAtir(c);
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

/** Csak a letöltő által előállítható hu/ro Wikipedia-linket engedjük ki. */
function wikipediaLink(h) {
  if (typeof h.wikipedia !== "string") return null;
  try {
    const url = new URL(h.wikipedia);
    if (!/^https:$/.test(url.protocol)) return null;
    if (!["hu.wikipedia.org", "ro.wikipedia.org"].includes(url.hostname)) return null;
    if (!url.pathname.startsWith("/wiki/")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function vanKoordinata(h) {
  return (
    Number.isFinite(h.lat) &&
    Number.isFinite(h.lon) &&
    h.lat >= -90 && h.lat <= 90 &&
    h.lon >= -180 && h.lon <= 180
  );
}

function metaElvalaszto(meta) {
  if (meta.childNodes.length) meta.append(document.createTextNode(" · "));
}

function metaLink(meta, szoveg, href, title) {
  metaElvalaszto(meta);
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = szoveg;
  if (title) a.title = title;
  meta.append(a);
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

function popupTartalom(h) {
  const doboz = document.createElement("div");
  const nev = document.createElement("strong");
  nev.textContent = megjelenitettNev(h);
  doboz.append(nev);

  const tobbiNev = [
    h.ro && h.ro !== h.hu ? `ro ${h.ro}` : null,
    h.de ? `de ${h.de}` : null,
  ].filter(Boolean);
  if (tobbiNev.length) {
    const nevek = document.createElement("div");
    nevek.className = "popup-nevek";
    nevek.textContent = tobbiNev.join(" · ");
    doboz.append(nevek);
  }

  const linkek = document.createElement("div");
  linkek.className = "popup-linkek";
  const wiki = wikipediaLink(h);
  if (wiki) metaLink(linkek, "Wikipedia", wiki);
  const wikidata = wikidataLink(h);
  if (wikidata) metaLink(linkek, "Wikidata", wikidata);
  if (linkek.childNodes.length) doboz.append(linkek);
  return doboz;
}

function jeloloStilus(kivalasztva, egyetlen = false) {
  return {
    radius: kivalasztva ? 9 : egyetlen ? 8 : 6,
    color: kivalasztva ? "#5f2121" : "#fffdf6",
    weight: kivalasztva ? 3 : 2,
    fillColor: kivalasztva ? "#d09a22" : "#7c2d2d",
    fillOpacity: 0.92,
  };
}

function terkepIndit() {
  if (terkep) return true;
  if (!window.L?.map) return false;
  terkep = window.L.map(terkepElem, {
    scrollWheelZoom: false,
    zoomControl: true,
  }).setView([46.5, 24.5], 6);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(terkep);
  jeloloReteg = window.L.featureGroup().addTo(terkep);
  return true;
}

function kijelolesTorol() {
  if (kivalasztottQ && jelolok.has(kivalasztottQ)) {
    jelolok.get(kivalasztottQ).setStyle(jeloloStilus(false, jelolok.size === 1));
  }
  document.querySelectorAll(".sor.kivalasztva").forEach((sor) => {
    sor.classList.remove("kivalasztva");
  });
  kivalasztottQ = null;
}

function mutatTerkepen(h, { kozepre = true, popup = true, gorget = false } = {}) {
  const jelolo = jelolok.get(h.q);
  if (!terkep || !jelolo) return;
  kijelolesTorol();
  kivalasztottQ = h.q;
  jelolo.setStyle(jeloloStilus(true, jelolok.size === 1));
  jelolo.bringToFront();
  const sor = talalat.querySelector(`.sor[data-q="${h.q}"]`);
  if (sor) {
    sor.classList.add("kivalasztva");
    if (gorget) sor.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (kozepre) terkep.flyTo(jelolo.getLatLng(), Math.max(terkep.getZoom(), 12));
  if (popup) jelolo.openPopup();
}

function terkepElrejt() {
  terkepPanel.hidden = true;
  jelolok.clear();
  kivalasztottQ = null;
  if (jeloloReteg) jeloloReteg.clearLayers();
}

function terkepKirajzol(lista, keresett) {
  const koordinatas = lista.filter(vanKoordinata);
  if (!koordinatas.length) {
    terkepElrejt();
    return;
  }

  terkepPanel.hidden = false;
  // Ha a CDN egy korábbi próbánál még nem ért ide, a hibaüzenetet az első
  // sikeres inicializálás előtt takarítjuk el. Egy már élő Leaflet-térkép
  // belső DOM-jához viszont nem nyúlunk.
  if (!terkep && window.L?.map) {
    terkepElem.classList.remove("nem-elerheto");
    terkepElem.textContent = "";
  }
  if (!terkepIndit()) {
    terkepElem.classList.add("nem-elerheto");
    terkepElem.textContent = "A térkép most nem tölthető be; a találatok és a forráslinkek továbbra is használhatók.";
    terkepUzenet.textContent = `${koordinatas.length} térképezhető találat`;
    return;
  }

  terkepElem.classList.remove("nem-elerheto");
  jeloloReteg.clearLayers();
  jelolok.clear();
  kijelolesTorol();

  const egyetlen = koordinatas.length === 1;
  for (const h of koordinatas) {
    const jelolo = window.L.circleMarker([h.lat, h.lon], jeloloStilus(false, egyetlen));
    // Hover közben ne tolja arrébb a térképet a popup: különben a jelölő
    // kicsúszhatna az egér alól, amitől a popup rögtön be is záródna.
    jelolo.bindPopup(popupTartalom(h), { autoPan: false });
    jelolo.on("mouseover", () => jelolo.openPopup());
    jelolo.on("mouseout", () => {
      // A kattintással kiválasztott hely popupja maradjon nyitva. Ha egy
      // másik jelölő fölé vittük az egeret, utána ezt is visszaállítjuk.
      if (kivalasztottQ === h.q) return;
      jelolo.closePopup();
      if (kivalasztottQ && jelolok.has(kivalasztottQ)) {
        jelolok.get(kivalasztottQ).openPopup();
      }
    });
    jelolo.on("click", () => {
      talalatMuveletetMer("map-marker", h.q);
      mutatTerkepen(h, { kozepre: false, gorget: true });
    });
    jelolo.addTo(jeloloReteg);
    jelolok.set(h.q, jelolo);
  }

  const hianyzo = lista.length - koordinatas.length;
  terkepUzenet.textContent = hianyzo
    ? `${koordinatas.length} találat a térképen · ${hianyzo} koordináta nélkül`
    : `${koordinatas.length} találat a térképen`;

  requestAnimationFrame(() => {
    terkep.invalidateSize();
    const pontos = keresett
      ? koordinatas.filter((h) => pont(h, keresett) === 0)
      : [];
    if (egyetlen || pontos.length === 1) {
      mutatTerkepen(egyetlen ? koordinatas[0] : pontos[0], { kozepre: false });
      terkep.setView([pontos[0]?.lat ?? koordinatas[0].lat, pontos[0]?.lon ?? koordinatas[0].lon], 12);
    } else {
      terkep.fitBounds(jeloloReteg.getBounds(), { padding: [24, 24], maxZoom: 11 });
    }
  });
}

function kirajzol(lista, keresett) {
  talalat.innerHTML = "";
  talalat.style.display = lista.length ? "grid" : "none";

  for (const h of lista) {
    const sor = document.createElement("article");
    sor.className = "sor";
    sor.dataset.q = h.q;
    if (vanKoordinata(h)) {
      sor.classList.add("terkepes");
      sor.title = "Kattints a hely térképi kijelöléséhez";
      sor.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        mutatTerkepen(h);
      });
    }

    const hu = document.createElement("span");
    hu.className = "nev";
    hu.innerHTML = kiemeles(megjelenitettNev(h), keresett);
    sor.append(hu);

    // Nincs magyar neve: a fenti név románul van, és ezt megmondjuk.
    //
    // Nem a név helyéta "nincs magyar neve" szöveget írunk, mert akkor a
    // felhasználó nem tudná keresni a falut (több mint száz ilyen van,
    // és a nevük az egyetlen támpont). Ezért apró jelölés a soron.
    if (h.huNincsNeve) {
      const jelzes = document.createElement("span");
      jelzes.className = "nincsneve";
      jelzes.textContent = "nincs magyar neve";
      jelzes.title =
        "Ennek a helynek nincs magyar neve: amit látsz, az a román név. " +
        "A KIA helységnévtár és a magyar Wikipedia sem őrzi a magyar nevét.";
      sor.append(jelzes);
    }

    // A román sor csak akkor van, ha van román név: határon túl (HU,
    // részben UA/RS) sok helynek nincs román címkéje a Wikidata-n, és az
    // üres sor csak zaj lenne. Keresni persze így is lehet magyarul.
    if (h.ro) {
      const ro = document.createElement("span");
      ro.className = "masik";
      ro.innerHTML = '<span class="cimke">ro</span>' + kiemeles(h.ro, keresett);
      sor.append(ro);
    }

    if (h.de) {
      const de = document.createElement("span");
      de.className = "masik";
      de.innerHTML = '<span class="cimke">de</span>' + kiemeles(h.de, keresett);
      sor.append(de);
    }

    // Község, megye, ország, meg a forrás linkje.
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
    //
    // A terület fajtája a megyeadatból jön: ami nincs megadva, az "megye"
    // (a romániai sorok szövege így nem változik); Kárpátalja puszta név,
    // a bánsági körzet "körzet". Az ország csak határon túl látszik —
    // Románia az alapértelmezett.
    if (m && m.hu !== h.hu) {
      const fajta = m.fajta === undefined ? "megye" : m.fajta;
      resz.push(fajta ? `${m.hu} ${fajta}` : m.hu);
    }
    if (h.orszag && ORSZAG_NEV[h.orszag]) resz.push(ORSZAG_NEV[h.orszag]);
    // A forrás linkje, és hogyan javíthatja, aki észrevessze a hibát.
    if (resz.length) meta.append(document.createTextNode(resz.join(" · ")));
    const wikipedia = wikipediaLink(h);
    if (wikipedia) metaLink(meta, "Wikipedia", wikipedia);
    const forras = wikidataLink(h);
    if (forras) {
      metaLink(meta, "Wikidata", forras);
      metaLink(
        meta,
        "javítása",
        `${forras}?action=edit&uselang=hu`,
        "Javítsd a magyar nevet a Wikidata-n",
      );
    } else {
      // Ez nem fordulhat elő, de ha igen, inkább link nélkül, mint rossz
      // linkkel: a hiba a `console`-ba megy, nem a sorba.
      console.error("Nincs érvényes Wikidata-azonosító:", h);
    }
    if (vanKoordinata(h)) {
      metaElvalaszto(meta);
      const gomb = document.createElement("button");
      gomb.type = "button";
      gomb.className = "terkepre";
      gomb.textContent = "térképen";
      gomb.setAttribute("aria-label", `${megjelenitettNev(h)} megmutatása a térképen`);
      gomb.addEventListener("click", () => mutatTerkepen(h));
      meta.append(gomb);
    }
    sor.append(meta);

    talalat.append(sor);
  }
}

/**
 * A keresés megosztható URL-t kap. A lekérdezéses változatok kanonikus
 * címe továbbra is a főoldal, ezért nem hozunk létre több ezer, azonos
 * tartalmú indexelhető oldalt; a statikus megyejegyzékek adják a keresőknek
 * a helységneveket.
 */
function urlAllapotFrissit() {
  const url = new URL(window.location.href);
  const nyers = mezo.value.trim();
  if (nyers) url.searchParams.set("q", nyers);
  else url.searchParams.delete("q");
  if (valaszt.value) url.searchParams.set("megye", valaszt.value);
  else url.searchParams.delete("megye");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
  const mezok = [megjelenitettNev(h), h.ro, h.de, h.alt].filter(Boolean);
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
  keresDoboz.classList.remove("kereses-folyamatban");
  keresDoboz.setAttribute("aria-busy", "false");
  talalat.classList.remove("kereses-folyamatban");

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
    terkepElrejt();
    return null;
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

  const megjeleno = rendez(talalatok, keresett).slice(0, 300);
  kirajzol(megjeleno, keresett);
  terkepKirajzol(megjeleno, keresett);
  szures.textContent =
    talalatok.length > 300
      ? `${talalatok.length} találat, az első 300 látszik.`
      : `${talalatok.length} találat.`;

  return {
    mode: keresett && megye ? "text+county" : keresett ? "text" : "county",
    county: megye || "all",
    query_length: keresett.length,
    word_count: szavak.length,
    results: talalatok.length,
    result_range: talalatSav(talalatok.length),
    exact_match: keresett ? talalatok.some((h) => pont(h, keresett) === 0) : false,
  };
}

let idozito;
mezo.addEventListener("input", () => {
  clearTimeout(idozito);
  clearTimeout(meresiIdozito);
  keresDoboz.classList.add("kereses-folyamatban");
  keresDoboz.setAttribute("aria-busy", "true");
  if (talalat.childElementCount) talalat.classList.add("kereses-folyamatban");
  idozito = setTimeout(() => {
    idozito = null;
    const osszegzes = keres();
    urlAllapotFrissit();
    keresestMerKesobb(osszegzes);
  }, KERESES_KESLELTETES);
});

talalat.addEventListener("click", (event) => {
  const cel = event.target instanceof Element ? event.target : null;
  const sor = cel?.closest(".sor");
  if (!sor || !talalat.contains(sor)) return;

  let muvelet = null;
  const link = cel.closest("a");
  if (link) {
    const url = new URL(link.href);
    if (url.hostname.endsWith("wikipedia.org")) muvelet = "wikipedia";
    else if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "edit") {
      muvelet = "wikidata-edit";
    } else if (url.hostname === "www.wikidata.org") muvelet = "wikidata";
  } else if (cel.closest(".terkepre")) {
    muvelet = "map-button";
  } else if (sor.classList.contains("terkepes")) {
    muvelet = "map-row";
  }

  if (muvelet) talalatMuveletetMer(muvelet, sor.dataset.q);
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
    const szoveg = [h.hu, h.ro, h.de ?? "", h.utalo ?? "", h.alt ?? ""].filter(Boolean).join(" ");
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

  // A főoldali példák, a statikus megyeoldalak és a megosztott linkek
  // ugyanazt a keresőt nyitják meg, előre kitöltve.
  const kezdoParameterek = new URLSearchParams(window.location.search);
  mezo.value = (kezdoParameterek.get("q") ?? "").slice(0, 200);
  const kezdoMegye = kezdoParameterek.get("megye");
  if (kezdoMegye && megyek.has(kezdoMegye)) valaszt.value = kezdoMegye;

  valaszt.addEventListener("change", () => {
    clearTimeout(idozito);
    idozito = null;
    const osszegzes = keres();
    urlAllapotFrissit();
    keresestMer(osszegzes, "county");
  });

  datum.textContent = adat.generatas.slice(0, 10);
  // A verzió a footerben. Azért kell, mert a helyek.json és az oldal nem
  // egyszerre frissül: ebből látszik, hogy a felhasználó melyik adathalmazt
  // látja, és a szám egyezik-e a CHANGELOG.md legfrissebb bejegyzésével.
  //
  // Régi helyek.json (verzio nélkül) esetén ezt csendben kiírjuk, nem
  // szaladunk meg: az adat jó, csak a jelölés hiányzik. Ha a mező
  // egyáltalán nem lenne a kimenetben, a `verzio` undefined lenne.
  verzio.textContent = `adatverzió ${adat.verzio ?? "ismeretlen"} · ${helyek.length} helység`;
  keres();
}

betolt().catch((e) => {
  talalat.style.display = "none";
  szures.textContent =
    "Nem sikerült betölteni a helységeket. Futtasd a `node letolt.mjs`-t, " +
    "és nyisd meg az oldalt egy kiszolgálón (python3 -m http.server).";
  console.error(e);
});
