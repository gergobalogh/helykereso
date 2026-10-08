# Kutatási jegyzőkönyv — a helynevek ellenőrzése

Dátum: 2026-10-06. Vizsgált adat: `helyek.json` (3075 helység), a `letolt.mjs`
2026-10-04-i letöltéséből.

Ez a jegyzőkönyv a README-ben jelzett legnagyobb ismert kockázat vizsgálata:
**„a kisebb falvaknál a Wikidata címkéje lehet hibás"**. Az `ellenoriz.mjs` ezt
nem tudja elkapni, mert a szerkezeti hibákat nézi, nem azt, hogy egy címke
magyarul értelmes-e.

## Hogyan vizsgáltam

1. `node ellenoriz.mjs` — alaphelyzet. **Tiszta: nincs valódi duplikátum, a német
   nevek rendben, a belső konzisztencia rendben.** Az ellenőrző minden
   szerkezeti ellenőrzésen átment.
2. Célzott szűrő mind a 3075 elemen: román nyelvű szó a magyar mezőben, zárójeles
   magyar név, toldalék nélkül ütköző név, román ékezet a német mezőben, zárójel
   vagy perjel a német mezőben.
3. A jelöltek ellenőrzése élő Wikidata-lekérdezéssel (`wbgetentities`, `P131*`),
   majd román és magyar enciklopédiakkel (ro.wikipedia, en.wikipedia,
   hu.wikipedia, a KIA magyar nevlista).

**Fontos megállapítás, ami a teljes vizsgálatot meghatározza: a `place-search`
nem hibás adatot ad, hanem a Wikidata hibáját másolja át.** A SPARQL-lekérdezés
(`letolt.mjs:195`) már megköveteli, hogy az elemnek *ténylegesen* legyen magyar
címkéje (`FILTER(LANG(?hu) = "hu")`), tehát nincs kódoldali visszaesés. A
hibás magyar nevek a Wikidata `hu` mezőjében vannak.

## Megerősített hibák

### 1. A magyar mezőben román helynév — 42 helység

Példák: `Dealu Mare`, `Dealu Bajului`, `Valea Albá`, `Peste Valea Bistrii`,
`Săliștea-Deal`, `După Deal`. Magyarul senki nem így nevezi ezeket a falvakat.

- Megerősítve élőben: Q1822117 `hu="Dealu Mare"`, Q12087397 `hu="Valea Albă"`,
  Q11421465 `hu="Dealu Bajului"`.
- **35 a 42-ből Alba megyében** (AB), a többi CJ (1), HD (2), MS (3).
- Ezek 41 esetben `hu == ro`. A maradék 383 `hu == ro` helység viszont rendben
  van: azoknak tényleg nincs magyar exonimjuk, ez nem hiba.

**A minta erős ujjlenyomat.** A 42 hibás elem medián Q-száma **10 862 266**, míg
az egész adathalmaz mediánja **858 221** — nagyjából tizenkétszeres. Ezek tehát
nagyrészt frissen, tömegesen létrehozott Wikidata-elemek, nem szétszórt elírások.
Egy közreműködő vagy egy import a gyanúsított, nem egymástól független hibák.

### 2. Román magyarázó szöveg a magyar mezőben — 1 helység

Q3889960 `hu = "Rudafalu Romániában, Hunyad megyében"`, miközben `en = "Ruda"`.
Ez magyarul értelmezhetetlen; egy román nyelvű megkülönböztető szöveg került a
magyar címke helyére.

### 3. A metropolisztérség egy helységnek látszik — 1 helység

Q1165705 `hu = "Marosvásárhely Metropoliszövezet"`, `en = "Târgu Mureș
metropolitan area"`. Ez nem helység, hanem egy város és a környéke, tehát a
keresőben nem kellene megjelennie.

**A README ezt javított hibaként sorolja fel, de a javítás nincs hatásban.** A
védelem létezik (`letolt.mjs:81`), de a szabályos kifejezés két helyen lyukas.
Lefuttatva az értékekre:

```
TILTOM                 "Kolozsvár metropolisztérség"
--- NEM tiltom ---      "Marosvásárhely Metropoliszövezet"   ← a tényleges Wikidata-címke
--- NEM tiltom ---      "Bukarest agglomeráció"
```

A `metropoliszt[eé]rs[eé]g` ág a `metropolisztérséget` várja, a Wikidata viszont
`Metropoliszövezetet` ír. Az `agglomer[aá]ci[oa]` ág pedig sima `o`/`a` betűt
keres, ahol a szövegben `ó` van. A rekord még mindig benne van a `helyek.json`-ban.

**Megjavítva 2026-10-08-án.** A szűrés most mindhárom nevet nézi (nem csak a
magyart, mert ugyanaz a hely románul "Zona metropolitană"), és a szabály laza
szódarabot keres bármelyik néven, nem szabályos alakot. A szabály átkerült a
`szabalyok.mjs`-be, mert az `ellenoriz.mjs`-nek is ugyanazt kell vennie — különben
a kód és az ellenőrzése szétcsúszik, és épp ez történt itt.

Utána a `helyek.json` 3074 helység (egy kevesebb), és a `proba.mjs` regressziós
tesztet kapott: a régi adattal 2 hibával bukik, az újjal 0-val.

### 4. A német név nem név, hanem két nevet összefűzött perjellel — 2 helység

Q714327 `de = "Cornești / Sövényfalva"`, Q261457 `de = "Pădureni / Erdőcsinád"`.

### 5. Román ékezet a német mezőben — 5 helység

Q261457 `de = "Așchileu"` (román `ș`), Q714327 `de = "Cornești"`, Q221571
`de = "Idecel-Pădure"`, Q1031621 `de = "Glăjerie"`, Q724226 `de = "Pădureni / Erdőcsinád"`.

**Megjavítva 2026-10-08-án — a negyedik szabály a `nemetNev()`-ben.** A
betűrendi hasonlítás (3. szabály) azért nem fogta meg őket, mert a Wikidata a
román névben *egyet* elront: `Idicel-Pădure` → `Idecel-Pădure`, `Glăjărie` →
`Glăjerie`. Így már nem ugyanazok a betűk, tehát a hasonlítás átengedte.

Az új szabály: ami román ékezetet tartalmaz (`ă â î ș ț`), az nem német név.
A német ábécében ilyen betű nincs, tehát biztos jel — és nem téveszt szót a
magyar `ő`/`ű`, mert az közös ékezet. Ez **öt** hamis `de` nevet vett ki
(135 → 130 valódi). A `dePerjel` és `deRomanEkezet` osztály az
`ismertHibak.json`-ban kiürült: ezt már nem a Wikidata, hanem a kód javítja.

A negyedik szabály után **nulla** olyan sor maradt, aminek a `de` mezőjében
román ékezet vagy perjel lenne, ezt a `proba.mjs` is ellenőrzi.

## Amit az `ellenoriz.mjs` nem kapott el — és már megvan

**Az öt fenti osztály mindegyike átment az ellenőrzőn.** A német nevek
ellenőrzése csak betűrendi egyezést és zárójelet néz, ezért a `"Cornești /
Sövényfalva"` átcsúszott. Semmi nem vizsgálta, hogy a `hu` mező egyáltalán
magyar-e. A hiányzó ellenőrzések:

- a magyar mezőben román helynév-szó (`Dealu`, `Valea`, `După`, `Peste`, `Mare`…)
- a magyar mező zárójeles (`(Románia)`, `(Magyarókereke)`, `(település)`, 10 elem)
- zárójel vagy perjel a német mezőben
- román ékezet a német mezőben
- nem helységnek minősülő elem a találatok között

**Mind az öt megvan 2026-10-08-óta**, a `szabalyok.mjs`-ben, és az
`ellenoriz.mjs` ugyanazokat hívja — nem lehet szétcsúszni.

### A fontos döntés: a tudott hiba nem egyenlő az új hibával

A nyelvi ellenőrzések a WIKIDATA hibáit találják meg, nem a kódét (lásd fent).
Öt osztályban így 77, 10, 1, 2 és 5 elem jön ki — és ha mindegyiket hibának
számolnánk, a kimenet már az első futáskor 95 piros sort írna, és senki nem
látná meg, ha *újabb* elem jelenik meg ugyanebben az osztályban. Ez pontosan
az a néma hiba, amit ez a projekt keres.

Ezért van az `ismertHibak.json`: felsorolja a tudott Q-számokat. Az
ellenőrző az ismertet nem hibának számolja, az **újat** viszont jelenti. Ha
valaki kijavít valamit a Wikidata-n, az elem kiesik a listából, és az
ellenőrző megkérdezi, hogy már javított-e.

### Amit a számlálás módosítása kiderült

A román helynévszavas magyar nevek száma **42 helyett 77**. Nem új hibák
kerültek elő: az eredeti számlálás öt szót nézett (`Dealu`, `Valea`,
`După`, `Peste`, `Mare`), az ellenőrzés 32 román helynévszót ismer. Ugyanaz
az egy közreműködő hibája, csak most teljes a kép: Nagy-Albás megyéből 60
elem, azaz a tömeges eredet nem változik.

## Amit ellenőriztem, és rendben van

Hogy a hibák nagyságrendje ismert legyen, ezeket is leellenőriztem — mind
**rendben van**, nem hiba:

- **Megye.** Az `Agrieșel` / `Agrișu de Jos` pár (mindkettő BN-ben) Bihor
  megyébe kerülésre gyanús volt. Nem: Agrieșel a Târlișua községhez tartozik,
  Bistrița-Năsăud, SIRUTA 35189. A `BN` helyes.
- **„Felsőilosva".** A Târlișua magyar neve elsőre hibás fordításnak látszott,
  mert a szomszédos `Kisilva` (Ilva Mică) és `Nagyilva` (Ilva Mare) mintát
  követ. Rendben: történeti alakjai *Ilosva (1576) → Kis-Ilosva (1607) →
  Felső-Ilosva (1618)*, az Ilișua patakról kapta a nevét, nem az Ilva
  községektől.
- **A 14 toldalék nélkül ütköző név.** Ezek valódi, külön helyek: például
  `Vajdej/Vaidei` és `Vajdej/Râu Mic`, illetve `Baresd/Bărăștii Hațegului` és
  `Baresd/Bărăștii Iliei` két külön falu Hunyad megyében. A toldalék megtartása
  pontosan azért van, hogy ezek ne ugyanazzá váljanak — a tervezés működik.

## Következő lépés

A projekt saját elve szerint a tartós javítás **feljebb** van: a `helyek.json`
kézi javítása eldobható, mert a következő `letolt.mjs` felülírja. A README
ezt így írja: *„beküldöd a javítást a Wikidata-nak, ami tartósabb."*

A 2. pontnál lévő tömeges eredet miatt ez nem 42 külön jelentés, hanem **egy
lehetőleg közös bejelentés** arról az egy közreműködőről, aki román neveket
másolt magyar címkékbe.

## Amit közben találtam: a forrás linkje halott volt

A „javítása" link elkészítésekor kiderült, hogy a **meglévő** Wikidata link
soha nem működött. A `keres.js` így építette:

```js
encodeURIComponent(h.wikidata)
```

ami az egész URL-t kódolja, tehát a `https://` helyett `%3A%2F%2F` kerül a
`href`-be. A böngésző ezt relatív útvonalnak nézi, és a link a saját
domainünkre mutat. A `helyek.json` `wikidata` mezője tehát **rendben volt**,
csak a megjelenítés volt rossz.

Ami érdekessé teszi: a `proba.mjs` 22 keresést futtatott, és mind átment.
Mert a link **szövegét** nézte ("Wikidata"), nem a `href`-et. Egy ellenőrzés,
ami a látható szöveget vizsgálja, nem ellenőriz semmit, ha a hiba a láthatatlan
részben van. Ez a projekt második legcsendőbb hibája az első után, és ugyanaz
a gyökere: azt vizsgáltuk, ami könnyen volt, nem azt, ami fontos.

A javítás: a linket a `q` azonosítóból építjük (`wikidataLink()`), így a
letöltött mező egyáltalán nem kell hozzá. A próba mostantól a `href`-et nézi,
és csalás ellenére is bukik, ha visszaírom a hibás `encodeURIComponent`-et
(leellenőriztem).

## A közös tanulság: ellenőrizd a láthatatlant is

Ez a projektben három csendes hiba van, és mindhárom ugyanazt a mintát követi:
**egy ellenőrzés megnézte, hogy valami *előfordul-e*, nem hogy *jó-e*.**

| Ellenőrzés | Amit nézett | Amit kellett volna |
|---|---|---|
| `NEM_HELYSEG` szűrés | a szabályos `metropolisztérséget` | hogy bármi agglomeráció bent van-e |
| `proba.mjs` linkpróba | a link szövegét: "Wikidata" | a `href`-et, hogy odamegy-e |
| `nemetNev()` 3. szabály | hogy ugyanazok-e a betűk | hogy német-e a nyelv |

Mindhárom átment a saját tesztjén. A gyökér az, hogy a teszt mindig azt
ellenőrizte, ami *könnyen* lekérdezhető volt, nem azt, ami *fontos*. A
`de` mezőnél ez különösen fájdalmas: a `de` jelölés ígéri, hogy német nevet
látunk, tehát a nyelv maga az állítás — és ezt senki nem ellenőrizte.

**Ha ebből a projektből valamit tovább vinnél:** az ellenőrzés ne azt kérdezze
„van-e ilyen elvétett hiba?”, hanem azt, hogy „ha ez a mező azt állítja, akkor
az állítás igaz-e?". A különbség az, hogy az első felsorolja a tüneteket, a
második bizonyítja a helyességet.

**Következőkre, ha van kedv:**

1. ~~A metropoliszövezet-védelem javítása és az öt új ellenőrzés beépítése.~~
   **Kész 2026-10-08-án.** A szabály a `szabalyok.mjs`-ben van (a letöltő és
   az ellenőrző is onnan veszi), az `ismertHibak.json` pedig a tudott
   Wikidata-hibákat sorolja fel, hogy az újaktól meg lehessen különböztetni.
2. ~~A hamis német nevek (5 helység) kiszűrése.~~ **Kész 2026-10-08-án**,
   lásd az 5. pontot.
3. A **77** hibás magyar címke javítása — de valódi magyar neveket kell hozzá,
   azokat nem a román alakból lehet kitalálni. Forrás lehet a KIA magyar
   nevlista (`kia.hu/kiakonyvtar/konyltar/erdely/erd2002/hnevta02.pdf`). Ez
   a legnagyobb és legtisztább hátralévő munka, és nem is itt kezdődik: a
   végleges hely a Wikidata.
3. ~~A „report a mistake" link.~~ **Kész 2026-10-08-án.** Minden találat
   mellett van egy **javítása** link, ami a Wikidata szerkesztő űrlapját nyitja
   magyarul (`?action=edit&uselang=hu`). Ez a helyes irány, mert a fenti 77
   hiba mind a Wikidata-n van, és a `helyek.json` következő letöltése
   felülírja, ami itt javítanál.
4. A `place-search` verziózása gitben: a jegyzőkönyv ezt nem védi meg.