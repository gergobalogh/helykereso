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

## 1.0.0 — 2026-10-09

Az első verziózott állapot. Nincs előtte más: a git commitok megvannak,
de a site-on futó példányról nem derült ki, melyik adat tartozik hozzá.

- `verzio` mező a `helyek.json`-ban és a `helyek.min.json`-ban
- a footerben: „letöltve 2026-10-09 · adatverzió 1.0.0 · 3167 helység"
- új ellenőrzés: a `verzio` egyezik-e a `szabalyok.mjs`-belivel
- új ellenőrzés: a `helyek.min.json` — amit az oldal tényleg olvas —
  egyezik-e a `helyek.json`-nal. Ez a hiba eddig láthatatlan volt: minden
  ellenőrzés a nagy fájlt nézte, az oldal a kicsit olvassa.