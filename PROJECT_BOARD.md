# Helynévkereső

- **Status:** active
- **What:** Hungarian, Romanian and German names of Transylvanian places side by side; a mivelkezdjem.hu experiment
- **URL:** https://helykereso.gergobalogh.me
- **Post where:** your Facebook profile; Transylvanian Facebook groups (shortlist in `inspiration/docs/placesearch-facebook-groups.md`)
- **Next:** Place pages live from 2026-11-09 (4.1.0): sitemap submitted in Search Console (sc-domain:gergobalogh.me) and indexing requested for /hely/ms/szoverd, /hely/cj/kolozsvar, /hely/zk/beregszasz and /megyek/cj on 2026-11-09, all four were unknown to Google before; around 2026-11-23 check helykereso's impressions and indexed count with gergobalogh.me's `scripts/search-console-baseline.py` (filter on helykereso). Later: a pitch video (/pitch-video), then the posts: your Facebook profile and one group from the shortlist (where a group bans self-promotion, ask an admin first).
- **Updated:** 2026-11-09

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
