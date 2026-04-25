export const phases = {
  setup: {
    start: true,
    next: "main",
    turn: {
      order: {
        first: ({ ctx }) => 0,
        next: ({ G, ctx }) => {
          const numPlayers = ctx.numPlayers;
          if (ctx.turn === 0) return 1;
          if (ctx.turn === 1) return 1;
          if (ctx.turn === 2) return 0;
          return undefined;
        },
      },
    },
    endIf: ({ G }) => {
      return Object.values(G.players).every((p) => p.settlements.length === 2);
    },
  },
  main: {},
};
