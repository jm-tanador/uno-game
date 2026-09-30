import { getStore } from "@netlify/blobs";

const COLORS = ["R", "Y", "G", "B"];
const N = { R: "Red", Y: "Yellow", G: "Green", B: "Blue", W: "Wild" };
const V = { S: "Skip", R: "Reverse", D: "+2", W: "", F: "+4" };
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function newDeck() {
  const d = [];
  for (const c of COLORS) {
    d.push({ c, v: "0" });
    for (let k = 0; k < 2; k++) {
      for (let n = 1; n <= 9; n++) d.push({ c, v: "" + n });
      ["S", "R", "D"].forEach((v) => d.push({ c, v }));
    }
  }
  for (let k = 0; k < 4; k++) { d.push({ c: "W", v: "W" }); d.push({ c: "W", v: "F" }); }
  return shuffle(d);
}
function take(g, n) {
  const out = [];
  while (n--) {
    if (!g.deck.length) { const top = g.discard.pop(); g.deck = shuffle(g.discard); g.discard = [top]; }
    if (!g.deck.length) break;
    out.push(g.deck.pop());
  }
  return out;
}
const wrap = (g, i) => ((i % g.players.length) + g.players.length) % g.players.length;
const step = (g, skip = 0) => { g.turn = wrap(g, g.turn + g.dir * (1 + skip)); };
function deal(g) {
  g.deck = newDeck();
  g.players.forEach((p) => (p.hand = take(g, 7)));
  const i = g.deck.findIndex((c) => /\d/.test(c.v));
  g.discard = g.deck.splice(i, 1);
  g.color = g.discard[0].c; g.turn = 0; g.dir = 1; g.winner = null; g.started = true;
  g.log = ["Game started!"];
}
const view = (g, pid) => ({
  code: g.code, started: g.started, turn: g.turn, color: g.color, dir: g.dir, winner: g.winner,
  top: g.discard.at(-1) || null, log: g.log.slice(-5),
  me: g.players.findIndex((p) => p.id === pid),
  players: g.players.map((p) => ({ name: p.name, n: p.hand.length })),
  hand: (g.players.find((p) => p.id === pid) || {}).hand || [],
});
const J = (o, s = 200) => Response.json(o, { status: s, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore({ name: "uno-rooms", consistency: "strong" });
  try {
    const b = await req.json();
    const name = (b.name || "Player").toString().slice(0, 16);
    if (b.action === "create") {
      let code;
      do { code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[rnd(24)]).join(""); } while (await store.get(code));
      const pid = crypto.randomUUID();
      const g = { code, players: [{ id: pid, name, hand: [] }], started: false, deck: [], discard: [], turn: 0, dir: 1, color: "R", winner: null, log: [] };
      await store.setJSON(code, g);
      return J({ pid, ...view(g, pid) });
    }
    const code = (b.code || "").toString().toUpperCase().trim();
    const g = code && (await store.get(code, { type: "json" }));
    if (!g) return J({ error: "Room not found. Check the code." }, 404);
    let pid = b.pid;
    let me = g.players.findIndex((p) => p.id === pid);

    if (b.action === "state") return J(view(g, pid));

    if (b.action === "join") {
      if (me < 0) {
        if (g.started) throw "That game has already started.";
        if (g.players.length >= 6) throw "Room is full (6 players).";
        pid = crypto.randomUUID();
        g.players.push({ id: pid, name, hand: [] });
        g.log.push(name + " joined");
      }
    } else {
      if (me < 0) throw "You are not in this room.";
      const p = g.players[me];
      if (b.action === "start") {
        if (me !== 0) throw "Only the host can start.";
        if (g.players.length < 2) throw "Need at least 2 players.";
        if (g.started && !g.winner) throw "Game already running.";
        deal(g);
      } else if (b.action === "play") {
        if (!g.started || g.winner || g.turn !== me) throw "It's not your turn.";
        const c = p.hand[b.idx], top = g.discard.at(-1);
        if (!c || !(c.c === "W" || c.c === g.color || c.v === top.v)) throw "You can't play that card.";
        if (c.c === "W" && !COLORS.includes(b.color)) throw "Pick a color.";
        p.hand.splice(b.idx, 1);
        g.discard.push(c);
        g.color = c.c === "W" ? b.color : c.c;
        g.log.push(`${p.name}: ${`${N[c.c]} ${V[c.v] ?? c.v}`.trim()}${c.c === "W" ? " → " + N[b.color] : ""}`);
        if (!p.hand.length) { g.winner = p.name; g.log.push(p.name + " wins!"); }
        else {
          const victim = g.players[wrap(g, g.turn + g.dir)];
          if (c.v === "D") { victim.hand.push(...take(g, 2)); step(g, 1); }
          else if (c.v === "F") { victim.hand.push(...take(g, 4)); step(g, 1); }
          else if (c.v === "S") step(g, 1);
          else if (c.v === "R") { g.dir *= -1; step(g, g.players.length === 2 ? 1 : 0); }
          else step(g);
        }
      } else if (b.action === "draw") {
        if (!g.started || g.winner || g.turn !== me) throw "It's not your turn.";
        p.hand.push(...take(g, 1));
        g.log.push(p.name + " drew a card");
        step(g);
      } else throw "Unknown action.";
    }
    g.log = g.log.slice(-30);
    await store.setJSON(code, g);
    return J({ pid, ...view(g, pid) });
  } catch (e) {
    return typeof e === "string" ? J({ error: e }, 400) : J({ error: "Server error" }, 500);
  }
};

export const config = { path: "/api/game" };
