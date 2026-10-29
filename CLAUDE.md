# The Letter Station

Learning game for the user's son (autistic). Special interests: letters, The Learning Station, Blippi, Little Baby Bum, Sing movies, US states, stores, restaurants, snacks. He loves asking "what states have a Publix?" Content should feed those interests.

## Hard constraints

- **Mobile first, phone only.** Portrait, ~390px wide. No desktop app planned. Big tap targets (≥48px), no hover-only UI, `font-size: 16px` on inputs (stops iOS zoom).
- **No build step, no dependencies.** Plain HTML/CSS/ES modules. Installable PWA (`manifest.webmanifest`). Must work when hosted as static files.
- **Kind feedback.** Wrong answers never end a round — he keeps tapping until he finds it (`choiceButtons` in `js/app.js`). No timers, no losing, no harsh sounds.
- **Read aloud, with a top-bar toggle (🔊/🔇, localStorage `narration`).** `say()` = automatic narration, obeys the toggle. `speak()` = something he tapped to hear (🔊 Hear it, word chips, kind badge); always talks. Use the right one.
- **Dark theme only** (user asked: the light theme was too bright). Use the `--bg/--card/--panel/--ink/--muted/--line` vars, never `#fff` backgrounds. Brand-colored text goes through `brandText()` so dark brand colors stay readable.
- Respect `prefers-reduced-motion` (already handled in CSS).
- User-entered text (video titles/questions) goes in via `textContent` only — the `h()` helper never uses innerHTML. Keep it that way.
- Don't hardcode YouTube video IDs or image URLs from memory; they rot or are wrong. Parent pastes videos; store images come from Wikipedia at runtime.
- Exception: video packs (`SING_VIDEOS` in data.js) are OK if each ID was found by search and checked with YouTube oEmbed (`https://www.youtube.com/oembed?format=json&url=...` → 200). Rows whose thumbnail is YouTube's 120x90 placeholder are hidden at runtime (`isDeadThumb`).

## Layout

```
index.html            shell: topbar (home btn, title, narration toggle, star count) + <main id=app>
style.css             all styles; CSS vars in :root
manifest.webmanifest  PWA
icon.svg
sw.js                 service worker: offline. Own files network-first (deploys show up at once), Wikipedia images cache-first. Add new app files to SHELL_FILES.
js/data.js            STATES, KINDS, STORES, WORDS, CATEGORY_INFO, VIDEO_QUESTIONS, VIDEO_CHANNELS
js/logic.js           pure, testable: question generators, letter helpers, parseYouTubeId
js/app.js             DOM: h() helper, speech/sounds/confetti, stars, screens, hash router
test/logic.test.js    node:test, table-driven, seeded RNG
```

Flow: `location.hash` → `route()` → `GAMES[i].run()` → `screen(title, ...nodes)` replaces `<main>`.

## Games (GAMES array in app.js)

| id | What |
|---|---|
| storeHunt | "Which state has a X?" 4 state choices; flips to "does NOT have" for stores in >25 states; skips stores in all 50 |
| yesNo | "Does STATE have a X?" |
| letterTrain | "Which {category} starts with L?" category tabs or Mix |
| letterExplorer | letter grid → words per category, tap to hear |
| storeFinder | pick store → 50-state grid lights up; pick state → its stores |
| videoStation | parent adds YouTube links (localStorage) → embed (youtube-nocookie) + thinking questions |

To add a game: write a `run` function using `screen()`, add an entry to `GAMES`. Home tiles are a 2-col grid; first and last tiles span full width. Keep the count working with that layout.

## Data rules

- `STORES` mixes regional and national chains (user asked for Walmart, Target, etc.). Each store has `name, wiki?, emoji, color, kind, states[]`. Use `ALL` / `allExcept(...)` in data.js for near-national chains. `HUNTABLE_STORES` (logic.js) leaves out stores in all 50 states.
- `kind` must be a key of `KINDS` (grocery, gas, restaurant, superstore, home, craft, furniture, warehouse). Tests enforce this, and that every state code is real.
- Footprints are approximate. The original 22 came from memory; the Oct 2026 additions were web-researched (store locators, Wikipedia, ScrapeHero). Look up new stores the same way, don't guess. If the user corrects one, just update it.
- The user's family likes FL chains (Busy Bee, Vale, 4 Rivers) and Utah/West chains (Zupa's, R&R, Stater Bros). Vale = Vale Food Co, labeled just "Vale".
- `wiki` is optional = English Wikipedia page title; `storeImageUrl()` fetches `/api/rest_v1/page/summary/{wiki}` thumbnail, caches in localStorage `storeImages`, falls back to emoji. Verify titles before adding (disambiguation pages have no image, e.g. Bojangles → `Bojangles_(restaurant)`). No page: Busy Bee, Zupa's, Vale, 4 Rivers, R&R. No image: Fred Meyer, Stater Bros. Wikipedia rate-limits bursts from curl, so add a User-Agent and sleep ~4s between titles.
- `WORDS` entries must start with a letter (firstLetter skips digits, so "4 Rivers" would land under R).
- `WORDS` (stores/restaurants/snacks/states) feeds the letter games; anything goes here, national chains included.

## localStorage keys

`stars` (number), `narration` (bool), `videos` ([{id,title,questions[]}]), `storeImages` ({wiki: url|""}).

## Commands

- `npm start` — `python3 -m http.server 8080` (ES modules need http, not file://)
- `npm test` — `node --test test/*.test.js`

## Workflow

- TDD for logic in `js/logic.js` and data invariants; UI-only changes are checked with screenshots instead.
- Screenshot at phone width (390x844) with headless Chrome, plus one at desktop width. Then look at the images. Emoji render as boxes in headless Chrome; that's expected, phones show them.
  `google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=5000 --screenshot=/tmp/shots/x.png "http://localhost:8080/#storeHunt"`
- Git repo `dannybrown37/the-letter-station` (public); user handles git.
- Hosted on GitHub Pages from `main` root: https://dannybrown37.github.io/the-letter-station/ — pushing `main` deploys. Keep all paths relative (site lives under `/the-letter-station/`).

## Ideas backlog (user hasn't approved these yet)

Tappable SVG US map, more stores, a "spell the store" game, voice speed setting, a "big everything store" kind for Meijer/Wegmans.
