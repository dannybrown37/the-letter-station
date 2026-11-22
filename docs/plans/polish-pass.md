# Polish pass: existing games

Goal: better graphics, engagement and phone feel for the 12 existing games, without new games,
GAMES array changes, timers, losing or harsh sounds.

## Audit (headless Chrome, 390x844 and 360x740)

Method: CDP script (outside the repo) loads each `#hash`, plus answered states, and lists
interactive elements smaller than 44px. No page had unintended sideways scroll
(`scrollWidth == innerWidth` everywhere; the Key Shop board and store strips scroll on purpose).

| Game | Problems found |
|---|---|
| All quizzes | 🔊 Hear it button is 116x32 (<48). Correct answer: green + bump only, star count changes far away in the top bar. "🔥 N in a row" disappears on a wrong tap (only progress cue, and it goes backwards). |
| All | Top bar is pink in every game, no sense of "where am I". Screens swap with no transition. No haptics. Side safe-area insets ignored (landscape Key Shop). |
| All (bug) | Every 10th star: `addStar` says "Wow! 10 stars!", then `celebrate` immediately says the cheer, which cancels it. He never hears the milestone. |
| Store Hunt / Hyatt / Where Is It? | Store kind badge is a button 24px tall. "X is in N states 🔊" line is 21px tall. Store chips are 40px tall. |
| Guess Who? | At 360 the "🎲 Mixed" and "🎵 Station" tabs wrap to two lines (4 tabs). |
| Hyatt | At 360 "📊 Count" wraps. Brand chips 40px. |
| Friends | Single-line fact chips are 40px tall. |
| Letter Pop | Pop sound is a square wave (the harshest oscillator). |
| Video Station | Empty state is one grey line; the one-tap Sing pack is hidden inside the grown-ups panel, so a fresh install has nothing to play. Grown-up buttons 43px. Channel links 40px. |
| Confetti | Emoji spin 540° in 1.6s: busy for a calm game. |
| Wrong answer | Dark red fill + shake reads as "bad". |
| Key Shop, Road Trip, Big Numbers, ABC Explorer, Letter Train | No size/overflow problems; they get the shared fixes. |

## Plan

### Shared (app.js shared helpers + style.css)

1. **Star trail** (logic, TDD): 5 slots in every quiz card. Each right answer fills one; it
   never empties on a wrong tap. 5/5 → small party (extra confetti, "Your star trail is full!"), then a
   fresh trail. `starTrail(count)` in logic.js. Streak text stays.
2. **One reward line** (logic, TDD, bug fix): `rewardLine({ cheer, extra, stars, party })`
   joins cheer + milestone into one utterance so nothing gets cut off.
3. **Star flies to the counter**: a ⭐ lifts from the tapped answer and flies to the top-bar
   count, which bumps. Skipped under reduced motion (counter still updates).
4. **Haptics**: one 20ms tick on a right answer via `navigator.vibrate` if it exists. Nothing on
   wrong taps.
5. **Right/wrong styling**: right = green with a ✓ badge and soft glow; wrong = dimmed, dashed
   outline, gentle wiggle (no red).
6. **Per-game color**: route sets `--game` from the GAMES entry; top bar and `theme-color`
   follow. New games get it free.
7. **Screen transition**: 200ms fade/rise on new screens (none under reduced motion).
8. **Tap targets ≥48px**: Hear it, chips, fact chips, grown-up buttons; kind badge and map line
   get an invisible bigger hit area so they look the same.
9. **Tabs**: never wrap; 4-tab rows shrink their font.
10. Safe-area left/right padding; calmer confetti (slower, less spin; 40 pieces on a full trail or every 10th star, else 18); triangle pop sound; `overflow-x: clip` so a bumping answer never makes the page scroll sideways.

### Per game

- **Video Station**: illustrated empty state (big 📺) with the Sing pack button right there.
- **Big Numbers**: "Step N of 101" under the ladder.
- Everything else: shared fixes only (they were already in good shape).

## Before / after sketches

Quiz card (Store Hunt, Guess Who?, Road Trip stop, Big Numbers quiz, Letter Train, Hyatt quiz):

```
BEFORE                                  AFTER
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ 🏠      Store Hunt 🛒  🔊 ⭐3 │ pink   │ 🏠      Store Hunt 🛒  🔊 ⭐4 │ green (game color)
├──────────────────────────────┤        ├──────────────────────────────┤      ▲
│ [Which state?] [Yes or No?]  │        │ [Which state?] [Yes or No?]  │      │ ⭐ flies up
│ ┌──────────────────────────┐ │        │ ┌──────────────────────────┐ │      │
│ │ [pic] Publix             │ │        │ │ [pic] Publix             │ │      │
│ │ Which state has Publix?  │ │        │ │ Which state has Publix?  │ │      │
│ │      (Hear it) 32px      │ │        │ │   ( 🔊 Hear it ) 48px    │ │      │
│ │  🔥 2 in a row!          │ │        │ │   ⭐ ⭐ ⭐ ☆ ☆  🔥 3       │ │      │
│ └──────────────────────────┘ │        │ └──────────────────────────┘ │      │
│ [ Florida  ] [ Utah     ]    │        │ [ Florida ✓] [ Utah     ]────┘
│ [ Ohio ▒▒▒ ] [ Maine    ]    │        │ [ Ohio ┄┄┄ ] [ Maine    ]    │
│   red=wrong                  │        │   dimmed, dashed = tried     │
└──────────────────────────────┘        └──────────────────────────────┘
```

Fifth star:

```
   ⭐ ⭐ ⭐ ⭐ ⭐   ← glows, extra confetti, "Great job! Your star trail is full!"
   next question: ☆ ☆ ☆ ☆ ☆  (fresh trail; never drops on a wrong tap)
```

Tabs at 360px:

```
BEFORE                         AFTER
[  🎲  ][ 🎤 Sing][⭐ LBB][ 🎵   ]   [🎲 Mixed][🎤 Sing][⭐ LBB][🎵 Station]
[Mixed ]                  [Station]   one line, slightly smaller font
```

Video Station, fresh install:

```
BEFORE                              AFTER
┌────────────────────────────┐      ┌────────────────────────────┐
│ Watch, then think! 🧠       │      │ Watch, then think! 🧠       │
│ No videos yet — ask a      │      │            📺              │
│ grown-up to add some below!│      │   No videos yet!           │
│ Find more on YouTube: ...  │      │ [ 🎤 Add the Sing songs ]  │
│ ▸ Grown-ups: videos        │      │ Find more on YouTube: ...  │
└────────────────────────────┘      └────────────────────────────┘
```

Reward flow:

```
tap right answer
   │
   ├─ scored(): streak+1, trail+1 ──► starTrail(trail) ─► {filled, party}
   │                                      │
   │                    live-fill the trail in the card (glow if party)
   ▼
celebrate(extra, fromEl, party)
   ├─ ding()  + vibrate(20)
   ├─ confetti(party ? 40 : 18)
   ├─ addStar() ── flyStar(fromEl → top-bar count) ── bump
   └─ say(rewardLine({cheer, extra, stars, party}))   ← one utterance
```

## Out of scope

- GAMES array, home grid, new games (parallel agent).
- Key Shop internals (keyshop.js): it already has rich feedback.
