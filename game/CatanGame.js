import { setup } from "./setup.js";
import { moves } from "./moves.js";
import { GAME_SETTINGS_DEFAULTS } from "./constants.js";
import { ActivePlayers } from "boardgame.io/dist/cjs/core.js";

export const CatanGame = {
  name: "catan",
  setup: setup,
  moves: moves,
  minPlayers: 2,
  maxPlayers: 4,

  // Checked after every move, regardless of phase. Once a player's total VP
  // (settlements + cities + Longest Road + Largest Army + revealed/hidden VP
  // dev cards, all of which already accumulate into player.victoryPoints)
  // reaches the target, the match ends and boardgame.io stops accepting
  // further moves. If somehow more than one player crosses the line on the
  // same move, the current player wins ties, matching physical Catan where
  // you only get to check for a win on your own turn.
  endIf: ({ G, ctx }) => {
    const target =
        G.settings?.victoryPointsTarget ??
        GAME_SETTINGS_DEFAULTS.victoryPointsTarget;
    const order = [ctx.currentPlayer, ...Object.keys(G.players)];
    const winnerId = order.find(
        (pid) => G.players[pid]?.victoryPoints >= target,
    );
    if (winnerId) {
      return { winner: winnerId };
    }
  },

  phases: {
    setup: {
      start: true,
      next: "main",
      turn: {
        // Official Catan setup order is a "snake" draft: player 1, 2, ...,
        // N places their FIRST settlement+road, then it reverses — N, ...,
        // 2, 1 — for the SECOND. This gives the last player in turn order
        // two placements in a row (their 1st immediately followed by their
        // 2nd), which is the intentional balancing mechanic: they're
        // disadvantaged by going last in the first lap, so they get first
        // pick again on the way back.
        //
        // G.setupTurnCount (bumped once per turn via onBegin below) tracks
        // how many setup turns have elapsed so far, which is all `next`
        // needs to know whether we're still on the forward lap, just
        // reversing direction, or on the backward lap.
        onBegin: ({ G }) => {
          G.setupTurnCount = (G.setupTurnCount || 0) + 1;
        },
        order: {
          first: () => 0,
          next: ({ G, ctx }) => {
            const n = ctx.numPlayers;
            const turnsSoFar = G.setupTurnCount || 1;
            if (turnsSoFar < n) return ctx.playOrderPos + 1; // forward lap
            if (turnsSoFar === n) return ctx.playOrderPos; // reverse in place
            return Math.max(0, ctx.playOrderPos - 1); // backward lap
          },
        },
        activePlayers: { currentPlayer: "placing", others: "idle" },
        stages: {
          placing: {
            moves: {
              buildSettlement: moves.buildSettlement,
              buildRoad: moves.buildRoad,
              sendChat: moves.sendChat,
              clearTradeStatus: moves.clearTradeStatus,
            },
          },
          idle: {
            moves: {
              sendChat: moves.sendChat,
            },
          },
        },
      },
      endIf: ({ G }) => {
        return Object.values(G.players).every(
            (p) => p.settlements.length === 2 && p.roads.length === 2,
        );
      },
    },

    main: {
      turn: {
        order: {
          first: () => 0,
          next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
        },
        activePlayers: { currentPlayer: "playing", others: "idle" },

        stages: {
          idle: {
            moves: {
              sendChat: moves.sendChat,
            },
          },

          playing: {
            moves: {
              rollDice: moves.rollDice,
              buildSettlement: moves.buildSettlement,
              buildRoad: moves.buildRoad,
              buildCity: moves.buildCity,
              buildResort: moves.buildResort,
              offerTrade: moves.offerTrade,
              tradeWithBank: moves.tradeWithBank,
              payToMoveRobber: moves.payToMoveRobber,
              cancelTrade: moves.cancelTrade,
              endTurn: moves.endTurn,
              sendChat: moves.sendChat,
              clearTradeStatus: moves.clearTradeStatus,
              buyDevelopmentCard: moves.buyDevelopmentCard,
              playKnight: moves.playKnight,
              playMonopoly: moves.playMonopoly,
              playRoadBuilding: moves.playRoadBuilding,
              playYearOfPlenty: moves.playYearOfPlenty,
            },
          },

          placingRobber: {
            moves: {
              placeRobber: moves.placeRobber,
              sendChat: moves.sendChat,
            },
          },

          responding: {
            moves: {
              acceptTrade: moves.acceptTrade,
              cancelTrade: moves.cancelTrade,
              sendChat: moves.sendChat,
            },
          },
        },
        onBegin: ({ G }) => {
          G.diceRolled = false;
          G.diceValue = null;
          G.isRobberPlacing = false;
        },
      },
    },
  },
  plugins: [{ name: "random" }],

  // Development cards should stay secret (per the design doc, VP cards
  // especially). Each player sees their own hand in full; everyone else's
  // cards are redacted to opaque placeholders, but the count is preserved so
  // the UI can still show "Player 2 has 3 dev cards".
  playerView: ({ G, ctx, playerID }) => {
    if (playerID === undefined || playerID === null) return G;

    return {
      ...G,
      players: Object.fromEntries(
          Object.entries(G.players).map(([pid, player]) => {
            if (pid === playerID) return [pid, player];
            return [
              pid,
              {
                ...player,
                developmentCards: player.developmentCards.map(() => ({
                  hidden: true,
                })),
              },
            ];
          }),
      ),
    };
  },
};
