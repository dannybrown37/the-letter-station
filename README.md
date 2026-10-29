# The Letter Station

Phone-first learning game: stores, states, letters, snacks, restaurants, and videos. Plain HTML/JS, no build, no dependencies.

- `npm start` — serve at http://localhost:8080
- `npm test` — logic tests (Node's built-in runner)

## Games

| Tile | What it does |
|---|---|
| 🛒 Store Hunt | "Which state has a Publix?" — 4 state choices |
| 🤔 Yes or No? | "Does Texas have a Wawa?" |
| 🚂 Letter Train | "Which snack starts with G?" — mix or pick a category |
| 🔤 ABC Explorer | Pick a letter, see/hear stores, restaurants, snacks, states |
| 🗺️ Where Is It? | Pick a store → states light up; pick a state → its stores |
| 📺 Video Station | Grown-up pastes YouTube links; after watching, thinking questions |

Data lives in `js/data.js` — add stores (`STORES`) or words (`WORDS`) there. Store footprints are approximate.

## On the phone

Host the folder anywhere static (GitHub Pages, Netlify drop), open it on the phone, then **Add to Home Screen** — it opens full-screen like an app. Stars and saved videos are stored on the device.
