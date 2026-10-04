# Risk War Room

A browser-based world-conquest strategy game inspired by the board game Risk, with AI opponents.
No build step and no dependencies: plain ES modules that run in the browser and in Node.

## Play in the browser

```sh
npm start          # serves the repo on http://localhost:8080
```

Any static host works too (GitHub Pages, `python3 -m http.server`); ES modules need to be served over HTTP, so opening `index.html` from disk will not work.

- **Your game**: you against 1–5 AI commanders. Saved in your browser automatically.
- **Claude's campaign**: spectate the persistent game in `game/state.json`, where Claude holds a seat and plays its turns from the command line.

## Rules (classic Risk, simplified setup)

- 42 territories in 6 continents. Territories are dealt randomly and starting armies placed randomly.
- **Reinforce**: `max(3, territories / 3)` armies, plus continent bonuses
  (Asia 7, North America 5, Europe 5, Africa 3, South America 2, Australia 2).
- **Cards**: conquer at least one territory in a turn to earn a card. Trade 3 alike, one of each, or any set with a wild
  for 4, 6, 8, 10, 12, 15, then +5 each time. A card showing a territory you own gives +2 armies there.
  You must trade when holding 5 or more. Eliminating a player gives you their cards.
- **Attack**: up to 3 attacker dice vs up to 2 defender dice; ties go to the defender. Blitz rolls until the territory falls.
- **Fortify**: one move along a chain of your own territories, then the turn ends.
- Conquer all 42 territories to win.

## Command line (`cli/risk.mjs`)

Plays a persistent game stored in `game/state.json`. Bot seats move automatically whenever a turn ends.

```sh
node cli/risk.mjs new "Claude:claude,Ash:bot,Ivo:bot" [seed] [--force]
node cli/risk.mjs status
node cli/risk.mjs place china 3 siam 2
node cli/risk.mjs blitz china india      # or: attack china india [dice]
node cli/risk.mjs move 4
node cli/risk.mjs endattack
node cli/risk.mjs fortify ural china 3   # or: end
```

Territory names accept ids (`western_us`) or unique prefixes (`west`).

## Code

| File | What it does |
| --- | --- |
| `src/map.js` | Territories, continents, borders, map coordinates |
| `src/engine.js` | Rules engine; the whole game is one JSON-serialisable state with a seeded RNG |
| `src/ai.js` | Heuristic bot: chases continents, attacks with good odds, moves idle armies to the front |
| `src/ui.js` | SVG map and controls for the browser |
| `cli/risk.mjs` | Command-line interface for the persistent game |
| `test/` | `npm test` |
