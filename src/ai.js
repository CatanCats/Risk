// Heuristic bot: grabs continents, attacks with favourable odds, and pulls
// idle armies from the interior to the front line.
import { ADJ, CONTINENTS, CONTINENT_TERRITORIES, TERRITORIES } from './map.js';
import {
  attack, connectedOwned, currentPlayer, endAttack, endTurn, fortify, moveIn, place,
  territoriesOf, tradeCards, validSets,
} from './engine.js';

const enemiesAround = (s, t) => ADJ[t].filter((n) => s.owner[n] !== s.owner[t]);
const threat = (s, t) => enemiesAround(s, t).reduce((a, n) => a + s.armies[n], 0);

/** How much `pid` wants continent `c`: high when nearly owned, small, and valuable. */
function continentValue(s, pid, c) {
  const ts = CONTINENT_TERRITORIES[c];
  const owned = ts.filter((t) => s.owner[t] === pid).length;
  const enemyArmies = ts.filter((t) => s.owner[t] !== pid).reduce((a, t) => a + s.armies[t], 0);
  const frac = owned / ts.length;
  return (CONTINENTS[c].bonus * (0.5 + frac * frac * 2)) / (1 + enemyArmies / 6);
}

function tradeIfUseful(s) {
  const p = currentPlayer(s);
  while (s.phase === 'reinforce') {
    const sets = validSets(p.cards);
    if (!sets.length) break;
    // Prefer sets without wilds, and sets that include a territory we own (+2 bonus).
    const score = (set) => set.reduce((a, i) => {
      const c = p.cards[i];
      return a + (c.symbol === 'wild' ? -2 : 0) + (c.territory && s.owner[c.territory] === p.id ? 1 : 0);
    }, 0);
    sets.sort((a, b) => score(b) - score(a));
    tradeCards(s, sets[0]);
  }
}

function bestAttackTarget(s, pid, from) {
  const cv = (t) => continentValue(s, pid, TERRITORIES[t].continent);
  let best = null;
  for (const to of enemiesAround(s, from)) {
    const victimSize = territoriesOf(s, s.owner[to]).length;
    const score = (s.armies[from] - 1) / s.armies[to] + cv(to) * 0.15 + (victimSize <= 2 ? 1 : 0);
    if (!best || score > best.score) best = { from, to, score };
  }
  return best;
}

function reinforce(s) {
  const p = currentPlayer(s);
  tradeIfUseful(s);
  if (s.phase !== 'reinforce') return;
  const mine = territoriesOf(s, p.id);
  const borders = mine.filter((t) => enemiesAround(s, t).length);

  // 1) Shore up borders of continents we fully own when outnumbered.
  for (const c of Object.keys(CONTINENTS)) {
    if (!CONTINENT_TERRITORIES[c].every((t) => s.owner[t] === p.id)) continue;
    for (const t of CONTINENT_TERRITORIES[c].filter((t) => borders.includes(t))) {
      const maxEnemy = Math.max(...enemiesAround(s, t).map((n) => s.armies[n]));
      const need = Math.min(s.pending, Math.max(0, maxEnemy + 1 - s.armies[t]), Math.ceil(s.pending / 2));
      if (need > 0) place(s, t, need);
      if (s.phase !== 'reinforce') return;
    }
  }

  // 2) Stack the rest on the best launch point.
  let best = null;
  for (const t of borders) {
    const target = bestAttackTarget(s, p.id, t);
    const score = target.score + continentValue(s, p.id, TERRITORIES[target.to].continent) * 0.3 + s.armies[t] * 0.05;
    if (!best || score > best.score) best = { t, score };
  }
  place(s, best ? best.t : mine[0], s.pending);
}

function doAttacks(s) {
  const p = currentPlayer(s);
  for (let guard = 0; guard < 300 && s.phase === 'attack'; guard++) {
    let best = null;
    for (const from of territoriesOf(s, p.id)) {
      if (s.armies[from] < 3 && !(s.armies[from] === 2 && !s.conquered)) continue;
      const cand = bestAttackTarget(s, p.id, from);
      if (!cand) continue;
      const margin = s.armies[from] - 1 - s.armies[cand.to];
      // Take the free card if we haven't conquered yet; otherwise demand an edge.
      const ok = s.conquered ? margin >= 2 || (s.armies[from] >= 4 && margin >= 1) : margin >= 0;
      if (ok && (!best || cand.score > best.score)) best = cand;
    }
    if (!best) break;

    const { from, to } = best;
    const startDef = s.armies[to];
    let r;
    do r = attack(s, from, to, 3);
    while (!r.conquered && s.armies[from] > 1 && s.armies[from] - 1 >= s.armies[to] * 0.6);
    if (r.conquered) {
      const c = s.conquest;
      const fromThreat = enemiesAround(s, from).length ? threat(s, from) : 0;
      const toThreat = threat(s, to);
      let n;
      if (!enemiesAround(s, to).length) n = c.min;
      else if (!fromThreat) n = c.max;
      else n = Math.round(c.min + (c.max - c.min) * (toThreat / (toThreat + fromThreat)));
      moveIn(s, Math.max(c.min, Math.min(c.max, n)));
      s.log[s.log.length - 1].text = `${p.name} conquered ${TERRITORIES[to].name} from ${TERRITORIES[from].name} (defender had ${startDef}).`;
      if (s.phase === 'reinforce') reinforce(s); // traded eliminated player's cards
      if (s.phase === 'gameover') return;
    }
  }
}

function doFortify(s) {
  const p = currentPlayer(s);
  const mine = territoriesOf(s, p.id);
  const interior = mine
    .filter((t) => s.armies[t] > 1 && !enemiesAround(s, t).length)
    .sort((a, b) => s.armies[b] - s.armies[a]);
  for (const from of interior) {
    const reach = [...connectedOwned(s, from)].filter((t) => enemiesAround(s, t).length);
    if (!reach.length) continue;
    reach.sort((a, b) => threat(s, b) - s.armies[b] - (threat(s, a) - s.armies[a]));
    fortify(s, from, reach[0], s.armies[from] - 1);
    return;
  }
  endTurn(s);
}

/** Play the whole turn for the current player. */
export function botTakeTurn(s) {
  if (s.winner !== null) return;
  reinforce(s);
  if (s.phase === 'reinforce') return; // should not happen
  doAttacks(s);
  if (s.phase === 'gameover') return;
  if (s.phase === 'attack') endAttack(s);
  doFortify(s);
}

/** Let bots play until it is a non-bot player's turn (or the game ends). */
export function runBots(s, { maxTurns = 500, botTypes = ['bot'] } = {}) {
  let n = 0;
  while (s.winner === null && botTypes.includes(currentPlayer(s).type) && n++ < maxTurns) botTakeTurn(s);
  return n;
}
