import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { CatanGame } from "../CatanGame.js";

function placeSetupSettlementAndRoad(client) {
  const state = client.getState();
  const playerID = state.ctx.currentPlayer;
  const G = state.G;

  const occupied = new Set(
      Object.values(G.players).flatMap((p) => [...p.settlements, ...p.cities].map((b) => b.id)),
  );
  const occupiedNeighbors = new Set();
  occupied.forEach((id) => {
    (G.board.intersections[id]?.neighbors || []).forEach((n) => occupiedNeighbors.add(n));
  });

  const intersectionId = Object.keys(G.board.intersections).find(
      (id) => !occupied.has(id) && !occupiedNeighbors.has(id),
  );

  client.moves.buildSettlement(intersectionId);
  const edgeId = client.getState().G.board.intersections[intersectionId].adjacentEdges[0];
  client.moves.buildRoad(edgeId);
  return playerID;
}

describe("CatanGame - setup phase snake turn order", () => {
  it("follows 1-2-3-4-4-3-2-1 order for 4 players", () => {
    const client = Client({ game: CatanGame, numPlayers: 4 });
    client.start();

    const order = [];
    for (let i = 0; i < 8; i++) {
      const pid = placeSetupSettlementAndRoad(client);
      order.push(pid);
    }

    expect(order).toEqual(["0", "1", "2", "3", "3", "2", "1", "0"]);
  });

  it("moves to main phase once every player finishes setup", () => {
    const client = Client({ game: CatanGame, numPlayers: 2 });
    client.start();

    for (let i = 0; i < 4; i++) {
      placeSetupSettlementAndRoad(client);
    }

    expect(client.getState().ctx.phase).toBe("main");
    client.stop();
  });
});

describe("CatanGame.endIf - win condition", () => {
  it("declares a winner once a player reaches the target VP", () => {
    const G = {
      settings: { victoryPointsTarget: 10 },
      players: {
        "0": { victoryPoints: 7 },
        "1": { victoryPoints: 10 },
      },
    };
    const ctx = { currentPlayer: "0" };
    const result = CatanGame.endIf({ G, ctx });
    expect(result).toEqual({ winner: "1" });
  });

  it("does not declare a winner if no one reached the target", () => {
    const G = {
      settings: { victoryPointsTarget: 10 },
      players: { "0": { victoryPoints: 4 }, "1": { victoryPoints: 6 } },
    };
    const ctx = { currentPlayer: "0" };
    expect(CatanGame.endIf({ G, ctx })).toBeUndefined();
  });

  it("checks the current player first when multiple players hit the target", () => {
    const G = {
      settings: { victoryPointsTarget: 10 },
      players: { "0": { victoryPoints: 10 }, "1": { victoryPoints: 12 } },
    };
    const ctx = { currentPlayer: "1" };
    expect(CatanGame.endIf({ G, ctx })).toEqual({ winner: "1" });
  });
});
