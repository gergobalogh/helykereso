# `kia/` — a szabó.adatbank.ro adatai

[Szabó M. Attila: *Erdélyi és moldvai helységnévtár*](https://szabo.adatbank.ro/)
leképezése a [`helyek.json`](../helyek.json) soraira. Ez a legnagyobb
forrás, amit a magyar helységnevekhez ma fellelhetünk — és a legtöbb,
amiben mi lemaradtunk.

## A német nevek már bent vannak, a többi még nem

**4.0.0-tól** a [`nemetJavitasok.json`](nemetJavitasok.json)-t a
`letolt.mjs` olvassa, és a sorok német nevei onnan jönnek: a
helységek **653-ról 2137-re** szaporodtak, és 118 helyen van második (és
további) német neve is (`deAlt`).

A magyar (`magyar-nevek.json`) és a román (`roman-valtozatok.json`)
névanyag **egyelőre kutatási anyag**: senki nem olvassa őket, és semmi nem
támaszkodik rájuk. Bedszivásuk külön döntés — a `hu` mező egyetlen
értéket fogad, a történeti nevek behozatala a sor értelmezését is
változtatja meg.

### Licenc

A KIA **nem CC0**. Az *Erdélyi helységnévszótár* második, bővített és
javított kiadásának digitalizált változata, a
[Erdélyi Magyar Adatbank](https://szabo.adatbank.ro/) (Transindex)
szerzői jogú műve.

Ezért a `helyek.json`-ban **nem** CC0 az egész adatminden: az új
`licenc` mező, az oldal látható forrásjelölése és az `index.html`
strukturált adata (`isBasedOn`) kimondja, hogy a német nevek kb. 1600
helynél innen valók, és azokra a forrás megjelölése kötelező.

Ha van engedélyed a felhasználásra, a jelölés maradhat; ha nincs, a
német nevek kikerülnek a publikált adatból, és a `kia/` mappa megmarad
kutatási anyagnak. A `deAlt` mező egyébként is 100%-ban KIA-anyag.

## Fájlok

| fájl | mi |
|---|---|
| [`raw.json`](raw.json) | a lekapart KIA, **6024 sor**, változatlan |
| [`lekapar.mjs`](lekapar.mjs) | újrakapja a `raw.json`-t a KIA oldaláról |
| [`kinyeres.mjs`](kinyeres.mjs) | a `raw.json`-ból csinálja a többi fájlt |
| [`nemetJavitasok.json`](nemetJavitasok.json) | **a letöltőnek átadott, ellenőrzött német nevek** — Q-szám szerint |
| [`osszehasonlitas.mjs`](osszehasonlitas.mjs) | a két adathalmaz diffje — a „melyik a jobb" mérőszáma |
| [`nemet-nevek.json`](nemet-nevek.json) | **1681 helynek van német neve, amit a Wikidata nem ad meg** |
| [`nemet-nevek.tsv`](nemet-nevek.tsv) | ugyanez lapáthatóan |
| [`magyar-nevek.json`](magyar-nevek.json) | 2738 helynek van magyar neve(nk), ami nincs nálunk |
| [`magyar-nevek.tsv`](magyar-nevek.tsv) | ugyanez lapáthatóan |
| [`roman-valtozatok.json`](roman-valtozatok.json) | 2795 hely régi román neve(i), 5402 változat |
| [`nem-talalt.json`](nem-talalt.json) | 730 KIA sor, amit nem sikerült a helyünkhöz kötni |

## Használat

```sh
node kia/lekapar.mjs         # hálózat kell, kb. 1 perc, 201 lapot olvas
node kia/kinyeres.mjs        # a raw.json-ból a *.json fájlokat
node kia/osszehasonlitas.mjs # csak kiír, nem ír semmit
```

Csak a Node beépített moduljait használja, telepítés nem kell.

## Amit találtunk

### A darabszám nem a lényeg

A KIA 6024 sora, a mieink 5351 romániai hely — és a KIA *több*. Ez
csalóka mérőszám: mi határon túli (Kárpátalja, magyar határmegyék,
Vojvodina) 1266 hellyel bővülünk, tehát összesen 6617-rel nyerünk. De a
KIA 2738 olyan helynek ad magyar nevet, amit mi nem őrzünk, és ezek
nincsenek benne a 6024-ben külön sorként — a KIA egy sorban, vesszővel
listázza őket.

### A német nevek a legnagyobb hiányunk — és már be vannak csatornázva

A KIA soraiban **1968** romániai sor ad német nevet; a Wikidata **263**-at.
A 4.0.0 óta a leképezésben **2137** helynek van német neve.

A szűrés, amit a `kinyeres.mjs` a bevitel előtt elvégez (2930 név átmegy
29 kiesik): a `}` mögötti befogadó község levágva (39), a perjeles és
zárójeles nevek eldobva (2), a román névvel **egyenlő** nevek eldobva
(24 — `Arad`, `Deva`), a magyarral egyenlő nevek eldobva (23 —
`Bethlen`, `Wolfsberg`). Amit eldobunk, az nem veszteség: a kereső már
megtalálja azokat a néven, amin a felhasználó beütte.

A 34 „valós eltérés" közül egy kimagas: `Q1021466` **Prázsmár község**
(Prejmer) a Wikidata-n `Preßburg` német nevet visel, de **Preßburg
Brassó**. A KIA szerint Prázsmár = Tartlau/Tartlen/Tortalen. Ez
Wikidata-hiba, `ismertHibak.json`-beli tére.

### Amit a KIA csinál, és mi nem tudunk

- **Több magyar név egy sorban** — 3010 sorban. `Abrămuţ` → *Vedresábrány,
  Ábránymonostoros, Ábrahámmonostoros, Alsóábrány, Molnosábrány*. Mi
  pontosan egyet őrzünk (`hu` mező).
- **Régi román nevek** — 3299 sorban. Mi nem tartunk ilyen mezőt; a
  `roman-valtozatok.json` ezt pótolja.
- **Településbe olvasztott falak** — nálunk nincs `Râu Mare`, `Újboksán`,
  `Óboksán`; a KIA igen. A `nem-talalt.json`-ban vannak.
- **Szász nevek** — `(s)` jelöléssel, 14 sorban. Nem német, ezért
  külön mezőben (`kiaSzasz`), nem a német névlista részeként.

### Amit mi csinálunk, és a KIA nem

- térkép, koordináta (100%), Wikidata- és Wikipedia-link (100%)
- kereshető magyarul, románul, németül, ékezet nélkül, cirill átírással
- határon túli 1266 hely (Kárpátalja, magyar határmegyék, Vojvodina)
- 285 moldviai hely, ami a KIA-ban van, nálunk egyáltalán nincs
- megosztható URL, verziózott adat, újragenerálható statikus oldalak

## Hogyan illesztünk

Megyénként, **román néven** (97%), magyar néven csak akkor, ha a románra
nincs találat (3%). Ezt mérni kell, nem feltételezni — lásd a
`kinyeres.mjs` megjegyzéseit.

Három dolog, amit **nem** csinálunk:

- **A `}` utáni rész sem név, sem kereshető.** A KIA `saját név } befogadó
  község` alakban ír, és a község neve sok helyen nálunk is önálló
  helység. Ha a tartalékillesztés ezt is figyelembe venné, minden
  odaolvadó falu a község központjára esne. Ez az első python-s változat
  hibája volt: 1803 látszólagos találatból kb. 120 ilyen.
- **Az összetett sort nem kötjük helyhez.** `Săcele (Baciu + Cernat + …)`
  egyszerre ír le több falut, nem lehet egy Q-ra.
- **Több KIA sor egy helyre is illeszkedhet**, és akkor a névlista az
  összes sorból áll (Abrud környéke). Mapbe írva a második sor csendben
  felülírná az elsőt.

## Amit a `raw.json`-ban nem tudunk

A KIA magyar mezője nem névlista, hanem bibliográfiai jegyzet. 98%-a
tiszta, de van benne félmondat
(*„Fogadjisten (Székelyföldről Somoskán át érkezett székelyek
alapították 1776-ban…)"*) és összevonás-jelölés
(*„Hármasfalu (Atosfalva + Csókfalva + Székelyszentistván)"*). A
`kinyeres.mjs` ezt szétválasztja — a név a `kiaHuNev`-be, a többi a
`kiaHuJegyzet`-be —, de **kézzel kell átnézni**, mielőtt bármit
felhasználsz.

A lekapás 8 sort talál, aminek a megye-áblakapja üres a KIA oldalán
(lásd a `lekapar.mjs` kimenetét). Ezek törmelék, a `kinyeres.mjs` a
megyekulcsuk alapján kihagyja őket, de a `raw.json`-ban megmaradnak.

## A KIA maga

Szabó M. Attila munkája, 1999-től az Erdélyi Magyar Adatbankon. A
helységnévtár **2021-10-23-án** frissült utoljára — a `raw.json` ettől
függetlenül újrakapható, de a leképezés azóta nem változott.
