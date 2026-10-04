// Pure game engine. The whole game lives in one JSON-serialisable state object,
// so the same code runs in the browser and in the Node CLI.
import { ADJ, CONTINENTS, CONTINENT_TERRITORIES, TERRITORIES, TERRITORY_IDS } from './map.js';

export const COLORS = ['#e04848', '#3a7bd5', '#3fae5a', '#e0a020', '#9b59b6', '#2bb5b5'];
const SYMBOLS = ['infantry', 'cavalry', 'artillery'];
const START_ARMIES = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
const LOG_LIMIT = 400;

export class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg); };

// ---------- randomness (seeded, stored in state so games are reproducible) ----------
export function random(s) {
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rollDie = (s) => 1 + Math.floor(random(s) * 6);
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function log(s, text, extra) {
  s.log.push({ turn: s.turn, player: s.current, text, ...extra });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

// ---------- setup ----------
export function createGame({ players, seed = Date.now() % 2147483647, cardMode = 'fixed' }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) fail('Need 2-6 players');
  const s = {
    version: 1,
    seed,
    rngState: seed | 0,
    cardMode, // 'fixed' (set value by symbols) | 'progressive' (4, 6, 8, ... per trade)
    players: players.map((p, i) => ({
      id: i,
      name: p.name || `Player ${i + 1}`,
      type: p.type || 'bot', // 'human' | 'bot' | 'claude'
      color: p.color || COLORS[i],
      cards: [],
      alive: true,
    })),
    owner: {},
    armies: {},
    turn: 1,
    current: 0,
    phase: 'reinforce',
    pending: 0,
    conquered: false,
    conquest: null,
    tradeCount: 0,
    deck: [],
    discard: [],
    lastBattle: null,
    log: [],
    winner: null,
  };

  s.deck = TERRITORY_IDS.map((t, i) => ({ territory: t, symbol: SYMBOLS[i % 3] }));
  s.deck.push({ territory: null, symbol: 'wild' }, { territory: null, symbol: 'wild' });
  shuffle(s, s.deck);

  const n = s.players.length;
  const order = shuffle(s, [...TERRITORY_IDS]);
  order.forEach((t, i) => {
    s.owner[t] = i % n;
    s.armies[t] = 1;
  });
  // Distribute the remaining starting armies randomly, weighted toward fewer stacks.
  for (const p of s.players) {
    const mine = TERRITORY_IDS.filter((t) => s.owner[t] === p.id);
    let left = START_ARMIES[n] - mine.length;
    while (left-- > 0) s.armies[mine[Math.floor(random(s) * mine.length)]]++;
  }
  s.current = Math.floor(random(s) * n);
  log(s, `Game started with ${n} players (seed ${seed}).`);
  startTurn(s);
  return s;
}

// ---------- queries ----------
export const currentPlayer = (s) => s.players[s.current];
export const territoriesOf = (s, pid) => TERRITORY_IDS.filter((t) => s.owner[t] === pid);
export const armiesOf = (s, pid) => territoriesOf(s, pid).reduce((a, t) => a + s.armies[t], 0);
export const ownsContinent = (s, pid, c) => CONTINENT_TERRITORIES[c].every((t) => s.owner[t] === pid);
export const continentsOf = (s, pid) => Object.keys(CONTINENTS).filter((c) => ownsContinent(s, pid, c));

export function reinforcementCount(s, pid) {
  const base = Math.max(3, Math.floor(territoriesOf(s, pid).length / 3));
  return base + continentsOf(s, pid).reduce((a, c) => a + CONTINENTS[c].bonus, 0);
}

export function tradeValue(count) {
  const table = [4, 6, 8, 10, 12, 15];
  return count < table.length ? table[count] : 15 + 5 * (count - table.length + 1);
}

/** Fixed card values, as in the Risk: Global Domination "fixed" mode. */
export const FIXED_VALUES = { infantry: 4, cavalry: 6, artillery: 8, mixed: 10 };

/** Armies a valid set is worth in this game. Wilds count as whatever is best. */
export function setValue(s, cards) {
  if ((s.cardMode ?? 'progressive') === 'progressive') return tradeValue(s.tradeCount);
  const wilds = cards.filter((c) => c.symbol === 'wild').length;
  const kinds = new Set(cards.filter((c) => c.symbol !== 'wild').map((c) => c.symbol));
  if (wilds < 2 && kinds.size === 1) return FIXED_VALUES[[...kinds][0]];
  return FIXED_VALUES.mixed;
}

/** One-line description of what sets are worth, for status displays. */
export function cardValueText(s) {
  return (s.cardMode ?? 'progressive') === 'progressive'
    ? `next set worth ${tradeValue(s.tradeCount)}`
    : 'sets: 3 infantry 4, 3 cavalry 6, 3 artillery 8, one of each 10';
}

export function isValidSet(cards) {
  if (cards.length !== 3) return false;
  const wilds = cards.filter((c) => c.symbol === 'wild').length;
  if (wilds > 0) return true;
  const kinds = new Set(cards.map((c) => c.symbol));
  return kinds.size === 1 || kinds.size === 3;
}

/** All valid 3-card index combinations in a hand. */
export function validSets(cards) {
  const out = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isValidSet([cards[i], cards[j], cards[k]])) out.push([i, j, k]);
  return out;
}

/** The most valuable set in the current player's hand (indices), preferring ones that earn the +2 bonus. */
export function bestSet(s) {
  const p = currentPlayer(s);
  let best = null;
  for (const set of validSets(p.cards)) {
    const cards = set.map((i) => p.cards[i]);
    const score = setValue(s, cards) * 10
      + (cards.some((c) => c.territory && s.owner[c.territory] === p.id) ? 5 : 0)
      - cards.filter((c) => c.symbol === 'wild').length;
    if (!best || score > best.score) best = { set, score, value: setValue(s, cards) };
  }
  return best && { indices: best.set, value: best.value };
}

/** Territories reachable from `from` through territories owned by the same player. */
export function connectedOwned(s, from) {
  const pid = s.owner[from];
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const n of ADJ[stack.pop()]) {
      if (!seen.has(n) && s.owner[n] === pid) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  seen.delete(from);
  return seen;
}

const name = (t) => TERRITORIES[t]?.name ?? t;
function checkTerritory(t) {
  if (!TERRITORIES[t]) fail(`Unknown territory "${t}"`);
}
function checkPhase(s, ...phases) {
  if (s.winner !== null) fail('The game is over');
  if (!phases.includes(s.phase)) fail(`Not allowed in the ${s.phase} phase (need ${phases.join('/')})`);
}

// ---------- turn flow ----------
function startTurn(s) {
  const p = currentPlayer(s);
  s.phase = 'reinforce';
  s.conquered = false;
  s.conquest = null;
  s.lastBattle = null;
  s.pending = reinforcementCount(s, p.id);
  s.placements = [];
  log(s, `${p.name}'s turn: ${s.pending} reinforcements.`);
}

export function tradeCards(s, indices) {
  checkPhase(s, 'reinforce');
  const p = currentPlayer(s);
  const idx = [...new Set(indices.map(Number))].sort((a, b) => b - a);
  if (idx.length !== 3 || idx.some((i) => !(i >= 0 && i < p.cards.length))) fail('Pick 3 different cards from your hand');
  const cards = idx.map((i) => p.cards[i]);
  if (!isValidSet(cards)) fail('Those cards are not a valid set (3 of a kind, one of each, or any with a wild)');
  for (const i of idx) p.cards.splice(i, 1);
  s.discard.push(...cards);
  const value = setValue(s, cards);
  s.tradeCount++;
  s.pending += value;
  let msg = `${p.name} traded cards for ${value} armies`;
  const bonusT = cards.find((c) => c.territory && s.owner[c.territory] === p.id);
  if (bonusT) {
    s.armies[bonusT.territory] += 2;
    msg += ` (+2 on ${name(bonusT.territory)})`;
  }
  log(s, msg + '.');
  return value;
}

export function place(s, territory, count = 1) {
  checkPhase(s, 'reinforce');
  checkTerritory(territory);
  const p = currentPlayer(s);
  count = Number(count);
  if (p.cards.length >= 5) fail('You hold 5+ cards and must trade a set first');
  if (s.owner[territory] !== p.id) fail(`You do not own ${name(territory)}`);
  if (!Number.isInteger(count) || count < 1 || count > s.pending) fail(`Place between 1 and ${s.pending} armies`);
  s.armies[territory] += count;
  s.pending -= count;
  (s.placements ??= []).push({ territory, count });
  log(s, `${p.name} placed ${count} on ${name(territory)}.`);
  if (s.pending === 0) s.phase = 'attack';
}

/** Take back the most recent placement, as long as no battle has happened since. */
export function undoPlace(s) {
  checkPhase(s, 'reinforce', 'attack');
  const last = s.placements?.pop();
  if (!last) fail('Nothing to undo');
  s.armies[last.territory] -= last.count;
  s.pending += last.count;
  s.phase = 'reinforce';
  log(s, `${currentPlayer(s).name} took back ${last.count} from ${name(last.territory)}.`);
}

/** Roll one round of combat. Returns details of the dice. */
export function attack(s, from, to, dice = 3, { quiet = false } = {}) {
  checkPhase(s, 'attack');
  checkTerritory(from);
  checkTerritory(to);
  const p = currentPlayer(s);
  if (s.owner[from] !== p.id) fail(`You do not own ${name(from)}`);
  if (s.owner[to] === p.id) fail(`You already own ${name(to)}`);
  if (!ADJ[from].includes(to)) fail(`${name(from)} does not border ${name(to)}`);
  if (s.armies[from] < 2) fail(`${name(from)} needs at least 2 armies to attack`);
  const defenderId = s.owner[to];
  s.placements = []; // a battle locks in this turn's placements
  const a = Math.max(1, Math.min(Number(dice) || 3, 3, s.armies[from] - 1));
  const d = Math.min(2, s.armies[to]);
  const ar = Array.from({ length: a }, () => rollDie(s)).sort((x, y) => y - x);
  const dr = Array.from({ length: d }, () => rollDie(s)).sort((x, y) => y - x);
  let aLoss = 0;
  let dLoss = 0;
  for (let i = 0; i < Math.min(a, d); i++) {
    if (ar[i] > dr[i]) dLoss++;
    else aLoss++;
  }
  s.armies[from] -= aLoss;
  s.armies[to] -= dLoss;
  const result = { from, to, attacker: ar, defender: dr, attackerLoss: aLoss, defenderLoss: dLoss, conquered: false };
  if (s.armies[to] === 0) {
    result.conquered = true;
    conquer(s, from, to, a, defenderId);
  }
  s.lastBattle = result;
  if (!quiet) {
    log(s, `${p.name} attacked ${name(to)} from ${name(from)}: ${ar.join('-')} vs ${dr.join('-')}, lost ${aLoss}, killed ${dLoss}${result.conquered ? ' and CONQUERED it' : ''}.`);
  }
  return result;
}

/** Keep attacking until the territory falls or the attacker is down to `stopAt` armies. */
export function blitz(s, from, to, stopAt = 1) {
  const start = { a: s.armies[from], d: s.armies[to] };
  let r;
  do {
    r = attack(s, from, to, 3, { quiet: true });
  } while (!r.conquered && s.armies[from] > Math.max(1, stopAt));
  const summary = {
    from, to, conquered: r.conquered,
    attackerLoss: start.a - s.armies[from],
    defenderLoss: start.d - s.armies[to],
    remaining: s.armies[from],
  };
  log(s, `${currentPlayer(s).name} attacked ${name(to)} from ${name(from)}: lost ${summary.attackerLoss}, killed ${summary.defenderLoss}${r.conquered ? ' and CONQUERED it' : ''}.`);
  return summary;
}

function conquer(s, from, to, diceUsed, defenderId) {
  const p = currentPlayer(s);
  s.owner[to] = p.id;
  s.conquered = true;
  s.phase = 'conquer';
  s.conquest = { from, to, min: Math.min(diceUsed, s.armies[from] - 1), max: s.armies[from] - 1 };
  const def = s.players[defenderId];
  if (territoriesOf(s, defenderId).length === 0) {
    def.alive = false;
    p.cards.push(...def.cards);
    log(s, `${p.name} ELIMINATED ${def.name} and took ${def.cards.length} cards!`);
    def.cards = [];
  }
}

export function moveIn(s, count) {
  checkPhase(s, 'conquer');
  const c = s.conquest;
  count = Number(count);
  if (!Number.isInteger(count) || count < c.min || count > c.max) fail(`Move between ${c.min} and ${c.max} armies`);
  s.armies[c.from] -= count;
  s.armies[c.to] += count;
  s.conquest = null;
  log(s, `${currentPlayer(s).name} moved ${count} into ${name(c.to)}.`);
  if (territoriesOf(s, currentPlayer(s).id).length === TERRITORY_IDS.length) {
    s.winner = s.current;
    s.phase = 'gameover';
    log(s, `${currentPlayer(s).name} conquered the world and WINS!`);
    return;
  }
  // Eliminating a player can leave you with 5+ cards: trade immediately, then keep attacking.
  s.phase = currentPlayer(s).cards.length >= 5 ? 'reinforce' : 'attack';
}

export function endAttack(s) {
  checkPhase(s, 'attack');
  s.phase = 'fortify';
}

export function fortify(s, from, to, count) {
  checkPhase(s, 'fortify', 'attack');
  checkTerritory(from);
  checkTerritory(to);
  const p = currentPlayer(s);
  count = Number(count);
  if (s.owner[from] !== p.id || s.owner[to] !== p.id) fail('You must own both territories');
  if (!connectedOwned(s, from).has(to)) fail(`${name(to)} is not connected to ${name(from)} through your territories`);
  if (!Number.isInteger(count) || count < 1 || count > s.armies[from] - 1) fail(`Move between 1 and ${s.armies[from] - 1} armies`);
  s.armies[from] -= count;
  s.armies[to] += count;
  log(s, `${p.name} fortified ${name(to)} with ${count} from ${name(from)}.`);
  endTurn(s);
}

export function endTurn(s) {
  checkPhase(s, 'attack', 'fortify');
  const p = currentPlayer(s);
  if (s.conquered) {
    if (s.deck.length === 0) s.deck = shuffle(s, s.discard.splice(0));
    const card = s.deck.pop();
    if (card) {
      p.cards.push(card);
      log(s, `${p.name} earned a card.`);
    }
  }
  let next = s.current;
  do {
    next = (next + 1) % s.players.length;
    if (next === 0) s.turn++;
  } while (!s.players[next].alive);
  s.current = next;
  startTurn(s);
}
