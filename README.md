# 🎲 Catan Backend

Game server for an online Settlers of Catan implementation, built with Node.js and [boardgame.io](https://boardgame.io/). It owns all game rules and state — the board, turns, trading, the robber, and development cards — and syncs everything in real time with the [frontend](../catan-frontend) over Socket.IO.

## 📌 Functionalities

**Board generation** — a new hex board is procedurally generated for every match: terrain types, number tokens, and harbors are placed randomly (with no two identical terrains touching), and the robber starts on the desert.

**Setup phase** — each player places 2 settlements and 2 roads in "snake" turn order (forward through all players, then back). The second settlement grants starting resources from its adjacent hexes.

**Main phase** — the standard Catan turn loop:
- Roll dice (two dice or a spinning wheel, depending on match settings) to distribute resources
- Build roads, settlements, cities, and "resorts" (see below)
- Trade with the bank or other players
- Buy and play development cards (Knight, Monopoly, Road Building, Year of Plenty, Victory Point)
- Move the robber on a roll of 7 (or when a Knight is played) and steal a resource from an adjacent player

**Build costs:**
| Piece | Cost | Limit |
|---|---|---|
| Road | 1 brick, 1 lumber | 15 |
| Settlement | 1 brick, 1 lumber, 1 grain, 1 wool | 5 |
| City | 2 grain, 3 ore | 4 |
| Resort | 1 brick, 2 wool, 3 ore, 4 lumber | — |

**Resorts** — a custom mechanic beyond standard Catan rules: instead of building a new settlement, a player can spend resources to seize an opponent's **city**, converting it into their own Resort. The victim loses the city and 2 VP; the seizer gains a Resort and 2 VP. Can be disabled per-match via game settings.

**Seasons** — an optional house rule (on by default) that cycles Spring → Summer → Autumn → Winter every 5 turns (or instantly when a player claims Largest Army), each altering resource production on specific dice rolls (bonus resources, doubled output, off-number harvests, or a robber-like resource loss in Winter).

**Longest Road / Largest Army** — computed automatically and awarded/transferred as roads are built and knights are played, each worth +2 VP.

**Win condition** — first player to reach the configured victory point target (10, 15, or 20) wins.

## 🌐 Technologies

- **Node.js** (ES modules)
- **[boardgame.io](https://boardgame.io/)** — game state machine, lobby API, and Socket.IO-based real-time sync
- **Nodemon** for auto-reloading in development
- **Vitest** for testing

## 🧩 Architecture Overview

```
game/
├── CatanGame.js   # Phases (setup/main), turn order, stages, moves, win condition, playerView
├── setup.js       # Builds the initial game state (players, board, dev card deck)
├── board.js       # Procedural hex board generation (hexes, intersections, edges, harbors)
├── moves.js       # All move logic: building, trading, dev cards, robber, dice, chat
├── players.js     # Player state factory (resources, buildings, dev cards, VPs)
├── phases.js      # Phase-related helpers
└── __tests__/     # Vitest test suite

src/
├── index.js       # Entry point
└── server.js      # Creates and runs the boardgame.io Server
```

`CatanGame.js` defines two phases:
- **`setup`** — a custom turn order function implements the snake placement pattern, with a `placing` stage (build moves) and `idle` stage (chat only) for waiting players.
- **`main`** — normal round-robin turns, with `playing` (all main-phase moves), `placingRobber` (after rolling a 7 or playing a Knight), `responding` (accepting/declining a trade offer), and `idle` stages.

`playerView` hides other players' development card contents (only the type is masked, not the count) so no client can see an opponent's hand.

## 🔒 Hidden information & validation

Every move checks `ctx.playerID` against `ctx.currentPlayer` (or the relevant stage) so a client can't act out of turn or on someone else's behalf — invalid attempts return `INVALID_MOVE` and are rejected server-side, not just hidden in the UI.

## 🧪 Testing

```bash
npm test
```

Runs the Vitest suite in `game/__tests__/`: board generation invariants, initial state setup, every move (building, trading, dev cards, robber, dice), Longest Road computation, and full game-flow/win-condition integration tests.

## ⚙️ Installation & Running

```bash
git clone <repo link>
cd catan-backend
npm install
npm run dev     # auto-reloading dev server
npm start       # production
```

The server runs on **`http://localhost:8000`** by default, and only allows connections from `http://localhost:5173` (the default frontend dev URL) — update the `origins` value in `src/server.js` if you deploy or change ports.

> **Note:** this version reads the port and allowed origin as fixed values in `src/server.js`. If you're deploying to a host like Render, swap these for `process.env.PORT` and `process.env.CLIENT_ORIGINS` so the server can bind to the platform's assigned port and accept your deployed frontend's origin.

## 🚀 Hosting

This backend is hosted on **[Render](https://render.com/)**.

## 👤 Authors

Stefani Akimovska 237014, Anastasija Mishevska 237029, Viktor Trajkovski 237019