# Helynévkereső

- **Status:** active
- **What:** Hungarian, Romanian and German names of Transylvanian places side by side; a mivelkezdjem.hu experiment
- **URL:** https://helykereso.gergobalogh.me
- **Post where:** your Facebook profile; Transylvanian Facebook groups (shortlist in `inspiration/docs/placesearch-facebook-groups.md`)
- **Next:** Google-Extended allowed in `robots.txt` (2026-11-12, live as `438b7e7`; `seo.mjs` writes it, since the build regenerates robots.txt): Cloudflare's managed block still disallows it, Google follows the less strict rule, so Gemini apps can use the pages. Search Console 2026-11-12: 4,783 old `?q=` search URLs are "alternate page with proper canonical" (expected), `/megyek/sb.html` 307s to `/megyek/sb` (Cloudflare Pages default). | AEO (2026-11-11, see gergobalogh.me board): Bing Webmaster Tools verified (meta tag, `fbf04c2`), sitemap submitted. Claude said it knows no search that shows Transylvanian place names in all three languages side by side, so this is the page AI answers miss most; AI answers cite adatbank.ro for it. | Place pages live from 2026-11-09 (4.1.0): sitemap submitted in Search Console (sc-domain:gergobalogh.me) and indexing requested for /hely/ms/szoverd, /hely/cj/kolozsvar, /hely/zk/beregszasz and /megyek/cj on 2026-11-09, all four were unknown to Google before; around 2026-11-23 check helykereso's impressions and indexed count with gergobalogh.me's `scripts/search-console-baseline.py` (filter on helykereso). Later: a pitch video (/pitch-video), then the posts: your Facebook profile and one group from the shortlist (where a group bans self-promotion, ask an admin first).
- **Updated:** 2026-11-12

## Build
- [x] Wikidata download: Hungarian, Romanian and German names for the 16 counties of Transylvania, Partium and Banat
- [x] Search in all three languages, without diacritics too, plus a county picker
- [x] Beyond the border: Kárpátalja, four Hungarian border counties and the Vojvodina Banat (24 areas, 6617 places)
- [x] Data checks: duplicates, same-name villages told apart, German names from the KIA gazetteer (data 4.0.0)
- [x] One page per place, so a search for one village („Szövérd románul”) can find it: 4.1.0, 2026-11-09 (gergobalogh.me Search Console showed 0 impressions for helykereso in 90 days; its 4,710 indexed-as-alternate URLs were `/?q=` copies of the homepage)
- [ ] Browser extension: the Hungarian, Romanian and German names shown on Google Maps and OpenStreetMap for Transylvania, from this project's data; a working prototype first, good enough for a 20-second screen recording (the user's yes, 2026-11-01)

## Polish
- [x] Heritage paper design, data version and gergobalogh.me credit in the footer
- [x] Static county pages, sitemap and share image for search and link previews
- [x] Umami analytics with search events
- [x] Public at helykereso.gergobalogh.me, no password

## Distribute
- [ ] Post on your Facebook profile
- [ ] Post in a Transylvanian Facebook group
- [x] 2026-10-30 Reply to a place-name question in Erdélyi élmények — https://www.facebook.com/groups/erdelyielmenyek/permalink/1946468452994835/?comment_id=1946483086326705&reply_comment_id=1947863689521978
