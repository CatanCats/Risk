# Risk War Room

A browser-based world-conquest strategy game inspired by the board game Risk, with AI opponents.
No build step and no dependencies: plain ES modules that run in the browser and in Node.

## Play in the browser

```sh
npm start          # serves the repo on http://localhost:8080
```

Any static host works too (GitHub Pages, `python3 -m http.server`); ES modules need to be served over HTTP, so opening `index.html` from disk will not work.

- **Campaign vs Claude**: you, Claude and two AI bots in one shared game. You play your turns on the page; when you end
  your turn the page plays the bots, and Claude takes its turn when it next checks in. On claude.ai the game lives in
  the artifact's shared database (`games/campaign`); a local server shows the read-only mirror in `game/state.json`.
- **Solo vs AI**: you against 1–5 AI commanders. Saved in your browser automatically.

## Rules (classic Risk, simplified setup)

- 42 territories in 6 continents. Territories are dealt randomly and starting armies placed randomly.
- **Reinforce**: `max(3, territories / 3)` armies, plus continent bonuses
  (Asia 8, Europe 5, North America 4, Africa 3, South America 2, Australia 2).
- **Cards**: conquer at least one territory in a turn to earn a card. Trade 3 alike, one of each, or any set with a wild.
  Sets have fixed values (as in Risk: Global Domination's fixed mode): 3 infantry 4, 3 cavalry 6, 3 artillery 8,
  one of each 10. A card showing a territory you own gives +2 armies there.
  You must trade when holding 5 or more. Eliminating a player gives you their cards.
- **Attack**: up to 3 attacker dice vs up to 2 defender dice; ties go to the defender. Blitz rolls until the territory falls.
- **Undo**: you can take back placements until your first battle of the turn.
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

For the shared campaign, Claude pulls the database document, plays, and writes it back:

```sh
node cli/risk.mjs import games/campaign.json   # database document -> game/state.json
node cli/risk.mjs status                         # ...play the turn...
node cli/risk.mjs export /tmp/campaign.json      # game/state.json -> database document
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
