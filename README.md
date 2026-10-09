# Helynévkereső

Nézd meg, hogy hívják Kolozsvárt románul és németül. Keress bármely erdélyi
helységet, és lásd mindhárom nevét egymás mellett, a megyével együtt.

Egy [mivelkezdjem.hu](https://mivelkezdjem.hu) kísérlet. Remixeld, és írd át
magodra.

## Mi ez pontosan

Erdély kilenc megyéjének (3075) helysége magyar és román névvel, és ahol van,
német nevet is. Magyarul, románul és németül is kereshetsz rá, ékezetek nélkül
is (`Targu Mures` → Târgu Mureș). Van egy megyeválasztó is, ha az egész
megyét akarod böngészni.

## Fájlok

| Fájl | Mit csinál |
|---|---|
| `letolt.mjs` | Letölti a Wikidata-ról a helyeket, és megírja a `helyek.json`-t. |
| `index.html` | Az oldal. |
| `keres.js` | A keresés és a találatok kirajzolása. |
| `javitasok.json` | Kézzel javított német nevek. Olvassa a `letolt.mjs`. |
| `szabalyok.mjs` | A letöltő és az ellenőrző közös szabályai (egy helyen, hogy ne divergáljanak). |
| `ismertHibak.json` | A Wikidata ismert adathibái, Q-számmal. Olvassa az `ellenoriz.mjs`. |
| `ellenoriz.mjs` | Ellenőrzés az adatfájlon: megvannak-e a fontos helységek, jól vannak-e besorolva. |
| `proba.mjs` | Böngészős próba: működik-e a kereső a valódi oldalon? |
| `helyek.json` | A letöltött adat olvashatóan. |
| `helyek.min.json` | Ugyanez egy sorban. Ezt olvassa az oldal. |
| `.cache/` | A `letolt.mjs` köztes eredményei, hogy részleges adatból is újra lehessen futtatni. |

A `helyek.json` egy helységének a mezői:

| mező | mi |
|---|---|
| `q`, `hu`, `ro`, `de` | a Wikidata-azonosító és a magyar, román, német név (`de` lehet `null`) |
| `megye` | a román megyekód (`AB`, `CJ`, …) |
| `kozseg`, `kozsegNev` | a szülő község azonosítója és neve (`null`, ha nincs ilyen) |
| `wikidata` | az elem oldala |
| `utalo` | megkülönböztető toldalék, ha ugyanabban a megyében másik helynek is ugyanaz a magyar neve van (`null` egyébként) — lásd alább |

Nincs építési lépés és nincs függőség: a `letolt.mjs` Node.js-t használ
(szabányos `fetch`), minden más statikus fájl. A `proba.mjs`-hez kell a
Playwright, de csak a próbához, nem az oldalhoz.

## Használat

```sh
node letolt.mjs          # lassú szándékosan, lásd alább
node ellenoriz.mjs       # ellenőrizd az adatot
python3 -m http.server 8000
# majd: http://localhost:8000
```

Az oldalnak kiszolgáló kell, mert adatot olvas be (`fetch`); a
`file:///hely/` útvonalon nem fog működni.

## Miért három lépésben kérdezzük

A Wikidata `P131` tulajdonsága mondja meg, hogy valami melyik községhez, az
pedig melyik megyéhez tartozik. Egy lekérdezésben simán meg lehetne kérdezni
a teljes láncot (`wdt:P131*`), **csak ez a végpont időkorlátjába belefut**:
`upstream request timeout`. Ugyanez a sorsa a `wdt:P31/wdt:P279*` átmenő
osztályútnak is (65 másodperc, aztán feladja).

Ezért így működik:

- **A.** Minden, aminek van magyar és román neve, a megyék alatt. Osztály
  szűrés nélkül. Innen kiderülnek a használt osztályok (~190).
- **C.** Minden, aminek van magyar és román neve, az A. lépésben talált
  községek és városok alatt. Megint szűrés nélkül.
- **B.** Megkérdezzük a teljes adatbázison: melyik a ~190 osztály közül
  emberi lakhely? (`?osztaly wdt:P279* wd:Q486972`.)

A szűrést ezután **helyben**, JavaScriptben csináljuk. Ez azért jó, mert
nem kell felsorolni kézzel a román adminisztráció osztályait, és ha a
Wikidata új osztályt kezd használni, a B. lépés észreveszi.

## Amit ez a megközelítés kijavított

Ezek mind valódi hibák voltak az első működő verzióban. Ha módosítod a kódot,
tudnia kell róluk, mert mindegyik néma hiba: a program nem áll le, csak rossz
adatot ad.

**A megyeszékhelyek kimaradtak.** A városok a Wikidata-n nem `city` (Q515)
osztályúak, hanem `municipality of Romania` (Q640364). Emiatt Brașov, Sibiu,
Târgu Mureș és a többi megyeszékhely egyáltalán nem jelent meg az oldalon.

**A községek és a megyeszékhelyek kimaradtak.** A `commune of Romania`
(Q659103) és a `municipality of Romania` (Q640364) osztályt a Wikidata nem
a "human settlement" alá köti, hanem közigazgatási területnek tekinti. Így a
B. lépés nem találta meg őket, és kimaradt 544 község meg 33 város — a
falvak szülője is. Ezért van a `TELEPULESC_IS_KOZIGAZGATAS` lista.

**Téves megye.** Az első változat a lekérdezés *darabjá*ból számolta a
megyét, nem a sorból. Mivel egy kérés 5 megyét is lekérdezett, mindenki az
első megyébe került: 2176 "Kolozsvár megye" és 1157 "Hunyad megye". A helyes
megye a `?cel` kötött értéke, ami soronként jön.

**A `község` szó levágása 556 duplikált sort hozott létre.** A Wikidata a
falut és a községet külön elemként tárolja, és gyakran ugyanaz a nevük
("Ajton" és "Ajton község"). Ha a toldalékot levágjuk, a kettő egy lesz. Ezért
a toldalék bent marad.

**A "német név" 1016 helységből 908-szor csak a román név volt.** A
`rdfs:label` lekérdezés a Wikidata hibáját hozza vissza: a román nevet
másolja oda. Ez rosszabb, mint a semmi, mert azt mutatná, hogy Kolozsvár
német neve "Cluj-Napoca". Három szabály van a `nemetNev()`-ben, a harmadik
pedig betűrendben hasonlít, mert a hiba néha csak a végződésen látszik
("Hodaie" → "Hodaei").

**A betűrendi hasonlítás önmagában nem elég: öt helyen átment rajta.** Ha a
Wikidata a román névben elront *egyet* a betűt, a szó már nem ugyanazok a
betűk, tehát átcsúszik, és a kereső `de` jelöléssel román nevet mutat:

| Q | hu | amit a `de` mutatott |
|---|---|---|
| Q221571 | Erdőidecs | `Idecel-Pădure` (román: `Idicel-Pădure`) |
| Q1031621 | Görgényüvegcsűr | `Glăjerie` (román: `Glăjărie`) |
| Q714327 | Sövényfalva | `Cornești / Sövényfalva` |
| Q724226 | Erdőcsinád | `Pădureni / Erdőcsinád` |
| Q261457 | Nagyesküllő | `Așchileu` |

Ezért van a `nemetNev()` **negyedik szabálya**: ami román ékezetet tartalmaz
(`ă â î ș ț`), az nem német név. A német ábécében ilyen betű nincs, tehát a
jel biztos — és nem téveszt szót a magyar `ő`/`ű`, mert az közös ékezet.
Öt helységen így 135 helyett **130** valódi német név maradt.

A hiányzó név tisztább, mint a hamis: ezt a `javitasok.json` szabálya is
mondja, és ugyanez érvényes a szűrésre.

**632 duplikált Wikidata-elem.** Ugyanarról a helyről van két elem (a
Kolozsvár például `Q100188` és `Q16898189` is). A kisebb Q-számú nyer, mert a
Wikidata sorszámai a korábban létrejött elemekre utalnak.

**A "metropolisztérség" egy helységnek látszott.** A Kolozsvár
metropolisztérség a Wikidata-n `metropolis` (Q200250) osztályú, tehát
osztály szerint nem szűrhető ki, pedig egy város és a környéke, nem helység.

**A védelme emellett LYUKAS volt, és senki nem vette észre.** A szűrés
szabályos alakot várt: `metropoliszt[eé]rs[eé]g`. A Wikidata viszont a
Marosvásárhely agglomerációt **"Marosvásárhely Metropoliszövezet"**-nek
hívja, tehát a szabály elment mellette, és a keresőben találatként jelent
meg. Ugyanez a hiba egy második ok miatt is előjött: a szűrés csak a magyar
nevet nézte, holott ugyanaz a hely románul "Zona metropolitană". Ma mindhárom
nevet nézi, és a szabály a `szabalyok.mjs`-ben van, hogy az ellenőrző is
ugyanazt vegye — különben a kód és a tesztje szétcsúszik, mint itt is.

Ez a hibaosztály a legjobb példa arra, miért van `ellenoriz.mjs`: a program
nem állt le, csak rossz adatot adott, és semmi nem jelezte.

## Mi a legcsendőbb hiba, amit ez a kód elkövet

A Wikidata a román helységek jelentős részét NEM "emberi lakhely"
(`Q486972`) osztályúnak jelöli, hanem **közigazgatási területnek**. A
`municipality of Romania` (`Q640364`) a `municipality` (`Q15284`) alá van
kötve, ami az adminisztrációhoz tartozik, nem a lakhelyhez. Csak a
`county seat in Romania` (`Q34843301`) kapcsolódik a `city`-hez, és így a
lakhelyhez is.

Hatása: ha a `TELEPULESC_IS_KOZIGAZGATAS` listából kivennénk a
`Q640364`-at, **csendben kimaradna** Szászrégen, Dicsőszentmárton,
Tekeújfalu és a többi megyeszékhely. Nem áll le a program, nem ír hibát,
csak rossz adatot ad. Ezért van az `ellenoriz.mjs`-ben külön felsorolva
néhány ilyen helység névvel.

Általánosan: a szűrés ilyen hibája nem dob kivételt, hanem *egyszerűen
elmelyedik*. Ezért kell a `proba.mjs` is, nem csak az adat-ellenőrzés: az
valódi böngészőben nézi meg, amit az ember látni fog.

## A "duplikátumok" a számlálóban

Az ellenőrző sok ismétlődő románnevet mutat, és ez jó hír, nem rossz: a magyar
és a román név is szerepel egynél többször, de **egyik sem ugyanabban a
megyében**. Két megyében lehet ugyanaz a név, és az két valódi hely. A
`Doboka` (Dăbâca) például egyszer Kolozsvár, egyszer Hunyad megyében valódi
két falu, magyarul mindkettő Doboka. Ezeket szándékosan megtartjuk.

**Ugyanabban a megyében sem duplikátum minden ütközés.** Ez a legsúlyosabb
néma hiba, amit a projektben találtam, és a saját dokumentációnk mondta el
ellenkezőleg. A README korábban azt írta: *„ha ugyanabban a megyében kétszer
ugyanaz a magyar **és** román név, az duplikátum"* — de a kód csak a román
nevet nézte:

```js
const kulcs = `${h.megye}|${h.ro.toLowerCase()}`;
```

Alba megyében viszont több valódi falu neve éppen ütközik: a `Butești` a Mogos
**és** az Arada község alatt is létezik, a `Lazuri` a Nagylupsa és az
Aranyosszohodol község alatt, és így tovább. Ezek nem másolatai egymásnak,
hanem két külön falu — csak a nevük azonos. A szűrés **93 valódi helyet
törölt ki** csendben: kivétel nem dobott, és semmi nem szólt róla. A kereső
egyszerűen nem találta meg őket.

A javítás nem a néven, hanem a **helyen** dönt, és ez a szabály most a
`szabalyok.mjs`-ben van (`ugyanazAHely()`), hogy a szűrő és az ellenőrző ne
csúszzon el:

| | |
|---|---|
| ugyanaz a `q` | duplikátum (Kolozsvár `Q100188` és `Q16898189`) |
| az egyik a másik községe | ugyanaz a hely (`Ajton község` és az `Ajton` falu) |
| mindkettő a megye alatt | duplikált megyeszékhely-bejegyzés |
| különböző község | **két valódi hely — mindkettő megmarad** |

3716 nyers sorból 549 esett ki, 3167 maradt (3074 helyett). A letöltő
kilistázza a több-valós névre ütközéseket, hogy a szabály szűkülése azonnal
látszódjon, és a `proba.mjs` ellenőrzi, hogy a `Butești`, `Bârlești` és
`Lazuri` falvai tényleg megmaradnak — leellenőriztem, hogy a hiba
visszahozásával mindhárom bukik.

## A megkülönböztető toldalék

**A fenti javításnak volt egy következménye, amit külön kellett kezelni.** Ha
két valós falu ugyanabban a megyében ugyanazt a magyar nevet viseli, akkor
mindkettő megmarad — ez a helyes eredmény. De a felhasználó most **két
egyenforma sort** lát, és nem tudja, melyik az övé:

```
Butești   ro Butești   · Nagy-Albás megye · Wikidata · javítása
Butești   ro Butești   · Nagy-Albás megye · Wikidata · javítása
```

A sor végén a megye mindkettőnél ugyanaz, tehát nem választja szét őket. A
szülő község választotta volna (`Mogos község` és `Arada község`), de az a
sor legalsó, leghalványabb részén volt, ahol a szem már elsiklik mellette.

Ezért a szülő község felkerül a **neve mellé** — ott, ahova az ember néz:

```
Butești (Mogos község)   ro Butești   · Nagy-Albás megye · …
Butești (Arada község)   ro Butești   · Nagy-Albás megye · …
```

Ez a `letolt.mjs`-ben dől el, az `utalo` mezőben, mert **az adat tulajdonsága,
nem a megjelenéséé**: ugyanaz a leképezés kell a szűrőnek és az ellenőrzőnek
is, különben elcsúsznak egymástól (a `szabalyok.mjs`-ben van, az
`ellenoriz.mjs` ugyanazt futtatja a kész adaton).

**A kulcs a megye és a név együtt**, nem a név önmagában. Két megyében
ugyanaz a név nem baj: a `Doboka` Kolozsvár megyei és Hunyad megyei
`Doboka`-ja a sor végén álló megyefelirat miatt már megkülönbözik. 36 néven
ütközik a megyén belül, ezért **76 helységnek** van toldaléka — a többi 3091
szándékosan marad toldalék nélkül.

**Nem új adatot vezettünk be, hanem oda tettük, ami már ott volt.** A
szülő község neve (`kozsegNev`) a soron eleve látszott, csak a sor végén. És
a toldalékot a kereső indexeli is, tehát **meg lehet írva**:

```
Butești Mogos  →  Butești (Mogos község)     (1 találat, nem kettő)
```

Ez a második fele az, ami hasznossá teszi: nem csak megmondjuk, melyik
falu, hanem rá is lehet keresni. A toldalék nélkül ez a keresés nulla
találatot adott volna.

Amit ez nem old meg: ahol a magyar név önmagában **nem mond semmit** —
`Poieni`, `Botești`, `Valea Albá` —, ott a toldalék a községet mondja el,
nem a falut. Az ilyen név **a Wikidata hibája**, és az a `javítása` linkkel
javítható, nem nálunk.

Két dolog, amit a toldalék nem csinál, és szándékosan:

- **nem pótolja ki a hiányzó magyar nevet** — nem találunk ki neveket;
- **nem indexeli minden falu községnevét**, mert az épp az a hiba lenne,
  amit a `README` eleve elkerült: a "kolozsvár" keresés 426 találatot adna,
  és a listán nem derülne ki, miért illik oda valami.

### Amit ez a toldalék NEM tud, és ezért ellenőrzi is

Az `ellenoriz.mjs` három dolgot néz a kész adaton, mert ezek csendben
rothadnak:

1. **egyezik-e a toldalék a szabállyal** — se túl sok, se túl kevés. Ha a
   `szabalyok.mjs` szűkülne, a toldalék csendben eltűnik, és megint két
   egyforma sor lesz (ez volt a 2026-10-09-i állapot előtti helyzet);
2. **különböztet-e** — ha két azonos nevű helynek ugyanaz a szülő községe
   lenne, a toldalék sem választaná szét őket, és ezen csendben át lehetne
   csúszni, mert a sorok száma nem változna. Ma ilyen nincs.

Mindkettőt leellenőriztem, hogy tényleg buknak: a toldalék nullázásával az
ellenőrző új hibát jelez, a `keres.js`-ben a megjelenítés kikapcsolásával a
böngészős próba 9 hibát jelez.

## Mire figyelj, ha módosítod

**POST, nem GET.** Nagy `VALUES` listánál a GET 414-es hibát ad
(`Request-URI Too Large`), ezért minden kérés POST. A végpontnak adni kell
egy `User-Agent`-et is, különben nem válaszol.

**A kérések százonként, sorban.** A `letolt.mjs` nem bocsátja párhuzamosan
kérdéseket: a Wikidata kieséskor 1 kérés/perc-re szorul (2026 októberében épp
ez volt, `429` hibával). Az újrapróbálás a hibaüzenetben megadott időt
megvárja. Emiatt van a `.cache/`: ha egy futás félbeszakad, a már letöltött
részek megmaradnak.

**A megye neve nem része a keresésnek.** Eleve benne volt, és emiatt a
"kolozsvar" keresés 426 találatot adott, ahol a találatok listáján sehol nem
látszott, miért illik oda valami (mert a megyébe esik). Helyette van egy
megyeválasztó: ami látszik, az nem meglepő.

**Az ékezetlen keresés.** A `normaliz()` a szöveget leegyszerűsíti, de
visszaadja azt is, hogy a leegyszerűsített szöveg minden karaktere eredetileg
honnan jött. Erre van szükség a kiemeléshez: "Târgu Mureș" leegyszerűsítve
rövidebb, és egy puszta `indexOf` rossz helyen vágna.

**Az `ellenoriz.mjs` a te barátod.** Mielőtt bárkinek megmutatod, futtasd le.
Ez a hibaosztályok — rossz megyekód, hiányzó város — itt kijönnek, mert
egyébként csendben vannak.

## A beállítás, amit írd át

A `MEGYEK` tömb a `letolt.mjs` tetején. Kilenc megye; mindegyiknél a román
megyekód (`CJ`) és a Wikidata-azonosító (`Q182624`). Ha más környéket akarsz,
írd át ezt a tömböt. A megyekód az oldalon csoportosításra és rendezésre
szolgál, a Wikidata-azonosító kell a lekérdezéshez.

A `javitasok.json`-ba akkor írj, ha a Wikidata német neve rossz vagy hiányzik.
A kulcs a **román** név, az érték a német név. Csak akkor írd be, ha tényleg
nincs rendes német név a Wikidata-n — különben felülírod a helyes adatot.

## A tudás, amire épül

Adatforrás: [Wikidata](https://www.wikidata.org/),
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) licenc (szabadon
felhasználható, a forrás megjelölése sem kötelező — de szívesen megjelöljük).
A `javitasok.json` saját munka, ellenőrizd, mielőtt másnak adod tovább.

**A legnagyobb ismert kockázat: a kisebb falvaknál a Wikidata címkéje lehet
hibás.** Ez az adat, amit a `letolt.mjs` bemásol. Ha rábukkansz valamire,
amelyik nem stimmel, két lehetőséged van: kézzel javítod a `helyek.json`-t
(és **nem** futtatod újra a letöltést, mert az felülírja), vagy beküldöd a
javítást a Wikidata-nak, ami tartósabb.

A `kutatas.md` 2026-10-06-án megnézte, hogy ez a kockázat mennyire valós.
Nem elméleti: **a magyar mezőben 77 helyen román helynév áll**
("Valea Albá", "Dealu Mare"), ezek többsége Nagy-Albás megyében, és tömegesen
jöttek létre — a 42-es és a 77-es lista is ugyanaz a néhány közreműködő
munkája. Ehhez jön **10 zárójeles magyar név** ("Pirita (Románia)") és **1
magyarázó mondat** ("Rudafalu Romániában, Hunyad megyében").

Ezek a hibák a **Wikidata-n** vannak, nem nálunk: a SPARQL-lekérdezés már
megköveteli a magyar címkét, tehát nincs kódoldali visszaesés. Az
`ismertHibak.json` felsorolja őket Q-számmal, hogy az `ellenoriz.mjs` ne
tételezze hibának a már dokumentáltat, de szóljon, ha **új** elem jelenik meg
ebben az osztályban.

A magyar nevet nem a román alakból lehet kitalálni. A KIA helységnévtára
(`kia.hu/kiakonyvtar/**konyvtar**/erdely/erd2002/hnevta02.pdf` — a `konyltar`
elírás 404) rászúrva viszont kiderül, hogy **a 77-ből egyetlen használható
magyar nevet sem ad**: 40-nél a magyar né mező üres, 35-nek nincs bejegyzése,
a 2 „nevet" adó pedig a másik hasábból származó tévedés
(`Valeaglodului`, `La padure`). Ezeknél a falvaknál a magyar név egyszerűen
**nem létezik** — a 1910 körüli magyar lakosság olvadt fel, és a forrás nem
őrzi a nevüket.

Ezért itt nem javítunk semmit, és ezt szándékosan így értjük:

- **Nem írunk bele magyar nevet**, mert akkor kitalálnánk egyet.
- **Nem töröljük a hamis magyar címkét a Wikidata-n**, mert a lekérdezés
  `FILTER(LANG(?hu) = "hu")`-val kötelezővé teszi, tehát a törlés nem
  névnéven hagyja a falut, hanem **kitörli a keresőből** (3167 → 3090). Ma a
  felhasználó `Dealu Mare (Kolozsvár)`-t lát, ami románul is elmondható;
  törlés után „Nincs találat" lenne. Ez egyértelmű veszteség.

A reális út a **javítása** link: aki ismeri a magyar nevet, a Wikidata-n írja
be. A részletes mérés a [`kutatas.md` „A 77 magyar név"](kutatas.md) fejezetében.

424 helységen a magyar név megegyezik a románnal (nincs magyar exonim) — ez
nem hiba, csak így jött, és a számláló kileli, ha érdekel.

Két helység tudatosan hiányzik, mert a Wikidata-n nincs magyar nevük:
**Kézdiszentvincent** és **Borosjenő**. Ha egyszer valaki hozzáadja őket,
az `ellenoriz.mjs` szól.

### A "javítása" link

Minden találat mellett van egy **javítása** link, ami a helység Wikidata-oldalát
a **szerkesztő űrlapjával** nyitja meg (`?action=edit&uselang=hu`):

```
https://www.wikidata.org/wiki/Q16898189?action=edit&uselang=hu
```

Ez a legfontosabb gomb az oldalon, mert a legtöbb hiba itt **nem a kódban** van,
hanem a Wikidata-ban, és a `helyek.json` a következő letöltéskor felülíródik.
Aki itt javít, az a forrást javítja, és mindenki ugyanazt látja utána.

**A link célját nem a `helyek.json` `wikidata` mezőjéből építjük**, hanem a
`q` azonosítóból (`wikidataLink()` a `keres.js`-ben). Ennek oka egy valódi
bug, amit 2026-10-08-án találtam meg: a korábbi kód
`encodeURIComponent(h.wikidata)`-val építette a linket, ami az **egész URL-t**
kódolja, tehát a `https://` is `%3A%2F%2F` lesz belőle. A böngésző ezt
relatív útvonalnak nézi, és a link a saját domainünkre mutat:

```
https%3A%2F%2Fwww.wikidata.org%2Fwiki%2FQ16898189
  ↓ amit a böngésző megnyitna
http://localhost:8123/https%3A%2F%2Fwww.wikidata.org%2Fwiki%2FQ16898189
```

A `helyek.json` mezője tehát rendben volt, csak a megjelenítés volt rossz.
A `proba.mjs` ezt azért nem fogta meg, mert a link **szövegét** nézte
("Wikidata"), nem a `href`-et. Mostantól mindkettőt.

Ez a hibaosztály érdemi tanulsága: **egy ellenőrzés, ami a látható szöveget
nézi, nem ellenőriz semmit.** Ha a kimenet nem látható helyen jelenik meg,
azt is ellenőrizni kell.