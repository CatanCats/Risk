import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJ, TERRITORY_IDS } from '../src/map.js';
import * as E from '../src/engine.js';
import { runBots } from '../src/ai.js';

const game = (n = 3, seed = 7) => E.createGame({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, type: 'human' })), seed });

test('map adjacency is symmetric and connected', () => {
  for (const t of TERRITORY_IDS) for (const n of ADJ[t]) assert.ok(ADJ[n].includes(t), `${t}<->${n}`);
  const seen = new Set(['alaska']);
  const stack = ['alaska'];
  while (stack.length) for (const n of ADJ[stack.pop()]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  assert.equal(seen.size, 42);
});

test('setup deals every territory and the starting armies', () => {
  const s = game(4);
  assert.equal(Object.keys(s.owner).length, 42);
  for (const p of s.players) assert.equal(E.armiesOf(s, p.id), 30);
  assert.equal(s.phase, 'reinforce');
  assert.ok(s.pending >= 3);
});

test('same seed gives the same game', () => {
  assert.deepEqual(game(3, 99), game(3, 99));
});

test('card sets and trade values', () => {
  const c = (symbol) => ({ symbol, territory: null });
  assert.ok(E.isValidSet([c('infantry'), c('infantry'), c('infantry')]));
  assert.ok(E.isValidSet([c('infantry'), c('cavalry'), c('artillery')]));
  assert.ok(E.isValidSet([c('infantry'), c('infantry'), c('wild')]));
  assert.ok(!E.isValidSet([c('infantry'), c('infantry'), c('cavalry')]));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(E.tradeValue), [4, 6, 8, 10, 12, 15, 20, 25]);
});

test('placing, attacking and conquering follow the rules', () => {
  const s = game(2, 3);
  const me = s.current;
  const from = TERRITORY_IDS.find((t) => s.owner[t] === me && ADJ[t].some((n) => s.owner[n] !== me));
  const to = ADJ[from].find((n) => s.owner[n] !== me);
  assert.throws(() => E.attack(s, from, to), E.RuleError); // still reinforcing
  E.place(s, from, s.pending);
  assert.equal(s.phase, 'attack');
  s.armies[from] = 50;
  s.armies[to] = 1;
  let r;
  do r = E.attack(s, from, to); while (!r.conquered);
  assert.equal(s.phase, 'conquer');
  assert.throws(() => E.moveIn(s, 0), E.RuleError);
  E.moveIn(s, s.conquest.max);
  assert.equal(s.armies[from], 1);
  assert.equal(s.owner[to], me);
  E.endAttack(s);
  E.endTurn(s);
  assert.equal(s.players[me].cards.length, 1);
  assert.notEqual(s.current, me);
});

test('fortify requires a connected path', () => {
  const s = game(2, 11);
  E.place(s, TERRITORY_IDS.find((t) => s.owner[t] === s.current), s.pending);
  E.endAttack(s);
  const mine = TERRITORY_IDS.filter((t) => s.owner[t] === s.current);
  const from = mine.find((t) => s.armies[t] > 1);
  const far = mine.find((t) => t !== from && !E.connectedOwned(s, from).has(t));
  if (far) assert.throws(() => E.fortify(s, from, far, 1), E.RuleError);
});

test('bot-only games always finish with one winner', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.createGame({ players: Array.from({ length: 2 + (seed % 5) }, () => ({ type: 'bot' })), seed });
    runBots(s, { maxTurns: 3000 });
    assert.notEqual(s.winner, null, `seed ${seed}`);
    assert.equal(E.territoriesOf(s, s.winner).length, 42);
  }
});
