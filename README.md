# The Letter Station

**▶️ Play it: https://dannybrown37.github.io/the-letter-station/**

Phone-first learning game: stores, states, letters, snacks, restaurants, and videos. Plain HTML/JS, no build, no dependencies. Every push to `main` deploys to the link above (~30s).

Jump straight to a game with its `#id`, e.g. [#keyShop](https://dannybrown37.github.io/the-letter-station/#keyShop), [#bigNumbers](https://dannybrown37.github.io/the-letter-station/#bigNumbers).

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
| ⭐ Friends | Little Baby Bum, Sing, and Learning Station characters with facts |
| ❓ Guess Who? | "I am a koala. Who am I?" — pick the character |
| 🔢 Big Numbers | Climb from one to a googol; quiz on names, zeros, and which is bigger |
| ⌨️ Key Shop | Full-size keyboard: pull keycaps, sand them, paint layers with your finger, hang finished keyboards in a gallery |
| 📺 Video Station | Grown-up pastes YouTube links; after watching, thinking questions |

Data lives in `js/data.js` — add stores (`STORES`) or words (`WORDS`) there. Store footprints are approximate.

## On the phone

Host the folder anywhere static (GitHub Pages, Netlify drop), open it on the phone, then **Add to Home Screen** — it opens full-screen like an app. Stars and saved videos are stored on the device.
