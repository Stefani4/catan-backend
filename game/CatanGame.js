import { setup } from "./setup.js";
import { moves } from "./moves.js";
import { ActivePlayers } from "boardgame.io/dist/cjs/core.js";

export const CatanGame = {
  name: "catan",
  setup: setup,
  moves: moves,
  minPlayers: 2,
  maxPlayers: 4,

  phases: {
    setup: {
      start: true,
      next: "main",
      turn: {
        order: {
          first: () => 0,
          next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
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
        activePlayers: { currentPlayer: "playing" },

        stages: {
          playing: {
            moves: {
              rollDice: moves.rollDice,
              buildSettlement: moves.buildSettlement,
              buildRoad: moves.buildRoad,
              buildCity: moves.buildCity,
              offerTrade: moves.offerTrade,
              tradeWithBank: moves.tradeWithBank,
              payToMoveRobber: moves.payToMoveRobber,
              cancelTrade: moves.cancelTrade,
              endTurn: moves.endTurn,
            },
          },

          placingRobber: {
            moves: {
              placeRobber: moves.placeRobber,
            },
          },

          responding: {
            moves: {
              acceptTrade: moves.acceptTrade,
              cancelTrade: moves.cancelTrade,
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
};
