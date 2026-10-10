// A kész helységlistát térképadattal gazdagítja.
//
// A Wikidata Action API-ját használjuk, nem a gyakrabban túlterhelt SPARQL
// végpontot: 50 Q-azonosító koordinátája és Wikipedia-sitelinkje jön egy
// kérésben. Az eredmény a .cache/terkepadat.json-ban marad, így a következő
// katalógusfrissítés csak az új helyeket kérdezi le.
//
// Önállóan is futtatható a már elkészült adaton:
//   node terkepadat.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "mivelkezdjem.hu helynevekereso (https://mivelkezdjem.hu)";
const CACHE = new URL("./.cache/terkepadat.json", import.meta.url);
const HELYEK = new URL("./helyek.json", import.meta.url);
const HELYEK_MIN = new URL("./helyek.min.json", import.meta.url);
const CSOMAG = 50;
const SZUNET = 200;

const varakozas = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function darabol(lista, meret) {
  const ki = [];
  for (let i = 0; i < lista.length; i += meret) ki.push(lista.slice(i, i + meret));
  return ki;
}

function wikipediaUrl(sitelinks) {
  const oldal = sitelinks?.huwiki ?? sitelinks?.rowiki;
  if (!oldal?.title) return null;
  const nyelv = sitelinks?.huwiki ? "hu" : "ro";
  const cim = encodeURIComponent(oldal.title.replaceAll(" ", "_"));
  return `https://${nyelv}.wikipedia.org/wiki/${cim}`;
}

function koordinata(claims) {
  const allitas = claims?.P625?.find(
    (x) => x.rank !== "deprecated" && x.mainsnak?.snaktype === "value",
  );
  const ertek = allitas?.mainsnak?.datavalue?.value;
  const lat = Number(ertek?.latitude);
  const lon = Number(ertek?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

async function kerdez(qidk) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    formatversion: "2",
    props: "claims|sitelinks",
    sitefilter: "huwiki|rowiki",
    ids: qidk.join("|"),
  });

  let visszavonas = 1000;
  for (let proba = 0; proba < 6; proba++) {
    let valasz;
    let hibaszoveg = "";
    try {
      valasz = await fetch(`${API}?${params}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (proba === 5) throw e;
      await varakozas(visszavonas);
      visszavonas = Math.min(visszavonas * 2, 30_000);
      continue;
    }

    if (valasz.ok) {
      const json = await valasz.json();
      if (!json.error) return json.entities ?? {};
      hibaszoveg = `${json.error.code ?? "API-hiba"}: ${json.error.info ?? "ismeretlen hiba"}`;
    } else {
      hibaszoveg = (await valasz.text()).slice(0, 160);
    }

    if (proba === 5) {
      throw new Error(`Wikidata API: HTTP ${valasz.status} — ${hibaszoveg}`);
    }
    const retryFejlec = valasz.headers.get("retry-after");
    const retryAfter = retryFejlec === null ? NaN : Number(retryFejlec);
    await varakozas(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : visszavonas);
    visszavonas = Math.min(visszavonas * 2, 30_000);
  }
  throw new Error("A Wikidata API nem válaszolt");
}

export async function gazdagitTerkepAdattal(helyek, { cacheUrl = CACHE } = {}) {
  await mkdir(new URL("./", cacheUrl), { recursive: true });
  const cache = existsSync(cacheUrl)
    ? JSON.parse(await readFile(cacheUrl, "utf8"))
    : {};
  const hianyzo = [...new Set(
    helyek
      .map((h) => h.q)
      .filter((q) => typeof q === "string" && /^Q\d+$/.test(q) && !Object.hasOwn(cache, q)),
  )];

  if (hianyzo.length) {
    console.log(`Térképadat: ${hianyzo.length} új Wikidata-elem (${helyek.length - hianyzo.length} cache-ből)`);
  }
  const csomagok = darabol(hianyzo, CSOMAG);
  for (const [i, qidk] of csomagok.entries()) {
    const entitasok = await kerdez(qidk);
    for (const q of qidk) {
      const entitas = entitasok[q];
      const pont = koordinata(entitas?.claims);
      cache[q] = {
        lat: pont?.lat ?? null,
        lon: pont?.lon ?? null,
        wikipedia: wikipediaUrl(entitas?.sitelinks),
      };
    }
    await writeFile(cacheUrl, JSON.stringify(cache));
    console.log(`  ✓ ${Math.min((i + 1) * CSOMAG, hianyzo.length)}/${hianyzo.length}`);
    if (i + 1 < csomagok.length) await varakozas(SZUNET);
  }

  let koordinatas = 0;
  let wikipedias = 0;
  for (const h of helyek) {
    delete h.lat;
    delete h.lon;
    delete h.wikipedia;
    const adat = cache[h.q];
    if (Number.isFinite(adat?.lat) && Number.isFinite(adat?.lon)) {
      h.lat = adat.lat;
      h.lon = adat.lon;
      koordinatas++;
    }
    if (typeof adat?.wikipedia === "string") {
      h.wikipedia = adat.wikipedia;
      wikipedias++;
    }
  }
  console.log(`Térképadat kész: ${koordinatas} koordináta, ${wikipedias} Wikipedia-link.`);
  return helyek;
}

async function main() {
  const adat = JSON.parse(await readFile(HELYEK, "utf8"));
  if (!Array.isArray(adat.helyek)) throw new Error("A helyek.json formátuma hibás");
  await gazdagitTerkepAdattal(adat.helyek);
  await writeFile(HELYEK, JSON.stringify(adat, null, 1));
  await writeFile(HELYEK_MIN, JSON.stringify(adat));
}

const kozvetlenFuttatas = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (kozvetlenFuttatas) {
  main().catch((e) => {
    console.error(`Nem sikerült a térképadat: ${e.message}`);
    process.exit(1);
  });
}
