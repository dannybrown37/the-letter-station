import { makeShoppingTrip, matchList, listLine, SHOP_STORES, LIST_SIZE } from "./shopping-logic.js";

const CSS = `
.shop-store { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; text-align: left; }
.shop-store .giant { font-size: 2.4rem; margin: 0; }
.shop-store .store-name { font-size: 1.4rem; }
.shop-list { display: grid; gap: 6px; }
.shop-item { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 12px; border-radius: 14px;
  background: var(--panel); color: var(--ink); font-size: 1.15rem; font-weight: 800; text-align: left; }
.shop-item .box { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; border: 3px solid var(--line);
  display: grid; place-items: center; font-size: 1rem; }
.shop-item b { color: var(--yellow); font-size: 1.4rem; }
.shop-item.got .what { opacity: .6; text-decoration: line-through; }
.shop-item.got .box { background: var(--green); border-color: var(--green); color: #fff; }
.shop-card { text-align: left; }
.shop-shelf { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 10px 16px; border-radius: 18px;
  background: var(--panel); border-bottom: 10px solid #6b4a2b; margin-top: 12px; }
.shop-snack { min-height: 64px; padding: 6px; border-radius: 14px; background: var(--card); color: var(--ink);
  font-size: 1.05rem; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.shop-snack.taken { visibility: hidden; }
.shop-snack.nope { animation: shake .4s; }
.shop-cart { display: flex; align-items: center; gap: 8px; min-height: 52px; margin-top: 12px; font-size: 1.1rem; font-weight: 900; }
.shop-cart .cart { font-size: 2rem; }
.shop-cart span.item { padding: 4px 10px; border-radius: 999px; background: var(--green); color: #fff; font-size: .95rem;
  animation: pop-in .35s cubic-bezier(.3, 1.6, .5, 1); }
.shop-belt { display: grid; gap: 10px; margin: 12px 0; }
.shop-belt .shop-snack { min-height: 64px; border: 3px dashed var(--line); }
.shop-belt .shop-snack.scanned { display: none; }
.receipt { background: var(--panel); border: 2px dashed var(--line); border-radius: 12px; padding: 14px 16px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace; text-align: left; font-size: 1.05rem; line-height: 1.6; }
.receipt .head { text-align: center; font-weight: 900; font-size: 1.2rem; }
.receipt .rc-line { animation: pop-in .3s ease-out; }
.receipt hr { border: 0; border-top: 2px dashed var(--line); margin: 8px 0; }
.receipt .thanks { text-align: center; font-weight: 900; }
`;

const TITLE = "Shopping Trip 🧺";
const BY_NAME = [...SHOP_STORES].sort((a, b) => a.name.localeCompare(b.name));
let shop = SHOP_STORES.find((s) => s.name === "Publix");
let ui;

function addStyle() {
  if (document.getElementById("shopping-css")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "shopping-css", textContent: CSS }));
}

const beep = () => ui.tone([1568], "square", 0.06);

export function shopping(kit) {
  ui = kit;
  addStyle();
  aisle();
}

function storeTitle(s) {
  const { h, brandText } = ui;
  return h("div", { class: "shop-store" },
    h("span", { class: "giant" }, s.emoji),
    h("div", {}, h("div", { class: "store-name", style: brandText(s.color) }, s.name)));
}

function aisle() {
  const { h, screen, say, speak, boop, tone, strip } = ui;
  const trip = makeShoppingTrip();
  const got = new Set();
  const cart = [];
  const rows = trip.list.map((item) => h("button", { class: "shop-item", onclick: () => speak(listLine(item)) },
    h("span", { class: "box", "aria-hidden": "true" }),
    h("span", { class: "what" }, item.clue === "word" ? item.word : ["a snack with ", h("b", {}, item.letter)])));
  const cartBox = h("div", { class: "shop-cart" }, h("span", { class: "cart", "aria-hidden": "true" }, "🛒"), "Cart is empty");
  const result = h("div");

  const shelf = h("div", { class: "shop-shelf" }, trip.shelf.map((word) => {
    const b = h("button", {
      class: "shop-snack",
      onclick: () => {
        if (b.classList.contains("taken") || got.size === LIST_SIZE) return;
        const i = matchList(trip.list, got, word);
        if (i < 0) {
          b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
          boop();
          say(`We don't need ${word}. Check the list!`);
          return;
        }
        got.add(i);
        cart.push(word);
        b.classList.add("taken");
        rows[i].classList.add("got");
        rows[i].querySelector(".box").textContent = "✓";
        if (cart.length === 1) cartBox.lastChild.remove();
        cartBox.append(h("span", { class: "item" }, word));
        tone([660, 880], "sine", 0.08);
        if (got.size < LIST_SIZE) { say(`${word}! In the cart.`); return; }
        say(`${word}! We got everything. Time to check out!`);
        result.replaceChildren(h("button", { class: "next", onclick: () => register(cart) }, "🧾 Check out"));
        requestAnimationFrame(() => result.scrollIntoView({ behavior: "smooth", block: "end" }));
      },
    }, word);
    return b;
  }));

  const prompt = `Let's shop at ${shop.name}! We need ${trip.list.map(listLine).join(", ")}.`;
  screen(TITLE,
    strip(BY_NAME.map((s) => h("button", {
      class: s === shop ? "chip on" : "chip",
      style: s === shop ? { background: s.color } : {},
      onclick: () => { shop = s; aisle(); },
    }, `${s.emoji} ${s.name}`))),
    h("div", { class: "card compact shop-card" },
      storeTitle(shop),
      h("div", { class: "sub" }, "📝 Shopping list · tap a line to hear it"),
      h("div", { class: "shop-list" }, rows)),
    shelf,
    cartBox,
    result);
  say(prompt);
}

function register(cart) {
  const { h, screen, say, celebrate } = ui;
  let scanned = 0;
  const receipt = h("div", { class: "receipt" },
    h("div", { class: "head" }, `${shop.emoji} ${shop.name}`), h("hr"));
  const result = h("div");
  const belt = h("div", { class: "shop-belt" }, cart.map((word) => {
    const b = h("button", {
      class: "shop-snack",
      onclick: () => {
        if (b.classList.contains("scanned")) return;
        b.classList.add("scanned");
        beep();
        scanned += 1;
        receipt.append(h("div", { class: "rc-line" }, `${scanned}. ${word}`));
        if (scanned < cart.length) { say(`Beep! ${word}.`); return; }
        receipt.append(h("hr"), h("div", {}, `${cart.length} items`), h("div", { class: "thanks" }, `Thank you for shopping at ${shop.name}!`));
        celebrate(`${cart.length} items. Thank you for shopping at ${shop.name}!`);
        result.replaceChildren(h("button", { class: "next", onclick: aisle }, "🧺 Shop again"));
        requestAnimationFrame(() => result.scrollIntoView({ behavior: "smooth", block: "end" }));
      },
    }, `📦 ${word}`);
    return b;
  }));
  screen(TITLE,
    h("div", { class: "card compact shop-card" },
      storeTitle(shop),
      h("div", { class: "prompt" }, "🧾 Tap each one to scan it!")),
    belt,
    receipt,
    result);
  say("Tap each snack to scan it. Beep!");
}
