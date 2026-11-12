#!/usr/bin/env node

// Statikus, keresőrobotok által JavaScript nélkül is olvasható megyeoldalak.
// Futtatás adatfrissítés után: node seo.mjs
// Élesítéskor az abszolút sitemaphez:
//   node seo.mjs --site-url https://pelda.hu/helynevkereso/

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { helyUtak } from "./helyut.mjs";

const adat = JSON.parse(await readFile(new URL("./helyek.min.json", import.meta.url), "utf8"));
const kimenet = new URL("./megyek/", import.meta.url);
const siteUrlIndex = process.argv.indexOf("--site-url");
const siteUrlErtek = siteUrlIndex >= 0 ? process.argv[siteUrlIndex + 1] : null;
if (siteUrlIndex >= 0 && !siteUrlErtek) throw new Error("A --site-url után add meg az éles webcímet.");

let alap = null;
if (siteUrlErtek) {
  alap = new URL(siteUrlErtek);
  if (!/^https?:$/.test(alap.protocol)) throw new Error("A --site-url csak http vagy https cím lehet.");
  if (!alap.pathname.endsWith("/")) alap.pathname += "/";
  alap.search = "";
  alap.hash = "";
}
const orszagNev = {
  RO: "Románia",
  HU: "Magyarország",
  UA: "Ukrajna",
  RS: "Szerbia",
};

function html(ertek) {
  return String(ertek).replace(
    /[&<>"']/g,
    (karakter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[karakter],
  );
}

function teruletNev(megye) {
  if (megye.fajta === null) return megye.hu;
  return `${megye.hu} ${megye.fajta ?? "megye"}`;
}

function slug(megye) {
  return megye.kod.toLocaleLowerCase("hu-HU");
}

function oldalFej({ cim, leiras, kanonikus, jsonLd, gyoker = "../" }) {
  const kepUrl = alap ? new URL("og-image.png", alap).href : "";
  const abszolutMeta = alap && /^https?:\/\//.test(kanonikus)
    ? `
    <meta property="og:url" content="${html(kanonikus)}" />
    <meta property="og:image" content="${html(kepUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Helynévkereső – erdélyi helységnevek egy helyen" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${html(kepUrl)}" />`
    : `
    <meta name="twitter:card" content="summary" />`;
  return `<!doctype html>
<html lang="hu">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${html(cim)}</title>
    <meta name="description" content="${html(leiras)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="theme-color" content="#f5f2eb" />
    <link rel="canonical" href="${html(kanonikus)}" />
    <link rel="icon" href="${gyoker}favicon.svg" type="image/svg+xml" sizes="any" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="hu_HU" />
    <meta property="og:site_name" content="Helynévkereső" />
    <meta property="og:title" content="${html(cim.replace(" | Helynévkereső", ""))}" />
    <meta property="og:description" content="${html(leiras)}" />${abszolutMeta}
    <script defer src="https://umami.gergobalogh.me/stats.js" data-website-id="1c1e686f-f926-434d-9e6e-a2a5e3971df6"></script>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
    <style>
      :root{--papir:#f5f2eb;--lap:#fffefb;--tinta:#292522;--halvany:#716a62;--vonal:#e4ded3;--bordo:#813b3b}
      *{box-sizing:border-box}body{margin:0;background:var(--papir);color:var(--tinta);font:16px/1.6 Georgia,"Times New Roman",serif}
      main{width:min(940px,calc(100% - 32px));margin:auto;padding:40px 0 72px}a{color:var(--bordo)}
      .vissza{display:inline-block;margin-bottom:24px;font-size:.9rem}.szemoldok{margin:0 0 8px;color:var(--bordo);font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      h1{max-width:17em;margin:0;font-size:clamp(2rem,7vw,3.8rem);line-height:1.04;letter-spacing:-.025em}header>p:last-child{max-width:48em;color:var(--halvany)}
      .racs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:28px 0 0;padding:0;list-style:none}
      .kartya,.hely{border:1px solid var(--vonal);border-radius:10px;background:var(--lap)}.kartya a{display:block;padding:16px;text-decoration:none}.kartya a:hover{border-radius:10px;background:#f8f3eb}
      .kartya strong,.hely strong{font-size:1.08rem}.szam,.nevek{display:block;color:var(--halvany);font-size:.86rem}
      .helyek{display:grid;gap:8px;margin:28px 0 0;padding:0;list-style:none}.hely{padding:12px 15px}.hely>a{text-decoration:none}.hely>a:hover{text-decoration:underline}.forras{margin-left:7px;font-size:.78rem}
      footer{margin-top:42px;padding-top:18px;border-top:1px solid #cfc5b6;color:var(--halvany);font-size:.86rem}
      .morzsa{margin-bottom:24px;font-size:.9rem;color:var(--halvany)}
      .nevlista{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:24px 0 0;padding:18px 20px;border:1px solid var(--vonal);border-radius:10px;background:var(--lap)}
      .nevlista dt{color:var(--halvany)}.nevlista dd{margin:0;font-size:1.25rem;font-weight:700}
      .megjegyzes{color:var(--halvany);font-size:.9rem}h2{margin:36px 0 0;font-size:1.3rem}
      .szomszedok{display:grid;gap:6px;margin:14px 0 0;padding:0;list-style:none}.szomszedok span{color:var(--halvany);font-size:.86rem}
      .linkek{margin-top:32px}
      @media(min-width:720px){.helyek,.szomszedok{grid-template-columns:1fr 1fr}}
    </style>
  </head>
  <body>
    <main>`;
}

function oldalLab(gyoker = "../") {
  return `
      <footer>
        <a href="${gyoker}">Helynévkereső</a> · Adatok: <a href="https://www.wikidata.org/">Wikidata</a> (CC0)
      </footer>
    </main>
  </body>
</html>
`;
}

await mkdir(kimenet, { recursive: true });
const utak = helyUtak(adat.helyek);

const csoportok = new Map(adat.megyek.map((megye) => [megye.kod, []]));
for (const hely of adat.helyek) csoportok.get(hely.megye)?.push(hely);
for (const helyek of csoportok.values()) {
  helyek.sort((a, b) => a.hu.localeCompare(b.hu, "hu-HU"));
}

const megyek = [...adat.megyek].sort((a, b) =>
  teruletNev(a).localeCompare(teruletNev(b), "hu-HU"),
);
const kartyaLista = megyek
  .map((megye) => {
    const darab = csoportok.get(megye.kod).length;
    return `        <li class="kartya"><a href="./${slug(megye)}"><strong>${html(teruletNev(megye))}</strong><span class="szam">${darab.toLocaleString("hu-HU")} helység · ${html(orszagNev[megye.orszag] ?? megye.orszag)}</span></a></li>`;
  })
  .join("\n");

const indexCim = "Megyék és régiók helységnevei | Helynévkereső";
const indexLeiras = `${adat.helyek.length.toLocaleString("hu-HU")} erdélyi, partiumi, bánsági, kárpátaljai és határ menti helység magyar, román és német neve, megyék szerint.`;
const indexLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Megyék és régiók helységnevei",
  description: indexLeiras,
  inLanguage: "hu",
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: adat.megyek.length,
  },
};
await writeFile(
  new URL("index.html", kimenet),
  `${oldalFej({ cim: indexCim, leiras: indexLeiras, kanonikus: alap ? new URL("megyek/", alap).href : "./", jsonLd: indexLd })}
      <a class="vissza" href="../">← Vissza a keresőhöz</a>
      <header>
        <p class="szemoldok">Böngészhető helységnévtár</p>
        <h1>Megyék és régiók</h1>
        <p>${html(indexLeiras)} Válassz területet, vagy használd a <a href="../">gyors keresőt</a>.</p>
      </header>
      <ul class="racs">
${kartyaLista}
      </ul>${oldalLab()}`,
);

for (const megye of megyek) {
  const helyek = csoportok.get(megye.kod);
  const nev = teruletNev(megye);
  const cim = `${nev} helységnevei | Helynévkereső`;
  const leiras = `${nev} ${helyek.length.toLocaleString("hu-HU")} helységének magyar, román és német neve, kereshető forrásokkal és térképes adatokkal.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${nev} helységnevei`,
    description: leiras,
    inLanguage: "hu",
    dateModified: adat.generatas.slice(0, 10),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: helyek.length,
    },
  };
  const lista = helyek
    .map((hely) => {
      const masNevek = [];
      if (hely.ro && hely.ro !== hely.hu) masNevek.push(`románul: ${hely.ro}`);
      if (hely.de && hely.de !== hely.hu) masNevek.push(`németül: ${hely.de}`);
      // A további német nevek (4.0.0, a KIA-ból). Egy soron nem férnek
      // el, és a megyejegyzék a keresőrobotoknak szól — ott a
      // kereshetetlenség számít, nem a tördelés.
      for (const tovabb of hely.deAlt ?? []) {
        if (tovabb !== hely.hu) masNevek.push(`németül: ${tovabb}`);
      }
      const hianyJelzes = hely.huNincsNeve || hely.huPotolt ? " · magyar név nem ismert" : "";
      const forras = /^Q\d+$/.test(hely.q)
        ? ` <a class="forras" href="https://www.wikidata.org/wiki/${hely.q}" rel="nofollow">forrás</a>`
        : "";
      return `        <li class="hely" id="${html(hely.q)}"><a href="../${html(utak.get(hely.q))}"><strong>${html(hely.hu)}</strong></a>${forras}<span class="nevek">${html(masNevek.join(" · ") + hianyJelzes) || "Magyar név"}</span></li>`;
    })
    .join("\n");
  await writeFile(
    new URL(`${slug(megye)}.html`, kimenet),
    `${oldalFej({ cim, leiras, kanonikus: alap ? new URL(`megyek/${slug(megye)}`, alap).href : `./${slug(megye)}`, jsonLd })}
      <a class="vissza" href="./">← Minden megye és régió</a>
      <header>
        <p class="szemoldok">${html(orszagNev[megye.orszag] ?? megye.orszag)} · helységnévtár</p>
        <h1>${html(nev)} helységnevei</h1>
        <p>${html(leiras)} Egy helyre kattintva az oldala nyílik meg, vagy <a href="../?megye=${html(megye.kod)}">nézd meg a megyét a térképes keresőben</a>.</p>
      </header>
      <ol class="helyek">
${lista}
      </ol>${oldalLab()}`,
  );
}

// Egy oldal minden helynek: `hely/<megye>/<név>.html`, a Cloudflare
// kiterjesztés nélkül szolgálja ki (`/hely/ms/szoverd`). Erre keresnek rá
// az emberek: „Szövérd románul", „Sovata magyar neve".
const MAS_NYELV = { UA: "Ukránul", RS: "Szerbül" };
const megyeKod = new Map(adat.megyek.map((megye) => [megye.kod, megye]));
const koordinatas = adat.helyek.filter((hely) => Number.isFinite(hely.lat) && Number.isFinite(hely.lon));
const kozsegTagok = new Map();
for (const hely of adat.helyek) {
  if (!hely.kozseg) continue;
  if (!kozsegTagok.has(hely.kozseg)) kozsegTagok.set(hely.kozseg, []);
  kozsegTagok.get(hely.kozseg).push(hely);
}
for (const tagok of kozsegTagok.values()) tagok.sort((a, b) => a.hu.localeCompare(b.hu, "hu-HU"));

function tavolsag(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function nevSor(hely) {
  const mas = [];
  if (hely.alt && MAS_NYELV[hely.orszag] && hely.alt !== hely.hu) mas.push(hely.alt);
  else if (hely.ro && hely.ro !== hely.hu) mas.push(hely.ro);
  if (hely.de && hely.de !== hely.hu) mas.push(hely.de);
  return mas.join(" · ");
}

function helyLink(hely, gyoker, extra = "") {
  const nev = hely.utalo ? `${hely.hu} (${hely.utalo})` : hely.hu;
  const mas = nevSor(hely);
  return `<li><a href="${gyoker}${html(utak.get(hely.q))}">${html(nev)}</a>${mas || extra ? ` <span>${html([mas, extra].filter(Boolean).join(" · "))}</span>` : ""}</li>`;
}

await rm(new URL("./hely/", import.meta.url), { recursive: true, force: true });
for (const hely of adat.helyek) {
  const ut = utak.get(hely.q);
  const gyoker = "../../";
  const megye = megyeKod.get(hely.megye);
  const terulet = megye ? teruletNev(megye) : hely.megye;
  const orszag = orszagNev[hely.orszag] ?? hely.orszag;
  const nev = hely.utalo ? `${hely.hu} (${hely.utalo})` : hely.hu;
  const ro = hely.ro && hely.ro !== hely.hu ? hely.ro : null;
  const alt = hely.alt && hely.alt !== hely.hu && hely.alt !== hely.ro ? hely.alt : null;
  const altCimke = MAS_NYELV[hely.orszag] ?? "Helyi neve";
  // Határon túl a helyi nyelv (ukrán, szerb) a fő kérdés, Romániában és
  // Magyarországon a román.
  const elso = alt && MAS_NYELV[hely.orszag] ? ["alt", alt] : ro ? ["ro", ro] : alt ? ["alt", alt] : null;
  const de = hely.de && hely.de !== hely.hu ? hely.de : null;
  const deAlt = (hely.deAlt ?? []).filter((tovabb) => tovabb !== hely.hu && tovabb !== hely.de);
  const huIsmeretlen = hely.huNincsNeve || hely.huPotolt;

  const sorok = [];
  if (!huIsmeretlen) sorok.push(["Magyarul", hely.hu]);
  if (elso?.[0] === "alt") sorok.push([altCimke, alt]);
  if (ro) sorok.push(["Románul", ro]);
  if (alt && elso?.[0] !== "alt") sorok.push([altCimke, alt]);
  if (de) sorok.push(["Németül", de]);
  if (deAlt.length) sorok.push([deAlt.length > 1 ? "Más német nevei" : "Más német neve", deAlt.join(", ")]);

  let cim;
  if (elso?.[0] === "ro") cim = `${hely.hu} románul: ${ro}`;
  else if (elso) cim = `${hely.hu} ${(MAS_NYELV[hely.orszag] ?? "helyi nyelven").toLowerCase()}: ${alt}`;
  else if (de) cim = `${hely.hu} németül: ${de}`;
  else cim = `${hely.hu}, ${terulet}`;
  if (elso && de && `${cim}, németül: ${de} | Helynévkereső`.length <= 70) cim += `, németül: ${de}`;
  if (hely.utalo && !cim.includes(hely.utalo)) cim = cim.replace(hely.hu, nev);
  cim += " | Helynévkereső";

  const leirasReszek = [`${nev}, ${terulet}${hely.orszag === "RO" ? "" : ` (${orszag})`}`];
  if (elso?.[0] === "alt") leirasReszek.push(`${altCimke.toLowerCase()} ${alt}`);
  if (ro) leirasReszek.push(`románul ${ro}`);
  if (de) leirasReszek.push(`németül ${de}`);
  const leiras = `${leirasReszek.join(", ")}.${hely.kozsegNev ? ` ${hely.kozsegNev}.` : ""} A környékbeli helységek nevei is.`;

  const kozsegben = (kozsegTagok.get(hely.kozseg) ?? []).filter((masik) => masik.q !== hely.q);
  const kozsegQ = new Set(kozsegben.map((masik) => masik.q));
  let kozel = [];
  if (Number.isFinite(hely.lat) && Number.isFinite(hely.lon)) {
    kozel = koordinatas
      .filter((masik) => masik.q !== hely.q && !kozsegQ.has(masik.q))
      .map((masik) => [masik, tavolsag(hely, masik)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8);
  }

  const kanonikus = alap ? new URL(ut, alap).href : `./${ut.split("/").pop()}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: nev,
    alternateName: [ro, alt, de, ...deAlt].filter(Boolean),
    containedInPlace: { "@type": "AdministrativeArea", name: terulet },
    inLanguage: "hu",
    sameAs: [hely.wikidata, hely.wikipedia].filter(Boolean),
  };
  if (alap) jsonLd.url = kanonikus;
  if (Number.isFinite(hely.lat)) jsonLd.geo = { "@type": "GeoCoordinates", latitude: hely.lat, longitude: hely.lon };

  const kereso = new URLSearchParams({ q: hely.hu, megye: hely.megye });
  const linkek = [`<a href="${gyoker}?${html(kereso)}">Megnézem a térképes keresőben</a>`];
  if (Number.isFinite(hely.lat)) {
    linkek.push(`<a href="https://www.openstreetmap.org/?mlat=${hely.lat}&amp;mlon=${hely.lon}#map=14/${hely.lat}/${hely.lon}" rel="nofollow">OpenStreetMap</a>`);
  }
  if (hely.wikipedia) linkek.push(`<a href="${html(hely.wikipedia)}">Wikipedia</a>`);
  if (/^Q\d+$/.test(hely.q)) {
    linkek.push(`<a href="https://www.wikidata.org/wiki/${hely.q}" rel="nofollow">Wikidata</a>`);
    linkek.push(`<a href="https://www.wikidata.org/wiki/${hely.q}?action=edit&amp;uselang=hu" rel="nofollow">hibát látok, javítom</a>`);
  }

  const fajl = new URL(`./${ut}.html`, import.meta.url);
  await mkdir(new URL("./", fajl), { recursive: true });
  await writeFile(
    fajl,
    `${oldalFej({ cim, leiras, kanonikus, jsonLd, gyoker })}
      <nav class="morzsa"><a href="${gyoker}">Helynévkereső</a> › <a href="${gyoker}megyek/${slug(megye ?? { kod: hely.megye })}">${html(terulet)}</a></nav>
      <header>
        <p class="szemoldok">${html(terulet)} · ${html(orszag)}</p>
        <h1>${html(nev)}</h1>
      </header>
      <dl class="nevlista">
${sorok.map(([cimke, ertek]) => `        <dt>${html(cimke)}</dt><dd>${html(ertek)}</dd>`).join("\n")}
      </dl>
${huIsmeretlen ? `      <p class="megjegyzes">A magyar nevét nem ismerjük, ezért itt a helyi neve áll.</p>\n` : ""}${hely.kozsegNev ? `      <p>${html(hely.kozsegNev)}, ${html(terulet)}.</p>\n` : ""}${kozsegben.length ? `      <h2>Ugyanebben a községben</h2>
      <ul class="szomszedok">
${kozsegben.slice(0, 40).map((masik) => `        ${helyLink(masik, gyoker)}`).join("\n")}
      </ul>
` : ""}${kozel.length ? `      <h2>A közelben</h2>
      <ul class="szomszedok">
${kozel.map(([masik, km]) => `        ${helyLink(masik, gyoker, km < 1 ? "1 km-en belül" : `${Math.round(km)} km`)}`).join("\n")}
      </ul>
` : ""}      <p class="linkek">${linkek.join(" · ")}</p>${oldalLab(gyoker)}`,
  );
}

if (siteUrlErtek) {
  const terkepUtak = ["", "megyek/", ...adat.megyek.map((megye) => `megyek/${slug(megye)}`), ...utak.values()];
  const utolsoModositas = adat.generatas.slice(0, 10);
  const urlLista = terkepUtak
    .map((ut) => `  <url><loc>${html(new URL(ut, alap).href)}</loc><lastmod>${utolsoModositas}</lastmod></url>`)
    .join("\n");
  await writeFile(
    new URL("./sitemap.xml", import.meta.url),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlLista}\n</urlset>\n`,
  );
  await writeFile(
    new URL("./robots.txt", import.meta.url),
    // A Cloudflare saját blokkja (a fájl tetején) tiltja a Google-Extendedet; a Google a kevésbé szigorú
    // szabályt követi, így ez az Allow engedi a Gemini appok válaszait (tulajdonos, 2026-11-12).
    `User-agent: *\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", alap).href}\n`,
  );

  const foOldalUrl = new URL("./index.html", import.meta.url);
  let foOldal = await readFile(foOldalUrl, "utf8");
  const kepUrl = new URL("og-image.png", alap).href;
  const produkciosMeta = `<!-- production-url-meta:start -->
    <meta property="og:url" content="${html(alap.href)}" />
    <meta property="og:image" content="${html(kepUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Helynévkereső – erdélyi helységnevek egy helyen" />
    <meta name="twitter:image" content="${html(kepUrl)}" />
    <!-- production-url-meta:end -->`;
  foOldal = foOldal
    .replace(/<link rel="canonical" href="[^"]+" \/>/, `<link rel="canonical" href="${html(alap.href)}" />`)
    .replace(/<!-- production-url-meta:start -->[\s\S]*?<!-- production-url-meta:end -->/, produkciosMeta)
    .replace('<meta name="twitter:card" content="summary" />', '<meta name="twitter:card" content="summary_large_image" />');
  await writeFile(foOldalUrl, foOldal);
}

console.log(
  `SEO-oldalak: ${adat.megyek.length} terület, ${adat.helyek.length.toLocaleString("hu-HU")} helység (mind saját oldallal)${siteUrlErtek ? ", sitemap.xml elkészült" : ", sitemaphez add meg a --site-url címet"}.`,
);
