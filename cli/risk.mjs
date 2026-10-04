#!/usr/bin/env node
// Command-line front end for a persistent game stored in game/state.json.
// Used by Claude (and anyone else) to play a seat turn-by-turn; bot seats
// are auto-played after each human/Claude turn.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADJ, CONTINENTS, CONTINENT_TERRITORIES, TERRITORIES, TERRITORY_IDS } from '../src/map.js';
import * as E from '../src/engine.js';
import { runBots } from '../src/ai.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fileFlag = args.indexOf('--file');
const FILE = fileFlag >= 0 ? resolve(args.splice(fileFlag, 2)[1]) : resolve(root, 'game/state.json');
const [cmd, ...rest] = args;

const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const save = (s) => {
  mkdirSync(dirname(FILE), { recursive: true });
  s.rev = (s.rev || 0) + 1;
  s.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(s, null, 1) + '\n');
};

function tid(input) {
  if (!input) throw new E.RuleError('Missing territory');
  const key = input.toLowerCase().replace(/[\s-]+/g, '_');
  if (TERRITORIES[key]) return key;
  const hits = TERRITORY_IDS.filter((t) => t.startsWith(key) || TERRITORIES[t].name.toLowerCase().startsWith(input.toLowerCase()));
  if (hits.length === 1) return hits[0];
  throw new E.RuleError(hits.length ? `"${input}" is ambiguous: ${hits.join(', ')}` : `Unknown territory "${input}"`);
}

const pname = (s, id) => s.players[id].name;

function status(s) {
  const p = E.currentPlayer(s);
  const out = [];
  out.push(`Round ${s.turn} | ${p.name} (${p.type}) to play | phase: ${s.phase}${s.phase === 'reinforce' ? ` | ${s.pending} to place` : ''}`);
  if (s.winner !== null) out.push(`*** WINNER: ${pname(s, s.winner)} ***`);
  out.push('', 'Players:');
  for (const pl of s.players) {
    const ts = E.territoriesOf(s, pl.id);
    out.push(`  [${pl.id}] ${pl.name.padEnd(14)} ${pl.alive ? '' : '(eliminated) '}terr ${String(ts.length).padStart(2)}  armies ${String(E.armiesOf(s, pl.id)).padStart(3)}  cards ${pl.cards.length}  income ${pl.alive ? E.reinforcementCount(s, pl.id) : 0}  conts: ${E.continentsOf(s, pl.id).map((c) => CONTINENTS[c].name).join(', ') || '-'}`);
  }
  out.push('', 'Board (owner:armies, * = current player):');
  for (const c of Object.keys(CONTINENTS)) {
    const cells = CONTINENT_TERRITORIES[c].map((t) => `${s.owner[t] === s.current ? '*' : ''}${t}=${s.owner[t]}:${s.armies[t]}`);
    out.push(`  ${CONTINENTS[c].name} (+${CONTINENTS[c].bonus}): ${cells.join('  ')}`);
  }
  out.push('', `${p.name}'s fronts (territory armies -> enemy neighbours):`);
  for (const t of E.territoriesOf(s, p.id)) {
    const en = ADJ[t].filter((n) => s.owner[n] !== p.id);
    if (en.length) out.push(`  ${t} ${s.armies[t]} -> ${en.map((n) => `${n}(${s.owner[n]}:${s.armies[n]})`).join(' ')}`);
  }
  out.push('', `Cards: ${p.cards.map((c, i) => `[${i}] ${c.symbol}${c.territory ? ':' + c.territory : ''}`).join('  ') || 'none'}`
    + `  | ${E.cardValueText(s)}`);
  if (s.conquest) out.push(`Pending move: ${s.conquest.from} -> ${s.conquest.to}, choose ${s.conquest.min}..${s.conquest.max} (move N)`);
  return out.join('\n');
}

function recent(s, since) {
  return s.log.slice(since).map((l) => `  r${l.turn} ${l.text}`).join('\n');
}

const HELP = `Usage: node cli/risk.mjs <command> [--file path]
  new "Name:type,Name:type,..." [seed]   start a game (types: claude, human, bot)
  status                                  show the board
  log [n]                                 show the last n log lines (default 30)
  trade i j k                             trade three cards (indices from status)
  place <terr> <n> [<terr> <n> ...]       place reinforcements
  attack <from> <to> [dice]               roll one battle
  blitz <from> <to> [stopAt]              attack until it falls or you have stopAt armies
  move <n>                                move armies into a conquered territory
  endattack                               go to the fortify phase
  fortify <from> <to> <n>                 move armies along your territories, ends turn
  end                                     end your turn (bots then play automatically)
  bots                                    run bot turns until a non-bot seat is up
  import <doc.json>                       load the shared-database document ({state}) into the game file
  export <doc.json>                       write the game file as a shared-database document ({state})`;

try {
  if (!cmd || cmd === 'help') {
    console.log(HELP);
  } else if (cmd === 'import') {
    const doc = JSON.parse(readFileSync(rest[0], 'utf8'));
    const state = doc.state ?? doc.data?.state;
    if (!state?.players) throw new E.RuleError(`${rest[0]} has no game state`);
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(state, null, 1) + '\n');
    console.log(status(state));
  } else if (cmd === 'export') {
    writeFileSync(rest[0], JSON.stringify({ state: load() }) + '\n');
    console.log(`Wrote ${rest[0]}`);
  } else if (cmd === 'new') {
    if (existsSync(FILE) && !rest.includes('--force')) throw new E.RuleError(`${FILE} exists; add --force to overwrite`);
    const spec = (rest[0] || 'Claude:claude,Bot Alpha:bot,Bot Bravo:bot,Bot Charlie:bot').split(',');
    const players = spec.map((x) => { const [name, type = 'bot'] = x.split(':'); return { name, type }; });
    const seed = rest[1] && rest[1] !== '--force' ? Number(rest[1]) : undefined;
    const s = E.createGame({ players, seed });
    s.createdAt = new Date().toISOString();
    runBots(s);
    save(s);
    console.log(recent(s, 0));
    console.log('\n' + status(s));
  } else {
    const s = load();
    const before = s.log.length;
    let turnEnded = false;
    const who = s.current;
    switch (cmd) {
      case 'status': break;
      case 'log': console.log(recent(s, -(Number(rest[0]) || 30))); process.exit(0);
      case 'trade': console.log(`+${E.tradeCards(s, rest)} armies`); break;
      case 'place':
        for (let i = 0; i < rest.length; i += 2) E.place(s, tid(rest[i]), rest[i + 1] ?? 1);
        break;
      case 'attack': {
        const r = E.attack(s, tid(rest[0]), tid(rest[1]), rest[2] ?? 3);
        console.log(`Dice ${r.attacker.join(',')} vs ${r.defender.join(',')}: you lose ${r.attackerLoss}, they lose ${r.defenderLoss}${r.conquered ? ' — CONQUERED' : ''}`);
        break;
      }
      case 'blitz': {
        const r = E.blitz(s, tid(rest[0]), tid(rest[1]), Number(rest[2] ?? 1));
        console.log(`Lost ${r.attackerLoss}, killed ${r.defenderLoss}, ${r.remaining} left in ${r.from}${r.conquered ? ' — CONQUERED' : ''}`);
        break;
      }
      case 'move': E.moveIn(s, rest[0]); break;
      case 'endattack': E.endAttack(s); break;
      case 'fortify': E.fortify(s, tid(rest[0]), tid(rest[1]), rest[2]); turnEnded = true; break;
      case 'end': E.endTurn(s); turnEnded = true; break;
      case 'bots': turnEnded = true; break;
      default: throw new E.RuleError(`Unknown command "${cmd}"\n\n${HELP}`);
    }
    if (turnEnded) runBots(s);
    if (cmd !== 'status') save(s);
    if (s.log.length > before) console.log(recent(s, before - s.log.length));
    if (cmd === 'status' || turnEnded || s.current !== who) console.log('\n' + status(s));
    else console.log(`\nphase: ${s.phase}${s.phase === 'reinforce' ? ` (${s.pending} to place)` : ''}`);
  }
} catch (e) {
  if (e instanceof E.RuleError) {
    console.error('Error: ' + e.message);
    process.exit(1);
  }
  throw e;
}
