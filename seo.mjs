#!/usr/bin/env node

// Statikus, keresőrobotok által JavaScript nélkül is olvasható megyeoldalak.
// Futtatás adatfrissítés után: node seo.mjs
// Élesítéskor az abszolút sitemaphez:
//   node seo.mjs --site-url https://pelda.hu/helynevkereso/

import { mkdir, readFile, writeFile } from "node:fs/promises";

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

function oldalFej({ cim, leiras, kanonikus, jsonLd }) {
  const abszolutMeta = /^https?:\/\//.test(kanonikus)
    ? `
    <meta property="og:url" content="${html(kanonikus)}" />
    <meta property="og:image" content="${html(new URL("../og-image.png", kanonikus).href)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Helynévkereső – erdélyi helységnevek egy helyen" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${html(new URL("../og-image.png", kanonikus).href)}" />`
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
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" sizes="any" />
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
      @media(min-width:720px){.helyek{grid-template-columns:1fr 1fr}}
    </style>
  </head>
  <body>
    <main>`;
}

function oldalLab() {
  return `
      <footer>
        <a href="../">Helynévkereső</a> · Adatok: <a href="https://www.wikidata.org/">Wikidata</a> (CC0)
      </footer>
    </main>
  </body>
</html>
`;
}

await mkdir(kimenet, { recursive: true });

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
    return `        <li class="kartya"><a href="./${slug(megye)}.html"><strong>${html(teruletNev(megye))}</strong><span class="szam">${darab.toLocaleString("hu-HU")} helység · ${html(orszagNev[megye.orszag] ?? megye.orszag)}</span></a></li>`;
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
      const keresesiUrl = new URLSearchParams({ q: hely.hu, megye: megye.kod });
      const masNevek = [];
      if (hely.ro && hely.ro !== hely.hu) masNevek.push(`románul: ${hely.ro}`);
      if (hely.de && hely.de !== hely.hu) masNevek.push(`németül: ${hely.de}`);
      const hianyJelzes = hely.huNincsNeve || hely.huPotolt ? " · magyar név nem ismert" : "";
      const forras = /^Q\d+$/.test(hely.q)
        ? ` <a class="forras" href="https://www.wikidata.org/wiki/${hely.q}" rel="nofollow">forrás</a>`
        : "";
      return `        <li class="hely" id="${html(hely.q)}"><a href="../?${html(keresesiUrl)}"><strong>${html(hely.hu)}</strong></a>${forras}<span class="nevek">${html(masNevek.join(" · ") + hianyJelzes) || "Magyar név"}</span></li>`;
    })
    .join("\n");
  await writeFile(
    new URL(`${slug(megye)}.html`, kimenet),
    `${oldalFej({ cim, leiras, kanonikus: alap ? new URL(`megyek/${slug(megye)}.html`, alap).href : `./${slug(megye)}.html`, jsonLd })}
      <a class="vissza" href="./">← Minden megye és régió</a>
      <header>
        <p class="szemoldok">${html(orszagNev[megye.orszag] ?? megye.orszag)} · helységnévtár</p>
        <h1>${html(nev)} helységnevei</h1>
        <p>${html(leiras)} Egy helyet kiválasztva a <a href="../?megye=${html(megye.kod)}">térképes kereső</a> nyílik meg.</p>
      </header>
      <ol class="helyek">
${lista}
      </ol>${oldalLab()}`,
  );
}

if (siteUrlErtek) {
  const utak = ["", "megyek/", ...adat.megyek.map((megye) => `megyek/${slug(megye)}.html`)];
  const utolsoModositas = adat.generatas.slice(0, 10);
  const urlLista = utak
    .map((ut) => `  <url><loc>${html(new URL(ut, alap).href)}</loc><lastmod>${utolsoModositas}</lastmod></url>`)
    .join("\n");
  await writeFile(
    new URL("./sitemap.xml", import.meta.url),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlLista}\n</urlset>\n`,
  );
  await writeFile(
    new URL("./robots.txt", import.meta.url),
    `User-agent: *\nAllow: /\nSitemap: ${new URL("sitemap.xml", alap).href}\n`,
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
  `SEO-oldalak: ${adat.megyek.length} terület, ${adat.helyek.length.toLocaleString("hu-HU")} helység${siteUrlErtek ? ", sitemap.xml elkészült" : ", sitemaphez add meg a --site-url címet"}.`,
);
