# Interaktív térkép

## Cél

A keresőmező alatt jelenjen meg egy Leaflet-térkép, amikor a keresésnek van
koordinátával rendelkező találata. A térkép és a találati lista ugyanazt a
helyet jelölje ki, a találatok pedig a magyar Wikipédiára mutassanak, ha van
cikkük (különben a román Wikipédiára, végül csak a Wikidatára).

## Döntések

- Leaflet 1.9 + OpenStreetMap rasztercsempék; nincs API-kulcs.
- A koordinátát (`P625`) és a Wikipedia-sitelinket a letöltéskor kérjük le a
  Wikidata API-ból, és a statikus JSON-ba írjuk. A böngésző nem geokódol.
- Több találat kis pontként látszik, egyetlen vagy pontos találat nagyobb
  jelölőt és felugró névkártyát kap.
- A találati sor és a térképjelölő összekapcsolódik; koordináta nélküli hely
  továbbra is rendesen megjelenik a listában.
- A térkép csak találatnál foglal helyet. Ha a Leaflet vagy a csempék nem
  érhetők el, a kereső és a Wikipedia/Wikidata linkek működőképesek maradnak.

## Adatfolyam

1. `letolt.mjs` összeállítja a helységlistát.
2. `terkepadat.mjs` 50-es csomagokban, gyorsítótárral lekéri a koordinátákat
   és a `huwiki`/`rowiki` sitelinkeket.
3. `helyek.json` és `helyek.min.json` opcionális `lat`, `lon` és `wikipedia`
   mezőket kap.
4. `keres.js` csak az aktuálisan kirajzolt, koordinátás találatokat teszi a
   térképre.

## Ellenőrzés

- Egy pontos keresés középre állítja és megnyitja a helyet.
- Több találat közös nézetben látszik.
- A listából és a jelölőről ugyanaz a hely választható ki.
- A Wikipedia-link a magyar cikket részesíti előnyben, és biztonságos külső
  URL.
- Üres keresésnél és koordináta nélküli találatnál nincs üres térképdoboz.
- A meglévő keresési, megye- és Wikidata-link próbák változatlanul lefutnak.
