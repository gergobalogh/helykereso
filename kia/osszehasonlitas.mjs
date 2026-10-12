// A KIA és a mi adatunk összevetése — a "melyik a jobb helységnévtár"
// kérdés mérőszáma, nem vélemény.
//
//   node kia/osszehasonlitas.mjs
//
// Ez semmit nem ír, csak kiír. A mérés a `helyek.json` ROMÁNIAI soraira
// szűkül, mert a KIA is csak Romániát fedi le — a határon túli (UA, HU,
// RS) 1266 helyünk nincs versenytársa, és nem is fair lenne számolni
// velük.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITT = dirname(fileURLToPath(import.meta.url));
const olvas = (p) => JSON.parse(readFileSync(p, "utf8"));

const { helyek, megyek } = olvas(join(ITT, "..", "helyek.json"));
const KIA = olvas(join(ITT, "raw.json"));

function hajtas(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[şŞ]/gu, "s")
    .replace(/[ţŢ]/gu, "t")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/gu, "")
    .replace(/\s+/gu, "");
}

const kodOf = new Map(megyek.filter((m) => m.orszag === "RO").map((m) => [hajtas(m.ro), m.kod]));
const nevOf = new Map(megyek.map((m) => [m.kod, m.hu]));

// ── 1. Darabszám ────────────────────────────────────────────────────────────
const kiaCount = (() => {
  const c = new Map();
  for (const k of KIA) {
    const kod = kodOf.get(hajtas(k.megye));
    if (!kod) continue;
    c.set(kod, (c.get(kod) ?? 0) + 1);
  }
  return c;
})();
const enCount = (() => {
  const c = new Map();
  for (const h of helyek) if (h.orszag === "RO") c.set(h.megye, (c.get(h.megye) ?? 0) + 1);
  return c;
})();

const sor = (c) => String(c).padStart(5);
const fej = (s, n) => String(s).padEnd(n);

console.log("\nDARABSZÁM (romániai megyék)");
console.log("=".repeat(58));
console.log(fej("megye", 22) + "  " + fej("KIA", 5) + fej("MI", 5) + fej("eltérés", 9));
console.log("-".repeat(58));
let tk = 0;
let te = 0;
for (const m of [...megyek].filter((x) => x.orszag === "RO").sort((a, b) => (enCount.get(b.kod) ?? 0) - (enCount.get(a.kod) ?? 0))) {
  const k = kiaCount.get(m.kod) ?? 0;
  const e = enCount.get(m.kod) ?? 0;
  tk += k;
  te += e;
  console.log(fej(m.hu, 22) + sor(k) + sor(e) + " " + fej(e - k > 0 ? `+${e - k}` : e - k, 9));
}
console.log("-".repeat(58));
console.log(
  fej("ÖSSZESEN", 22) + sor(tk) + sor(te) + " " + fej(te - tk > 0 ? `+${te - tk}` : te - tk, 9),
);

// ── 2. Névkincs ─────────────────────────────────────────────────────────────
// Ez a lényeg: nem az, hány hely van, hanem hogy egy helyről hány nevet
// tudunk mondani.
const roKia = KIA.filter((k) => kodOf.get(hajtas(k.megye)));
const tortenet = (mezo) => mezo.split(/[,;]/u).filter((x) => x.trim()).length;

const kiaHuTort = roKia.reduce((n, k) => n + tortenet(k.hu), 0);
const kiaTortSor = roKia.filter((k) => tortenet(k.hu) > 1).length;
const miTort = helyek.filter((h) => h.orszag === "RO").reduce((n, h) => n + (h.hu ? 1 : 0), 0);

const kiaDe = roKia.filter((k) => k.de.trim()).length;
const miDe = helyek.filter((h) => h.orszag === "RO" && h.de).length;
const kiaVar = roKia.filter((k) => k.vari.trim()).length;
const miVar = 0; // nálunk nincs ilyen mező

console.log("\nNÉVKINCS (romániai rész)");
console.log("=".repeat(58));
const sor2 = (c) => String(c).padStart(8);
const fej2 = (s) => String(s).padEnd(42);
console.log(fej2("") + sor2("KIA") + sor2("MI"));
console.log("-".repeat(58));
console.log(fej2("helység") + sor2(roKia.length) + sor2(te));
console.log(fej2("magyar névtöredék") + sor2(kiaHuTort) + sor2(miTort));
console.log(fej2("1-nél több magyar nevű sor") + sor2(kiaTortSor) + sor2(0));
console.log(fej2("német nevet ad") + sor2(kiaDe) + sor2(miDe));
console.log(fej2("román név-változatot ad") + sor2(kiaVar) + sor2(miVar));
console.log(fej2("koordinátája van") + sor2(0) + sor2(helyek.filter((h) => h.lat).length));
console.log(fej2("forrása van (Wikidata/Wikipedia)") + sor2(0) + sor2(helyek.filter((h) => h.wikidata).length));

// ── 3. Amit őnként kínál, mi nem tartunk ───────────────────────────────────
// A KIA százaléka a helyeink közül, nem a saját sorszámának része — így ez
// a "mennyi veszteséget okozunk" mérőszáma.
const n = JSON.parse(readFileSync(join(ITT, "nemet-nevek.json"), "utf8"));
const mh = JSON.parse(readFileSync(join(ITT, "magyar-nevek.json"), "utf8"));
const rv = JSON.parse(readFileSync(join(ITT, "roman-valtozatok.json"), "utf8"));
const nt = JSON.parse(readFileSync(join(ITT, "nem-talalt.json"), "utf8"));
const osszhelyunk = helyek.filter((h) => h.orszag === "RO").length;

const szaz = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
console.log("\nAMIT ŐNKÉNT KÍNÁL, ÉS MI NEM TARTUNK");
console.log("=".repeat(58));
console.log("  " + fej2("német nevet kapott hely") + sor2(n.osszes) + "  " + szaz(n.osszes, osszhelyunk));
console.log("  " + fej2("  ebből nincs a Wikidata-n") + sor2(n.uj) + "  " + szaz(n.uj, osszhelyunk));
console.log("  " + fej2("  már van, csak más írásmód") + sor2(n.marad_irasmod));
console.log("  " + fej2("  már van, de valós eltérés") + sor2(n.marad_valos));
console.log("  " + fej2("történeti magyar nevet kapott") + sor2(mh.osszes) + "  " + szaz(mh.osszes, osszhelyunk));
console.log("  " + fej2("  ebből magyar névtöredék") + sor2(mh.osszes_tortenet));
console.log("  " + fej2("román név-változatot kapott") + sor2(rv.osszes) + "  " + szaz(rv.osszes, osszhelyunk));
console.log("  " + fej2("  ebből változat") + sor2(rv.osszes_valtozat));
console.log("  " + fej2("hozzánk nem kötött KIA sor") + sor2(nt.osszes));

// ── 4. Amit mi kínálunk, ők nem ─────────────────────────────────────────────
const hatarTul = helyek.filter((h) => h.orszag !== "RO").length;
// A moldviai számhoz a NÉVTELEN megyéjű sorokat ki kell hagyni, különben a
// 8 hibás sor is bekerülne (lásd a `lekapar.mjs` kimenetét).
const moldvaKia = KIA.filter((k) => k.megye && !kodOf.get(hajtas(k.megye))).length;
console.log("\nAMIT MI KÍNÁLUNK, ŐK NEM");
console.log("=".repeat(58));
console.log("  " + fej2("határon túli helység (UA, HU, RS)") + sor2(hatarTul));
console.log("  " + fej2("moldviai sorjuk (Bacău, Iaşi…)") + sor2(moldvaKia));
console.log("  " + fej2("koordináta") + sor2(te) + "  mindegyiken");
console.log("  " + fej2("térkép, forráslink, megosztható URL"));
console.log("  " + fej2("indexelhető statikus megyejegyzék"));
console.log("  " + fej2("verziózott, újragenerálható adat"));
console.log();
