// Browser front end: renders the map, handles clicks for the human seat and
// animates bot turns. Also spectates the persistent game in game/state.json.
import { ADJ, CONTINENTS, CONTINENT_TERRITORIES, EDGES, TERRITORIES, TERRITORY_IDS } from './map.js';
import * as E from './engine.js';
import { botTakeTurn } from './ai.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const STORE_KEY = 'risk.localGame.v1';
const BOT_NAMES = ['General Ash', 'Marshal Ivo', 'Admiral Rook', 'Captain Vex', 'Colonel Moss'];
const BOT_DELAY = 650;

const ui = {
  mode: 'local', game: null, campaign: null, campaignError: '', campaignSource: null,
  canWrite: false, dbRef: null,
  sel: null, target: null, amount: 1, picked: new Set(), error: '', botTimer: null,
};
const CAMPAIGN_DOC = 'games/campaign';

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tname = (t) => TERRITORIES[t].name;
const active = () => (ui.mode === 'local' ? ui.game : ui.campaign);
const canDrive = (s) => !!s && (s === ui.game || (s === ui.campaign && ui.canWrite));
const humanUp = (s) => !!s && s.winner === null && E.currentPlayer(s).type === 'human';
const myTurn = () => canDrive(active()) && humanUp(active());

function saveGame(s) {
  if (s === ui.game) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ui.game)); } catch { /* storage unavailable */ }
  } else if (s === ui.campaign) {
    s.rev = (s.rev || 0) + 1;
    s.updatedAt = new Date().toISOString();
    campaignDirty = true;
    flushCampaign();
  }
}
const save = () => saveGame(active());

// One write at a time; actions made while a write is in flight coalesce into the next one.
let campaignWriting = false;
let campaignDirty = false;
async function flushCampaign() {
  if (campaignWriting || !campaignDirty || !ui.dbRef) return;
  campaignWriting = true;
  campaignDirty = false;
  try {
    await ui.dbRef.set({ state: JSON.parse(JSON.stringify(ui.campaign)) });
  } catch (e) {
    if (e?.code === 'invalid_argument' || e?.code === 'not_granted') ui.canWrite = false;
    ui.campaignError = e?.code === 'quota_exceeded' ? 'The campaign could not be saved: storage is full.' : 'Your last move could not be saved. Reload the page to resync.';
    render();
  } finally {
    campaignWriting = false;
    flushCampaign();
  }
}
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return s && s.version === 1 ? s : null;
  } catch { return null; }
}

function newGame(name = 'You', bots = 3) {
  const players = [{ name: name.trim() || 'You', type: 'human' }, ...BOT_NAMES.slice(0, bots).map((n) => ({ name: n, type: 'bot' }))];
  ui.game = E.createGame({ players });
  resetSelection();
  saveGame(ui.game);
  render();
  scheduleBots();
}

function resetSelection() {
  ui.sel = null;
  ui.target = null;
  ui.picked.clear();
}

function act(fn) {
  try {
    fn();
    ui.error = '';
  } catch (e) {
    if (!(e instanceof E.RuleError)) throw e;
    ui.error = e.message;
  }
  save();
  render();
  scheduleBots();
}

const botsUp = (s) => canDrive(s) && s.winner === null && E.currentPlayer(s).type === 'bot';
function scheduleBots() {
  if (ui.botTimer || ![ui.game, ui.campaign].some(botsUp)) return;
  ui.botTimer = setTimeout(() => {
    ui.botTimer = null;
    for (const s of [ui.game, ui.campaign]) {
      if (!botsUp(s)) continue;
      botTakeTurn(s);
      if (s === active()) resetSelection();
      saveGame(s);
    }
    render();
    scheduleBots();
  }, BOT_DELAY);
}

// ---------- map ----------
const nodes = {};
function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
}

function buildMap() {
  const map = $('map');
  const land = svg('g', {}, map);
  for (const t of TERRITORY_IDS) {
    const { x, y, continent } = TERRITORIES[t];
    svg('circle', { cx: x, cy: y, r: 52, fill: CONTINENTS[continent].color, class: 'land' }, land);
  }
  const labels = {
    north_america: [24, 412], south_america: [345, 590], europe: [470, 30],
    africa: [415, 470], asia: [700, 30], australia: [760, 600],
  };
  for (const [c, [x, y]] of Object.entries(labels)) {
    const el = svg('text', { x, y, class: 'cont-label' }, map);
    el.textContent = `${CONTINENTS[c].name} +${CONTINENTS[c].bonus}`;
  }
  const edges = svg('g', {}, map);
  for (const [a, b] of EDGES) {
    const A = TERRITORIES[a];
    const B = TERRITORIES[b];
    const sea = A.continent !== B.continent;
    if (a === 'alaska' && b === 'kamchatka') {
      svg('line', { x1: A.x, y1: A.y, x2: 0, y2: A.y - 10, class: 'edge sea' }, edges);
      svg('line', { x1: B.x, y1: B.y, x2: 1000, y2: B.y - 10, class: 'edge sea' }, edges);
    } else {
      svg('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: sea ? 'edge sea' : 'edge' }, edges);
    }
  }
  for (const t of TERRITORY_IDS) {
    const { x, y } = TERRITORIES[t];
    const g = svg('g', { class: 'node', tabindex: 0, role: 'button', 'aria-label': tname(t) }, map);
    svg('circle', { cx: x, cy: y, r: 23, class: 'ring' }, g);
    const body = svg('circle', { cx: x, cy: y, r: 17, class: 'body', fill: '#888' }, g);
    const n = svg('text', { x, y, class: 'n' }, g);
    const lbl = svg('text', { x, y: y + 31, class: 'lbl' }, g);
    lbl.textContent = tname(t);
    g.addEventListener('click', () => onTerritory(t));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTerritory(t); } });
    nodes[t] = { g, body, n };
  }
}

function targetsFor(s) {
  if (!ui.sel || !myTurn()) return new Set();
  if (s.phase === 'attack') return new Set(ADJ[ui.sel].filter((n) => s.owner[n] !== s.current));
  if (s.phase === 'fortify') return E.connectedOwned(s, ui.sel);
  return new Set();
}

function renderMap(s) {
  const targets = targetsFor(s);
  const hit = s.lastBattle;
  for (const t of TERRITORY_IDS) {
    const { g, body, n } = nodes[t];
    body.setAttribute('fill', s.players[s.owner[t]].color);
    n.textContent = s.armies[t];
    g.setAttribute('aria-label', `${tname(t)}: ${s.players[s.owner[t]].name}, ${s.armies[t]} armies`);
    g.classList.toggle('sel', ui.sel === t);
    g.classList.toggle('tgt', targets.has(t) || ui.target === t);
    g.classList.toggle('friendly', s.phase === 'fortify');
    g.classList.toggle('hit', !!hit && hit.to === t && !targets.has(t) && ui.target !== t);
  }
  const note = $('map-note');
  if (!myTurn()) note.textContent = s.winner === null ? `${E.currentPlayer(s).name} is moving…` : '';
  else if (s.phase === 'reinforce') note.textContent = 'Tap your territories to place armies.';
  else if (s.phase === 'attack') note.textContent = ui.sel ? 'Pick a dashed enemy to attack, or another of your territories.' : 'Tap one of your territories with 2+ armies to attack from. To move troops, press "Done attacking" first.';
  else if (s.phase === 'fortify') note.textContent = ui.sel ? 'Pick a connected territory to reinforce. Tap the source again to change it.' : 'Tap a territory to move armies from, or end your turn.';
  else note.textContent = '';
}

function onTerritory(t) {
  if (!myTurn()) return;
  const s = active();
  const mine = s.owner[t] === s.current;
  if (s.phase === 'reinforce') {
    const n = ui.amount === 'all' ? s.pending : Math.min(ui.amount, s.pending);
    return act(() => E.place(s, t, n));
  }
  if (t === ui.sel && (s.phase === 'attack' || s.phase === 'fortify')) {
    resetSelection(); // tap the source again to start over
    return render();
  }
  if (s.phase === 'attack') {
    if (mine) {
      ui.sel = s.armies[t] >= 2 ? t : null;
      ui.target = null;
      ui.error = s.armies[t] >= 2 ? '' : `${tname(t)} needs 2+ armies to attack.`;
    } else if (ui.sel && ADJ[ui.sel].includes(t)) {
      ui.target = t;
      ui.error = '';
    }
  } else if (s.phase === 'fortify' && mine) {
    if (ui.sel && ui.sel !== t && E.connectedOwned(s, ui.sel).has(t)) ui.target = t;
    else if (s.armies[t] > 1) { ui.sel = t; ui.target = null; }
  }
  render();
}

// ---------- side panel ----------
function phaseSteps(s) {
  const at = { reinforce: 0, attack: 1, conquer: 1, fortify: 2 }[s.phase] ?? -1;
  return `<div class="steps">${['Reinforce', 'Attack', 'Fortify'].map((p, i) => `<span class="${i === at ? 'on' : ''}">${p}</span>`).join('')}</div>`;
}

function diceHtml(b) {
  if (!b) return '';
  const d = (v, c) => `<span class="die ${c}">${v}</span>`;
  return `<div class="dice" aria-label="Last battle dice">${b.attacker.map((v) => d(v, 'a')).join('')}<small>vs</small>${b.defender.map((v) => d(v, 'd')).join('')}</div>`;
}

function undoBtn(s) {
  const last = s.placements?.at(-1);
  return last ? `<div class="row"><button class="btn" data-a="undo">Undo: take ${last.count} back from ${esc(tname(last.territory))}</button></div>` : '';
}

function ordersHtml(s) {
  const p = E.currentPlayer(s);
  if (s.winner !== null) return `<div class="banner">${esc(s.players[s.winner].name)} rules the world.</div>${ui.mode === 'local' ? '<div class="row"><button class="btn primary" data-a="new">Play again</button></div>' : '<p class="hint">Ask Claude in your session to start a rematch.</p>'}`;
  if (!myTurn()) {
    const wait = p.type === 'claude' ? 'Claude checks in every hour and plays its turn then. This page updates on its own.'
      : p.type === 'human' ? 'Waiting for this seat to move. Only people with edit access can play it.'
      : `${esc(p.name)} is on the move.`;
    return `<p class="hint">${wait}</p>${diceHtml(s.lastBattle)}`;
  }
  const err = ui.error ? `<p class="err" role="alert">${esc(ui.error)}</p>` : '';
  if (s.phase === 'reinforce') {
    const mustTrade = p.cards.length >= 5;
    const amt = (v, l) => `<button class="btn${ui.amount === v ? ' primary' : ''}" data-a="amt" data-v="${v}">${l}</button>`;
    return `<div class="row"><span class="big">${s.pending}</span><span class="hint">armies to place</span></div>
      ${mustTrade ? '<p class="err">You hold 5 cards. Trade a set below before placing.</p>' : ''}
      <div class="row">${amt(1, '+1')}${amt(3, '+3')}${amt('all', 'All')}</div>${undoBtn(s)}${err}`;
  }
  if (s.phase === 'attack') {
    const ready = ui.sel && ui.target;
    return `${ready ? `<p class="hint">${esc(tname(ui.sel))} (${s.armies[ui.sel]}) → ${esc(tname(ui.target))} (${s.armies[ui.target]})</p>` : ''}
      <div class="row"><button class="btn primary" data-a="roll" ${ready ? '' : 'disabled'}>Roll dice</button>
      <button class="btn" data-a="blitz" ${ready ? '' : 'disabled'}>Blitz</button>
      <button class="btn" data-a="endattack">Done attacking: move troops</button>
      ${ui.sel ? '<button class="btn" data-a="clear">Clear selection</button>' : ''}</div>${undoBtn(s)}${diceHtml(s.lastBattle)}${err}`;
  }
  if (s.phase === 'conquer') {
    const c = s.conquest;
    const v = Math.max(c.min, Math.min(c.max, ui.moveN ?? c.max));
    return `<p class="hint">${esc(tname(c.to))} has fallen. Move armies in from ${esc(tname(c.from))}.</p>
      <div class="row"><span class="big" id="move-n">${v}</span><span class="hint">of ${c.min}–${c.max}</span></div>
      <input type="range" id="move-range" min="${c.min}" max="${c.max}" value="${v}" aria-label="Armies to move">
      <div class="row"><button class="btn primary" data-a="movein">Move in</button></div>${diceHtml(s.lastBattle)}${err}`;
  }
  if (s.phase === 'fortify') {
    const ready = ui.sel && ui.target;
    const max = ready ? s.armies[ui.sel] - 1 : 1;
    return `${ready ? `<p class="hint">${esc(tname(ui.sel))} → ${esc(tname(ui.target))}</p>
      <div class="row"><span class="big" id="fort-n">${max}</span><span class="hint">armies</span></div>
      <input type="range" id="fort-range" min="1" max="${max}" value="${max}" aria-label="Armies to move">` : ''}
      ${ui.sel && !ready ? `<p class="hint">Moving from ${esc(tname(ui.sel))}. Tap where the troops should go.</p>` : ''}
      <div class="row"><button class="btn primary" data-a="fortify" ${ready ? '' : 'disabled'}>Fortify &amp; end turn</button>
      ${ui.sel ? '<button class="btn" data-a="clear">Clear selection</button>' : ''}
      <button class="btn" data-a="end">End turn</button></div>${err}`;
  }
  return '';
}

function playersHtml(s) {
  const rows = s.players.map((p) => `<tr class="${p.id === s.current ? 'cur' : ''} ${p.alive ? '' : 'dead'}">
    <td><span class="who"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span></td>
    <td>${E.territoriesOf(s, p.id).length}</td><td>${E.armiesOf(s, p.id)}</td><td>${p.cards.length}</td>
    <td>${p.alive ? E.reinforcementCount(s, p.id) : '–'}</td></tr>`).join('');
  return `<table><thead><tr><th>Commander</th><th title="Territories">Land</th><th>Army</th><th>Cards</th><th title="Reinforcements per turn">+Turn</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function cardsHtml(s) {
  const me = s.players.find((p) => p.type === 'human');
  if (!me) return '';
  const interactive = canDrive(s);
  const pickedCards = [...ui.picked].map((i) => me.cards[i]).filter(Boolean);
  const pickedOk = pickedCards.length === 3 && E.isValidSet(pickedCards);
  const canTrade = myTurn() && s.phase === 'reinforce' && pickedOk;
  const cards = me.cards.map((c, i) => `<button class="card" data-a="card" data-v="${i}" aria-pressed="${ui.picked.has(i)}" ${interactive ? '' : 'disabled'}>
    <b>${c.symbol}</b>${c.territory ? esc(tname(c.territory)) : 'Any'}</button>`).join('');
  return `<section class="panel"><div class="eyebrow">Your cards</div><p class="hint">${esc(E.cardValueText(s).replace(/^./, (c) => c.toUpperCase()))}</p>
    <div class="cards">${cards || '<span class="hint">No cards yet. Conquer a territory in a turn to earn one.</span>'}</div>
    ${interactive && me.cards.length >= 3 ? `<div class="row"><button class="btn" data-a="trade" ${canTrade ? '' : 'disabled'}>Trade selected${pickedOk ? ` (+${E.setValue(s, pickedCards)})` : ''}</button><span class="hint">3 alike, 3 different, or any with a wild</span></div>` : ''}</section>`;
}

function logHtml(s) {
  const items = s.log.slice(-60).reverse().map((l) => `<li><span>R${l.turn}</span><span>${esc(l.text)}</span></li>`).join('');
  return `<section class="panel"><div class="eyebrow">Dispatches</div><ul class="log">${items}</ul></section>`;
}

function render() {
  $('tab-local').setAttribute('aria-pressed', ui.mode === 'local');
  $('tab-campaign').setAttribute('aria-pressed', ui.mode === 'campaign');
  $('new-game').hidden = ui.mode !== 'local';
  const s = active();
  const side = $('side');
  if (!s) {
    side.innerHTML = `<section class="panel"><div class="eyebrow">Campaign with Claude</div>
      <p class="${ui.campaignError ? 'err' : 'hint'}">${esc(ui.campaignError || 'Loading the campaign…')}</p></section>`;
    $('map-note').textContent = '';
    return;
  }
  const p = E.currentPlayer(s);
  const updated = ui.mode === 'campaign' && s.updatedAt ? ` · saved ${new Date(s.updatedAt).toLocaleString()}` : '';
  side.innerHTML = `<section class="panel">
      <div class="eyebrow">Round ${s.turn}${updated}</div>
      <div class="who"><span class="dot" style="background:${p.color}"></span><strong>${esc(p.name)}</strong></div>
      ${phaseSteps(s)}${ordersHtml(s)}
      ${ui.mode === 'campaign' && ui.campaignSource === 'file' ? '<div class="row"><button class="btn" data-a="reload">Refresh</button></div>' : ''}
      ${ui.mode === 'campaign' && ui.campaignError ? `<p class="err">${esc(ui.campaignError)}</p>` : ''}
    </section>
    <section class="panel"><div class="eyebrow">Commanders</div>${playersHtml(s)}</section>
    ${cardsHtml(s)}${logHtml(s)}`;
  renderMap(s);
}

function onSideClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const s = active();
  const a = b.dataset.a;
  if (a === 'reload') return loadCampaignFile();
  if (a === 'new') return openSetup();
  if (a === 'amt') { ui.amount = b.dataset.v === 'all' ? 'all' : Number(b.dataset.v); return render(); }
  if (a === 'card') {
    const i = Number(b.dataset.v);
    if (ui.picked.has(i)) ui.picked.delete(i);
    else if (ui.picked.size < 3) ui.picked.add(i);
    return render();
  }
  if (a === 'trade') return act(() => { E.tradeCards(s, [...ui.picked]); ui.picked.clear(); });
  if (a === 'roll') return act(() => { E.attack(s, ui.sel, ui.target, 3); afterBattle(s); });
  if (a === 'blitz') return act(() => { E.blitz(s, ui.sel, ui.target, 1); afterBattle(s); });
  if (a === 'undo') return act(() => { E.undoPlace(s); resetSelection(); });
  if (a === 'clear') { resetSelection(); return render(); }
  if (a === 'endattack') return act(() => { E.endAttack(s); resetSelection(); });
  if (a === 'movein') return act(() => { E.moveIn(s, Number($('move-range').value)); ui.moveN = undefined; resetSelection(); });
  if (a === 'fortify') return act(() => { E.fortify(s, ui.sel, ui.target, Number($('fort-range').value)); resetSelection(); });
  if (a === 'end') return act(() => { E.endTurn(s); resetSelection(); });
}

function afterBattle(s) {
  if (s.phase === 'conquer') ui.moveN = s.conquest.max;
  else if (s.armies[ui.sel] < 2) { ui.sel = null; ui.target = null; }
}

function onSideInput(e) {
  if (e.target.id === 'move-range') { ui.moveN = Number(e.target.value); $('move-n').textContent = e.target.value; }
  if (e.target.id === 'fort-range') $('fort-n').textContent = e.target.value;
}

// ---------- campaign (you vs Claude vs bots) ----------
// On claude.ai the campaign lives in the artifact's shared database, which
// Claude reads and writes on its turn. Elsewhere it falls back to the
// read-only snapshot in game/state.json.
function adoptCampaign(state) {
  if (!state) return;
  if (ui.campaign && (state.rev || 0) <= (ui.campaign.rev || 0)) return; // our own echo or stale
  ui.campaign = JSON.parse(JSON.stringify(state));
  if (ui.mode === 'campaign') resetSelection();
  render();
  scheduleBots();
}

async function connectCampaign() {
  const db = await window.claude?.use?.('db');
  if (!db) return loadCampaignFile();
  const user = await window.claude.use('user');
  const can = user ? await user.can('data.write') : null;
  ui.canWrite = can !== false;
  ui.campaignSource = 'db';
  ui.dbRef = db.doc(CAMPAIGN_DOC);
  ui.dbRef.onSnapshot(
    (snap) => {
      if (!snap.exists) {
        ui.campaignError = 'No campaign yet. Ask Claude in your session to start one.';
        if (ui.mode === 'campaign') render();
        return;
      }
      ui.campaignError = '';
      adoptCampaign(snap.data().state);
    },
    () => {
      ui.campaignError = 'Lost the connection to the campaign. Reload the page to reconnect.';
      render();
    },
  );
}

async function loadCampaignFile() {
  ui.campaignSource = 'file';
  ui.canWrite = false;
  ui.campaignError = '';
  try {
    const res = await fetch(`game/state.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No campaign found (HTTP ${res.status}).`);
    ui.campaign = await res.json();
  } catch (e) {
    ui.campaign = null;
    ui.campaignError = `Could not load the campaign. ${e.message}`;
  }
  if (ui.mode === 'campaign') render();
}

function openSetup() {
  const d = $('setup');
  if (d.showModal) d.showModal();
}

function boot() {
  buildMap();
  $('side').addEventListener('click', onSideClick);
  $('side').addEventListener('input', onSideInput);
  $('tab-local').addEventListener('click', () => { ui.mode = 'local'; resetSelection(); render(); });
  $('tab-campaign').addEventListener('click', () => { ui.mode = 'campaign'; resetSelection(); render(); });
  $('new-game').addEventListener('click', openSetup);
  $('setup-cancel').addEventListener('click', () => $('setup').close());
  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('setup').close();
    ui.mode = 'local';
    newGame($('cmd-name').value, Number($('cmd-bots').value));
  });
  window.claude?.hot?.snapshot?.(() => ({ game: ui.game, mode: ui.mode }));
  const hot = window.claude?.hot?.data;
  ui.game = hot?.game ?? restore();
  ui.mode = location.hash === '#solo' ? 'local' : hot?.mode ?? 'campaign';
  if (!ui.game) newGame();
  render();
  scheduleBots();
  connectCampaign();
}

if (window.claude?.hot?.ready) window.claude.hot.ready(boot);
else boot();
