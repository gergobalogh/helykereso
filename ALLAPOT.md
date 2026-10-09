# ALLAPOT — hol tartunk, mi maradt

Ez a fájl a munkamenet végállapotát rögzíti, hogy onnan lehessen folytatni.
A **miért**-ek a [`kutatas.md`](kutatas.md)-ben vannak (kutatási napló, a
megerősített hibákkal és a mérési számokkal); a **hogyan** a
[`README.md`](README.md)-ben (a kód használata); itt csak a folytatáshoz
szükséges tények állnak.

**Utolsó frissítés: 2026-10-09 (3. munkamenet). Adatverzió: 1.1.0.**

## Ahol tartunk

`master` ágon, **nincs remote** — tehát semmi nincs feltöltve sehová.

| commit | tartalom |
|---|---|
| `d6a2455` | a névelőrző szabályok közös helyre (`szabalyok.mjs`), 5 új ellenőrzés |
| `df937fe` | a hamis német nevek kiszűrése (135 → 130 valódi) |
| `035f701` | a 77 magyar név megmérése: a KIA sem tud magyar nevet adni |
| `11281e4` | **a nev alapú dedup 93 valós falut törölt ki** (3074 → 3167) |
| `350c52a` | az ellenőrző duplikátum-szűrése is hibás volt: 9 valós párt rejtett el |
| `3d2dbbe` | az eddigi munkamenet összefoglalója |
| `06e85da` | **a megkülönböztető toldalék a 36 ütköző névre (76 hely)** |
| `8f91c99` | **az adatverzió a footerben**, és a `helyek.min.json` ellenőrzése |
| `f2af276` | **a 93 visszanyert hely magyar nevének mérése**, `javitasokHu.json`, a „nincs magyar neve" jelölés (121 hely) |

A kettő utóbbi commit ugyanaz a leképezés két helyen: a `11281e4` a
letöltőben, a `350c52a` az ellenőrzőben. Mindkettőben a megye rossz helyen
volt.

### A 2. munkamenetben: a megkülönböztető toldalék

Az „Amit érdemes folytatni" 1. pontja kész. A 22 (a mérés pontosan 36)
azonos nevű hely most `Butești (Mogos község)` alakban jelenik meg, tehát a
magyar nevéhez odakerül a szülő községe, a sor elején.

- `letolt.mjs`: az új `utalo` mező, a szabály `szabalyok.mjs`-ben
- `keres.js`: a toldalék megjelenik a néven, és **kereshető is**
  (`Butești Mogos` → 1 találat, a Mogos községi)
- `ellenoriz.mjs`: ellenőrzi, hogy a toldalék egyezik-e a szabállyal, és
  különböztet-e; a kiírás végén a "hány új hiba" is külön számot kap, és
  a kilépési kód is ezt tükrözi
- `proba.mjs`: böngészős próba a megjelenésre, a kereshetőségre és a
  kiemelésre

**76 helységnek** van toldaléka, 3091-nek nincs. Nem új adat: a szülő
község neve amúgy is a sor végén volt.

Mellékben találtam és javítottam egy **korábbi összeomlást** az
`ellenoriz.mjs`-ben (a 123. sor): a duplikátum-kiírás `for (const [n, v] of
...)` alakú volt egy olyan listán, aminek elemei sorok, nem `[kulcs, sorok]`
párok. Ezért `v.map` TypeError-t dobott — vagyis épp akkor állt le, amikor
volt hiba, tehát soha. Most kiírja a nevet is.

Leellenőriztem, hogy az új ellenőrzések tényleg buknak: a 76 toldalék
nullázásával az ellenőrző 3 új hibát jelez, a `keres.js` megjelenítésének
kikapcsolásával a böngészős próba 9 hibát.

## Amit a 3. munkamenetben csináltam (a toldalék után)

Három téma zárult le, mindegyik méréssel indult.

### 1. A verziózás — kész

- a `VERZIO` a `szabalyok.mjs`-ben van, onnan kerül a `helyek.json`-ba,
  a `keres.js` a footerben kiírja: „letöltve 2026-10-09 · adatverzió
  1.1.0 · 3167 helység"; a szabály a `CHANGELOG.md`-ben van
- **mellékben találtam egy láthatatlan hibát**: a `keres.js` a
  `helyek.min.json`-t olvassa, nem a `helyek.json`-t, és semmi nem
  hasonlította össze a kettőt. Elcsúszhatnak, és akkor minden ellenőrzés
  zöld, miközben az oldal régebbi adatot mut. Az `ellenoriz.mjs` most szól,
  ha nem egyeznek.

### 2. A visszanyert 93 hely magyar neve — mérve, javítva, és jelölve

A mérés reprodukálta a 93-at (a régi dedup-szabály lejátszva a jelenlegi
`helyek.json`-on pontosan 93 eldobott, valódi hely). Ebből **44** a
`hu == ro`.

- **A 44-ből egyiknek sincs magyar neve** se a KIA-ban, se a magyar
  Wikipedián — ugyanaz az osztály, mint a 77. Nem javítható.
- A mérést kiterjesztve a teljes **468-as `hu == ro`** halmazra: 442-nek van
  KIA-bejegyzése (községre szűkítve — a puszta név 3-4 faluat von össze),
  és **13-nál van magyar név**. Ebből **2 áll két forrásból is** (a magyar
  Wikipedia infoboxa is ugyanazt mondja): `Mănăstire` → **Monostor**,
  `Dumești` → **Dumest**. A többi 11 átírás (`Ránta`, `Bobája`),
  leírás (`Galbina községrész`) vagy másik falu neve volt — ezért a
  szabály a `javitasokHu.json`-ban: **két forrás kell**.
- **Két mérési hiba** menet közben, mind a korábbi tanulság ismétlése: a
  KIA `ş`/`ţ` alakot használ (nem `ș`/`ț`-t), tehát az első mérés **0
  találatot** adott, és majdnem elhittem, hogy mindegyiknek nincs magyar
  neve; és a pont után PDF-jel (`•`) áll, nem whitespace, tehát a
  `\.\s*Név:` regex nem talált. Kalibráció: a KIA kiírja az azonos nevet
  is (38 eset a 1240-ből), tehát az üres magyar mező érdemi jelzés.
- A **jelölés kész**: `nincsMagyarNev.json` (121 Q-szám) →
  `huNincsNeve` mező → apró „nincs magyar neve" jelölés a soron. A **név
  nem változik**, tehát a falu kereshető marad (törlésnél a kötelező
  `hu`-szűrés kitörölné a keresőből).
- Az ellenőrző itt is az **állítást** nézi, nem a mező létezését: ahol
  jelölünk, ott a magyar név valóban a román neve kell legyen. Ehhez kell
  az `ugyanazANev()` a `szabalyok.mjs`-ben, mert négy helyen csak írásmód
  tér el (`Vále`/`Vale`, `Dealu Ștefăniței`/`Dealul Ștefăniței`) — ezek
  is valóban nincsenek magyar nevük, csak más betűkkel írva.

**Az osztály tehát nem 77, hanem legalább 121 hely.** A 92 ismert
Wikidata-hiba 89-e van az adatfájlban, plusz a 44-ből 32 új; 12 átfedés.

### A jelölésnél egy döntést hoztam meg helyetted

A kérdés az volt, hogy a nevet cseréljük-e „nincs magyar neve" szövegre.
**Nem cseréltem**: akkor a falu nem lenne kereshető (több mint száz ilyen
hely van, és a neve az egyetlen támpontjuk). Helyette apró, szaggatott
keretű jelölés van a soron, `title` szöveggel, ami elmondja, miért. Ha
ezt meg akarod fordítani, a `keres.js`-ben egy `if (h.huNincsNeve)`
ágazaton múlik, az adat nem változik.

## A jelenlegi adat — ellenőrizve

`helyek.json`: **3167 helység, 9 megye**, 130 valódi német név,
verzió **1.1.0**.

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

- 468 helységen a magyar név megegyezik a románnal (nincs magyar exonim — nem
  hiba); **121-nél** ebből nincs is magyar nevük, ezeket jelöli a
  `huNincsNeve`
- 2 kézzel javított magyar név (`Monostor`, `Dumest`) — a `javitasokHu.json`
- 130 német név, mind ellenőrzötten német (nincs román ékezet, nincs perjel)
- **36** néven oszlik meg két vagy több hely ugyanabban a megyében, összesen
  **76** helységgel (ez a szándék; a sorok a községnevükön különböznek).
  Ebből 33 néven pontosan kettő, 2-nél három, 1-nél négy (`Florești`) van,
  és 27-nél a román név is egyforma — vagyis a felhasználó **76 sort lát
  megkülönböztető toldalék nélkül** (ez 2026-09-09-ig így volt, ma mind
  megvan).
  A maradás maga a `README` tervezése: a magyar nevek eltérése önmagában nem
  zárja ki, hogy két megyében ugyanaz a falu-név létezik.

### Ellenőrzés: minden zöld

```
node letolt.mjs     → 3167 helység, 121 hely jelölve "nincs magyar neve", 2/2 kézi magyar név érvényesült
node ellenoriz.mjs   → 2 hiba, mindkettő tudottan hiányzó (Kézdiszentvincent, Borosjenő), 0 új
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

**Frissítve a 3. munkamenetben:** a mérés kiterjedt a visszanyert 93-ra és
az egész 468-as `hu == ro` halmazra. A válasz: a 77 nem egy zárt lista,
hanem egy **mérfőszám** — az osztály legalább 121 hely, és van köztük
olyan, aminek van magyar neve (2 ilyet találtam és bejavítottam). A „ne
töröld, mert akkor kikerül a keresőből" érvelés továbbra is áll, de a
„hagyjuk csendben" **megváltozott**: most jelölés van mellette.

## ~~A nyitott kérdés~~ — lezárva 2026-10-09-én

A döntés: **apró jelölés a soron** (a fenti pontban). Az alábbi három
lehetőség közül a 2. készült, de nem a név helyére, hanem melléje — a
kereshetőség megőrzése miatt.

**Láthatóan jelöljük-e a 77-et a felületen?** Most csendben román név
jelenik meg magyar névként. A lehetőségek:

1. **Így hagyjuk** (jelen állapot) — a felhasználó használható nevet kap.
2. **Jelöljük** — pl. a magyar név helyett „nincs magyar neve", vagy apró
   megjelölés a soron. Őszintebb, de a használható nevet elvesszük.
3. **Másold be románul** — a `hu` marad, de a kereső a magyar nevet üresen
   hagyja és a románt mutatja. Ehhez a `keres.js` változik, nem az adat.

Ez termékdöntés, adatpolitika, nem technikai. Nem nyúltam hozzá.

## Amit érdemes lehet folytatni

1. ~~**A 22 néven, ahol két megmaradt helynek a magyar neve is azonos**~~
   — **kész 2026-10-09-én**, lásd fent.
2. ~~**A visszanyert 93 hely nagy része még „nincs magyar nevük"**~~
   — **kész 2026-10-09-én**: mérve (44 a 93-ból), a két biztos magyar
   név bejavítva, a többi jelölve. Lásd fent.
3. ~~**A `place-search` verziózása**~~ — **kész 2026-10-09-én**:
   `szabalyok.mjs` → `helyek.json` → footer, és a `CHANGELOG.md` szabályai.
4. **A 468 `hu == ro` helyből a maradék 347-et is végigjárni** a KIA-val
   és a magyar Wikipediával, mint a 44-et. A 13 találatból kettő lett
   bejavítás, tehát a módszer működik, csak lassú. Ha ez kész, a
   `nincsMagyarNev.json` lista lesz teljes, és a `hu == ro` ellenőrzés
   valódi állításellenőrzéssé válhat.
5. **A KIA PDF feldolgozása a kódba** (`letolt.mjs` nem tud magyar nevet
   kérni a Wikidata-tól, mert az nincs is ott). Ha beépülne, a „van-e
   magyar neve" kérdésre nem kellene kézzel mérni — és a
   `javitasokHu.json` is automatikusan ellenőrizhető lenne.

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
node ellenoriz.mjs    # az adat ellenőrzése — 2 hiba a várt, 0 új
python3 -m http.server 8123 & node proba.mjs   # a valódi böngészőben
```

Az `ellenoriz.mjs` és a `proba.mjs` is hibás kilépési kóddal tér vissza, ha
új hiba van, tehát CI-ba (vagy egy `&&`-láncba) bedobható.