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