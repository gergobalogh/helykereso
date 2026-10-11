# Verziók

Az adat és a felület verziója együtt. A szám a
[`szabalyok.mjs`](szabalyok.mjs)-ben van (`VERZIO`), onnan kerül a
`helyek.json`-ba, a `keres.js` a footerben mutatja, és az `ellenoriz.mjs`
szól kő, ha a kettő elcsúszik.

**Mikor kell emelni a számot**

| emelés | mikor |
|---|---|
| `2.0.0` | a felület vagy az adat értelme megváltozott: új mező a sorban, elgondolt toldalék, törölt helység |
| `1.1.0` | új szabály vagy új ellenőrzés, ami a felhasználó által látott adatot nem változtatja |
| nincs | a napi letöltés önmagában; az új adatok nem jelentenek új verziót |

A szabály azért ilyen szigorú, mert a felhasználó nem adatbázist néz, hanem
találatokat. Ha egy javítás csendben megváltoztatja, mit lát, akkor a
verzió emelése kötelesség, nem extra.

Megjegyzés: a 121 jelölt hely magyar neve néha csak írásmódban tér el a
romántól ("Vále"/"Vale", "Dealu Ștefăniței"/"Dealul Ștefăniței"), ezért a
`szabalyok.mjs` `ugyanazANev()` függvénye ezt elfogadja. Ez csak az
ellenőrzésen fut, keresésre nem.

## 3.0.0 — 2026-10-11

Határon túl, egy projektben: Kárpátalja (UA, oblaszty + 6 járás, `ZK`),
négy magyar határmegye (`SZB`, `HJB`, `BEK`, `CSC`) és három vajdasági
bánsági körzet (`EBN`, `KBN`, `DBN`) — **5314-ről 6617 helységre**.
A `MEGYEK` átírása most sem volt elég; a bővítés négy csendes hibát és egy
hiányos modellt hozott elő:

- **Kárpátalja falvainak zöme ukrán címkés csak** (48 helyett ~600).
  A `hu` most `OPTIONAL`, tartaléknyelvvel (`uk`/`sr`): ahol nincs magyar
  címke, a sor a tartaléknevet mutatja, automatikusan jelölve (`huPotolt`,
  35 hely) — ugyanaz a minta, mint a `Dealu Mare`-döntés. A cirill neveket
  a kereső átírva indexeli (`Ужгород` → `uzhhorod`), a közös `cirillAtir()`
  a `szabalyok.mjs`-ben van.
- **A `Q21672098` ukrán *falu*, nem kistérség.** 506 A-szinten talált
  elem kivétel nélkül falu (Akli, Beregújfalu, Bilke); az igazi
  kistérségek `Q104841013`-asok ("Ungvár község") és maguktól kiesnek.
  Az első javítás (szint-alapú szűrés) rossz volt, a mérés döntötte el.
- **A 6. németnév-szabály**: ami az ukrán/szerb név átírásával betűre
  egyezik, az nem német (`Strymba` == ukrán `Стримба`) — 85 hely. A valódi
  cipszer nevek (`Schenborn`, `Solotwyno`) nem betűazonosak, megmaradnak.
  A magyarral azonos írású német neveket (`Bethlen`, `Lippa`, `Wolfsberg`)
  megmértük és meghagyjuk: az azonosság nem másolás-jelet ad.
- **Unió-duplikátumszűrés** (`szurDuplikat`, közös): magyar ÉS román néven
  csoportosít, a döntés bent lévőhöz mér. Helyrehozta az Ajton-összevonást
  (amit az átmeneti magyar-kulcs széttört), összehozta Komlóst, és egy
  rejtett rokont is megfog (a község a székhelyfalvával a vele azonos nevű
  szomszéd falut is kitörölte volna).
- **Árva szülő** (Huszt): a szülő címke nélküli adminisztratív maradvány —
  a sor önállóként szerepel, számlálva.

Séma: `ro` lehet `null` (47 hely, pl. Szőreg), új mezők `alt` (813),
`orszag`, `huPotolt`; a sorvégen országjelölés csak határon túl, a
megye szó helyett `körzet` / puszta `Kárpátalja` ahol kell. A `kia.mjs`
az új területeken csendben kihagy (nincs KIA-fedés); egy új `merve`
így is előjött (Drenkova — elutasítva, egyetlen forrás). A
`nincsMagyarNev.json` változatlan (128): a két új zárójeles jelölt
pótolt nevű, tehát eleve jelölt.

**Miért 3.0.0:** új mezők, új értelmű sorok (pótolt név, országjelölés),
új szabályok — a felhasználó más találatokat lát, mint 2.0.0 alatt.

## 2.0.0 — 2026-10-10

Partium + Bánság: a katalógus 9-ről **16 megyére** bővült (BH, SJ, SM, MM,
AR, TM, CS), **3167-ről 5314 helységre**. A `MEGYEK` átírása önmagában
kevés volt — a bővítés három csendes hibát hozott elő, mindhármat javítva,
mindhárom ellenőrzéssel:

- **Három megyeszékhely kimaradt** (Arad, Temesvár, Resicabánya). A
  „bármelyik nem-önálló osztály kizár" szabály törölte őket, mert van ilyen
  mellékosztályuk (urbánus terület, egyetemváros). A döntés fordított: ha
  *bármelyik* osztály lakott hely, az helység — kivéve a `VETO_OSZTALY`
  három sosem-önálló osztályát (városnegyed, negyed, óváros), mert azok
  városrészek akkor is, ha falu-osztály is van mellettük (`Galac`,
  `Ótorda`, `Brassópojána`). Mellékhaszon: Kolozsvár a kanonikus
  `Q100188`-cal szerepel (eddig a duplikált `Q16898189` nyert), és
  bekerült Szászavinc (Geamăna) is.
- **Három perjeles „német" név átcsúszott** (`Avram Iancu / Keményfok`):
  a 3. és 4. szabály nem fogja meg őket, mert nincs bennük román ékezet.
  Az 5. szabály (`/`, `(` a német névben) 9 helyről veszi ki a hamis
  `de`-t; a letöltő külön listázza őket.
- **Két azonos sor ugyanabban a községben** (`Báródbeznye` kétszer Barátka
  községben: Beznea és Delureni — a KIA mindkettőre a Báródbeznyét adja).
  Ilyenkor a toldalék a román név, nem a község: `Báródbeznye (Beznea)`.

A bővítés hozadéka egy régi tévedés javítása is: **Borosjenő nem Hunyad,
hanem Arad megyében van** (Ineu) — most már az adatban, a `FOK` is oda
nézi. Tudottan hiányzó: már csak **Kézdiszentvincent** (1, nem 2).

Ismert Wikidata-hibák: `huRomanSzo` 77 → 85, `huZarojeles` 10 → 12
(mind az új megyékből, mind dokumentálva). A `huMondat` vessző-szabálya
finomodott: a „Fonóháza, Fonókismező" két név, nem mondat.

**Miért 2.0.0:** új helységek, új mezőértékek, három új szabály — a
felhasználó más találatokat lát, mint 1.1.0 alatt.

Mérés, ami mögötte van: a `kia.mjs` 17 új jelöltet adott a kibővült
`hu == ro` halmazra (569 hely): **4 elfogadva** (Rohány, Bojnica, Liborásdia,
Stájerlak — KIA + magyar Wikipedia infobox egyezik), **13 elutasítva**
(többségnél az infobox a román nevet adja, tehát az a használatban lévő
név; kettőnél a KIA „neve" zárda-leírás). A `nincsMagyarNev.json` 121 →
**128**: a 8 új `huRomanSzo` közül 7 kettős negatív (üres KIA-mező + üres
infobox), a nyolcadik (Dealu Corbului) kimaradt, mert az infobox a román
nevet adja — mint az Angofánál.
Determinizmus: két egymás utáni `letolt.mjs` bitre azonos `helyek.json`-t ad
(5314); az egyetlen nem-gyorsítótárazott élő függőség a B-lépés
osztály-lekérdezése.

## 1.1.0 — 2026-10-09

A „nincs magyar neve" jelölés, plusz két új kézi forrásfájl.

- `javitasokHu.json`: kézzel javított **magyar** nevek (a `javitasok.json`
  német párja). Most két bejegyzés: `Monostor` (Q10945639) és `Dumest`
  (Q11717176) — ezeknél a magyar Wikipedia infoboxának „magyar név" mezője
  és a KIA is ad magyar nevet, tehát két független forrás.
- `nincsMagyarNev.json`: az **121** hely Q-száma, amelynek nincs magyar
  neve. Ekkor a kereső a magyar név helyett a románt mutatja (ez
  kereshető), és apró jelölés szól róla. Ez a felhasználónak szól, nem az
  ellenőrzőnek.
- `huNincsNeve` mező a `helyek.json`-ban; a `keres.js` ebből rajzolja a
  jelölést, a toldalék után, hogy a név továbbra is a sor eleje maradjon.
- új ellenőrzések: nincs hamis jelölés (ahol jelölünk, ott a magyar név
  valóban a román); a `nincsMagyarNev.json` minden Q-száma jelölve van; a
  `javitasokHu.json` minden kulcsa érvényesül; a kézi javítás és a jelölés
  nem mond ellent egymásnak.

### Kiegészítés: a KIA-mérés a projektbe költözött

- `kia.mjs`: kiértékeli a KIA helységnévtárat (.cache-ből letöltve), és
  megmondja, hol van magyar név, amit a Wikidata nem őriz. Kutatási
  eszköz, nem része a letöltésnek.
- `kiaMagyarNev.json`: a mérés eredménye (17 hely), mindegyikhez kézi
  minősítés: **2 elfogadva** (Monostor, Dumest), **15 elutasítva** — a KIA
  magyar-név-mezőjébe román, szaxon vagy leírás került.
- új ellenőrzések: a `javitasokHu.json` minden bejegyzésének van KIA-
  megerősítése és `javítva` minősítése; a `nincsMagyarNev.json` egyik
  Q-száma sem lehet elfogadott magyar név; és nem maradhat feldolgozatlan
  (`merve`) bejegyzés.
- a `kia.mjs` megőrzi a kézi döntéseket újrafuttatáskor.

Négy csendes hiba buktatta meg a mérést (a `ş`/`ţ` alak, a pont utáni
PDF-jel, a két hasáb, és a községnevek `ș`/`ț` betűi) — mindegyik úgy
tűnt, mintha azt mérné, amit mér. A részletek a README-ben.

**Miért 1.1.0 és nem 2.0.0:** a találatok neve nem változik, csak kiegészül
egy jelöléssel. A szabály a 2.0.0-ra akkor lenne igaz, ha a felhasználó
egy másik helyet kapna.

Mérés, ami mögötte van (a `kutatas.md` részletesen): a visszanyert 93 helyből
44-nek a magyar neve a románnal egyezik, és mind a 44-nél a KIA és a
magyar Wikipedia is ezt mondja — vagyis ugyanaz az osztály, mint a 77,
csak nagyobb: legalább 121 hely. A teljes 468-as `hu == ro` halmaz KIA-
mérlegéből 13-nál van magyar név (ebből 2 áll két forrásból is) — a többi
átírás vagy más falu neve volt, ezért nem került be.

## 1.0.0 — 2026-10-09

Az első verziózott állapot. Nincs előtte más: a git commitok megvannak,
de a site-on futó példányról nem derült ki, melyik adat tartozik hozzá.

- `verzio` mező a `helyek.json`-ban és a `helyek.min.json`-ban
- a footerben: „letöltve 2026-10-09 · adatverzió 1.0.0 · 3167 helység"
- új ellenőrzés: a `verzio` egyezik-e a `szabalyok.mjs`-belivel
- új ellenőrzés: a `helyek.min.json` — amit az oldal tényleg olvas —
  egyezik-e a `helyek.json`-nal. Ez a hiba eddig láthatatlan volt: minden
  ellenőrzés a nagy fájlt nézte, az oldal a kicsit olvassa.