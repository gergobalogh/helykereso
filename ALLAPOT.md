# ALLAPOT — hol tartunk, mi maradt

Ez a fájl a munkamenet végállapotát rögzíti, hogy onnan lehessen folytatni.
A **miért**-ek a [`kutatas.md`](kutatas.md)-ben vannak (kutatási napló, a
megerősített hibákkal és a mérési számokkal); a **hogyan** a
[`README.md`](README.md)-ben (a kód használata); itt csak a folytatáshoz
szükséges tények állnak.

**Utolsó frissítés: 2026-10-08.**

## Ahol tartunk

Négy commit, `master` ágon, **nincs remote** — tehát semmi nincs feltöltve
sehová. A munkafa tiszta.

| commit | tartalom |
|---|---|
| `d6a2455` | a névelőrző szabályok közös helyre (`szabalyok.mjs`), 5 új ellenőrzés |
| `df937fe` | a hamis német nevek kiszűrése (135 → 130 valódi) |
| `035f701` | a 77 magyar név megmérése: a KIA sem tud magyar nevet adni |
| `11281e4` | **a nev alapú dedup 93 valós falut törölt ki** (3074 → 3167) |
| `350c52a` | az ellenőrző duplikátum-szűrése is hibás volt: 9 valós párt rejtett el |

A kettő utóbbi ugyanaz a leképezés két helyen: a `11281e4` a letöltőben, a
`350c52a` az ellenőrzőben. Mindkettőben a megye rossz helyen volt.

## A jelenlegi adat — ellenőrizve

`helyek.json`: **3167 helység, 9 megye**, 130 valódi német név.

| megye | kód | helység |
|---|---|---|
| Nagy-Albás | AB | 719 |
| Hunyad | HD | 488 |
| Maros | MS | 518 |
| Kolozsvár | CJ | 436 |
| Hargita | HR | 266 |
| Beszterce-Nászád | BN | 252 |
| Szeben | SB | 188 |
| Brassó | BV | 170 |
| Kovászna | CV | 130 |

- 468 helységen a magyar név megegyezik a románnal (nincs magyar exonim — nem hiba)
- 130 német név, mind ellenőrzötten német (nincs román ékezet, nincs perjel)
- **22** néven két valós hely van **ugyanazzal a magyar és román névvel** ugyanabban
  a megyében (ez a szándék; a sorok a községnevükön különböznek). Összesen
  **36** néven oszlik meg két vagy több hely, de a másik 14-ben a magyar nevek
  eltérnek (`Kissebes`/`Bucsum-Pojén`, `Eckentelep`/`Avrămești`) — ezt a
  `README` eleve így tervezte.

### Ellenőrzés: minden zöld

```
node letolt.mjs     → 3167 helység, 549 duplikátum kiszűrve, 75 "több valós hely" eset kilistázva
node ellenoriz.mjs   → 2 hiba, mindkettő tudottan hiányzó (Kézdiszentvincent, Borosjenő)
node proba.mjs      → Minden próba sikerült (a http.server 8123-en fut)
```

A `proba.mjs`-hez kell a szerver: `python3 -m http.server 8123`, utána
`node proba.mjs`. Hibás kilépési kóddal tér vissza.

## Amit nem csináltunk meg, és miért

### A 77 hamis magyar címke — lezárva, de a javítás a Wikidata-n marad

Ezeknél a helyeknél **nincs magyar nevük**. Nem a KIA-tól nem sikerült
kideríteni (az a forrás is üresen hagyja őket), hanem nincs is:

- a magyar Wikipedia 77 cikkének címe is a román név, redirect nincs, alias
  nulla, az infobox `magyar név =` mezője üres;
- a KIA helységnévtárban (371 oldal, `kia.hu/kiakonyvtar/**konyvtar**/erdely/
  erd2002/hnevta02.pdf` — a README korábbi `konyltar` alakja 404) 40-nél üres
  a magyar né mező, 35-nek nincs bejegyzése, a 2 „nevet" adó a másik
  hasámból származó tévedés.

A magyar lakosság 1910 körül olvadt fel, és a forrás nem őrzi a nevüket.

**Ezért nem írunk magyar nevet** (kitalálnánk), **és nem töröljük a hamis
címkét** sem: a lekérdezés `FILTER(LANG(?hu) = "hu")`-val kötelező, tehát a
törlés nem névnéven hagyná a falut, hanem **kitörölné a keresőből**
(3167 → 3090). Ma a felhasználó `Dealu Mare (Kolozsvár)`-t lát, ami románul
is mondható; törlés után „Nincs találat" lenne.

A reális út változatlanul a találatok melletti **javítása** link. A 77
`ismertHibak.json` `huRomanSzo` osztályában van, tehát az ellenőrző nem zúg
rá, csak az **új** elemeket jelzi.

## A nyitott kérdés — a te döntésed

**Láthatóan jelöljük-e a 77-et a felületen?** Most csendben román név
jelenik meg magyar névként. A lehetőségek:

1. **Így hagyjuk** (jelen állapot) — a felhasználó használható nevet kap.
2. **Jelöljük** — pl. a magyar név helyett „nincs magyar neve", vagy apró
   megjelölés a soron. Őszintebb, de a használható nevet elvesszük.
3. **Másold be románul** — a `hu` marad, de a kereső a magyar nevet üresen
   hagyja és a románt mutatja. Ehhez a `keres.js` változik, nem az adat.

Ez termékdöntés, adatpolitika, nem technikai. Nem nyúltam hozzá.

## Amit érdemes lehet folytatni

1. **A 22 néven, ahol két megmaradt helynek a magyar neve is azonos**
   (`Butești`, `Florești`, `Lazuri`, `Hoancă`, `Bogdănești`, `Măgura`,
   `Plai`, `Poieni`, `Runc`…). Ezek a sorok a községnevükön különböznek, de a
   magyar nevük önmagában nem mond semmit — a felhasználó két azonos nevű sort
   lát, és nem tudja, melyik az övé. Lehetne toldalékot („Butești (Mogos
   község)") — a `README` már leírja, hogy erre a célra van a toldalék, és a
   többi ütköző név pont így oldja meg. Ez a dedup-javítás *következménye*,
   nem új hiba.
   Megjegyzés: a 22 pár mindegyike 46 hely, és ezekből **18 párban egyik
   helynek sincs magyar neve** (`hu == ro`, pl. `Botești`, `Poieni`) — tehát
   ez a 77 magyar név problémájának kistestvére, csak nagyobb mértékben.
2. **A visszanyert 93 hely nagy része még „nincs magyar nevük"** (`Poiana`,
   `Lunca`, `Botești`…) — ugyanaz a Wikidata-hiba, mint a 77, csak más
   falvaknál. A 13-at felvettük az `ismertHibak.json`-ba, de a többi
   `hu == ro` (468 hely) nincs listázva, mert az ellenőrző nem tekinti
   hibának (nincs magyar exonim ≠ hiba).
3. **A `place-search` verziózása** a `kutatas.md` végén még nyitott tétel.

## Egyéb tudnivaló

- A KIA PDF és a kiértékelő segédszközok `/tmp/opencode/`-ban vannak
  (`kia.pdf`, `kia.txt`, `kia_entries.json`, `kia-final.mjs`, `kia-77.mjs`).
  Ezek **nem** verziózottak, `/tmp` ugyanis elvész. Ha kellene a későbbiekben,
  a mérés a `kutatas.md`-ben le van írva, de a nyers adat nem.
- A `.cache/` (2.5 MB) nincs verziózva, de megvan: a `node letolt.mjs`
  hálózat nélkül újragenerálja a `helyek.json`-t belőle.
- A `helyek.json` kézi javítása **értéktelen**, a következő `letolt.mjs`
  felülírja. A tartós hely a Wikidata-n van, vagy a `javitasok.json`-ban
  (kézi német nevek) / `ismertHibak.json`-ban (tudott hibák).
- A git commit-okhoz `-c user.name=... -c user.email=...` kell, nincs
  beállított git-identitás.
- Az első `proba.mjs` regressziós tesztjeim közül az egyik csak 1 esetet
  fogott meg 3-ból, mert sorszámot hasonlított konkrét falu helyett. A
  javított változat községnévre néz — ezt emlékeztetőnek írom le, mert
  pontosan ez a „tünetet ellenőrizz, ne az állítást" hiba volt.

## Gyors ellenőrzés, ha újraolvasnád ezt

Három parancs, és mindent tudsz:

```bash
node letolt.mjs      # újragenerálja a helyek.json-t a .cache/-ből
node ellenoriz.mjs    # az adat ellenőrzése — 2 hiba a várt
python3 -m http.server 8123 & node proba.mjs   # a valódi böngészőben
```