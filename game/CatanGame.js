import { setup } from "./setup.js";
import { moves, grantDraftStartingResources } from "./moves.js";
import { GAME_SETTINGS_DEFAULTS } from "./constants.js";
import { maskDraftForPlayer } from "./draft.js";
import { isTideGameOver, pickTideWinner } from "./flood.js";
import { ActivePlayers } from "boardgame.io/dist/cjs/core.js";

export const CatanGame = {
  name: "catan",
  setup: setup,
  moves: moves,
  minPlayers: 2,
  maxPlayers: 4,

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

    // Shrinking board: once the last tide has come in and the grace rounds are
    // up, the VP leader takes the island. Guarantees the mode always finishes.
    if (isTideGameOver(G)) {
      return { winner: pickTideWinner(G), reason: "tide" };
    }
  },

  phases: {
    // Draft Catan only. In every other mode `G.draft` is null so this phase
    // ends the instant the game starts and play begins in "setup" as before.
    draft: {
      start: true,
      next: "setup",
      endIf: ({ G }) => !G.draft || G.draft.complete,
      onEnd: ({ G }) => {
        // No-op outside Draft mode (G.draft is null there).
        grantDraftStartingResources(G);
      },
      turn: {
        activePlayers: { all: "drafting" },
        stages: {
          drafting: {
            moves: {
              draftPick: moves.draftPick,
              sendChat: moves.sendChat,
              sendReaction: moves.sendReaction,
            },
          },
        },
      },
    },

    setup: {
      next: "main",
      turn: {
        onBegin: ({ G }) => {
          G.setupTurnCount = (G.setupTurnCount || 0) + 1;
        },
        order: {
          first: () => 0,
          next: ({ G, ctx }) => {
            const n = ctx.numPlayers;
            const turnsSoFar = G.setupTurnCount || 1;
            if (turnsSoFar < n) return ctx.playOrderPos + 1;
            if (turnsSoFar === n) return ctx.playOrderPos;
            return Math.max(0, ctx.playOrderPos - 1);
          },
        },
        activePlayers: { currentPlayer: "placing", others: "idle" },
        stages: {
          placing: {
            moves: {
              buildSettlement: moves.buildSettlement,
              buildRoad: moves.buildRoad,
              sendChat: moves.sendChat,
              sendReaction: moves.sendReaction,
              clearTradeStatus: moves.clearTradeStatus,
            },
          },
          idle: {
            moves: {
              sendChat: moves.sendChat,
              sendReaction: moves.sendReaction,
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
              sendReaction: moves.sendReaction,
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
              sendReaction: moves.sendReaction,
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
              sendReaction: moves.sendReaction,
            },
          },

          responding: {
            moves: {
              acceptTrade: moves.acceptTrade,
              cancelTrade: moves.cancelTrade,
              sendChat: moves.sendChat,
              sendReaction: moves.sendReaction,
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

  playerView: ({ G, ctx, playerID }) => {
    if (playerID === undefined || playerID === null) return G;

    return {
      ...G,
      // Other players' draft packs stay hidden until the draft is over.
      draft: G.draft ? maskDraftForPlayer(G.draft, playerID) : G.draft,
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