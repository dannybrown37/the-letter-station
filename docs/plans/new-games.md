# New games: State Spotter, ABC Line-Up, Shopping Trip

Three games that reuse data already in the app (`STATES`, `STORES`, `WORDS`, the real map).
No new facts to research, so nothing can be guessed wrong.

## Shape of the change

```
js/app.js            + import 3 run functions, + kit() (shared helpers), + 3 GAMES entries  (12 → 15 tiles)
js/spotter.js        UI   ──uses──▶ js/spotter-logic.js   (pure)  ◀── test/spotter.test.js
js/lineup.js         UI   ──uses──▶ js/lineup-logic.js    (pure)  ◀── test/lineup.test.js
js/shopping.js       UI   ──uses──▶ js/shopping-logic.js  (pure)  ◀── test/shopping.test.js
sw.js                + 6 files in SHELL_FILES, bump shell version
```

Each UI module injects its own `<style>` once (static CSS via `textContent`), so
`style.css`, `index.html` and the Pages file list stay untouched. A parallel agent
is polishing `style.css`/`app.js`; this keeps the merge to a few lines in app.js.

```
app.js GAMES entry ── run: () => spotter(kit())
                                      │
          kit() = { h, svg, screen, say, speak, celebrate, boop, tone,
                    confetti, stateMap, strip, sayButton, brandText, COLORS, store }
```

## 1. State Spotter 📍 (`#spotter`)

Tap the real US map. Three tabs:

- **📍 Find it**: "Find Utah!" One target.
- **🔤 Letters**: "Find every state that starts with N!" (all of them; counter like Letter Pop).
- **🛒 Stores**: "Light up every Publix state!" Stores in 1–10 states only (bigger = tedious).

```
 tab ──▶ makeSpotRound(rng, type) ──▶ { targets: [codes], prompt bits }
                     │
                     ▼
         ┌──── map (stateMap) ◀─────────────────────┐
         │ tap state                                  │
         ▼                                            │
   spotTap(round, found, code)                        │
     ├─ "hit"   → paint green, say name, counter +1 ──┤
     ├─ "again" → already found, just say name ───────┤
     └─ "miss"  → boop, "That's Nevada. Find Utah!" ──┘   (3 misses → ring one target as a hint)
         │
     all found → celebrate → [🔁 New one]
```

Kind: no limit on taps, the miss line names the state he tapped (so a miss still teaches).

## 2. ABC Line-Up 🔠 (`#lineUp`)

Four words from one category (stores / restaurants / snacks / states). Tap them in A→Z
order; each one rides into the next train car.

- **ABC** tab: four different first letters.
- **Tricky** tab: same first letter, different second letters (look at letter two).

```
 makeLineUp(rng, { tricky }) ──▶ { category, letter?, words (shuffled), order (A→Z) }
            │
            ▼
   🚂 [  ] [  ] [  ] [  ]        ← train cars fill left to right
   ( Oreos ) ( Kit Kat ) ...     ← word buttons
            │ tap
            ▼
   word === order[next] ? ── yes → slide into car, speak word, next++
            │                       └─ next == 4 → celebrate, read line A→Z, [Next ➡️]
            no → wiggle + boop + hint ("Look for the letter closest to A" /
                                       "They all start with C. Look at letter two!")
```

Order ignores case, spaces and punctuation ("Chick-fil-A" sorts as "chickfila").

## 3. Shopping Trip 🧺 (`#shopping`)

Pick a store (strip of grocery / big store / warehouse / gas chains, brand colors), get a
3-item snack list, grab the items off the shelf, scan them at the register, get a receipt.

List lines are either the word ("Goldfish") or a letter clue ("a snack that starts with G").
Shelf = the 3 list items + 5 snacks whose first letters aren't on the list, so every clue
has exactly one answer.

```
 store strip ──▶ makeShoppingTrip(rng) ──▶ { list: [{word, letter, clue}], shelf: [8 words] }
                         │
                         ▼
   📝 list (✅ as found)        🛒 cart
   🥫 shelf ── tap ──▶ matchList(list, got, word)
                         ├─ index → item to cart, list line ✅, say it
                         └─ -1    → boop, "We don't need Oreos. Check the list!"
                         │
              all 3 → [🧾 Check out]
                         ▼
   register: tap each item to scan (beep) ──▶ receipt: store name, items, "3 items",
                                              "Thank you for shopping at Publix!" ⭐
```

## Tests (TDD, seeded RNG, table-driven)

- spotter: targets are real codes; letter round = exactly the states with that letter;
  store round = exactly that store's states and only stores in 1–10 states; spotTap table.
- lineup: `abcKey` squash table; order is sorted; ABC rounds have distinct first letters;
  tricky rounds share letter one and differ at letter two; every category can make both.
- shopping: shop stores are only the shopping kinds; list items are on the shelf; first letters
  of list items are unique on the whole shelf; `matchList` table (word, letter clue, already got, miss).

## Decisions for Danny

- Home goes 12 → 15 tiles (5 rows). Checked it still fits 390x844 without scrolling.
- Styles live in each module (injected `<style>`), not style.css, to dodge merge conflicts.
- Shopping Trip has no prices (would be made-up numbers); it counts items instead.
- "Spell the store" from the backlog was left alone since it isn't approved yet.
