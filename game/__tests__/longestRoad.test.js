import { describe, it, expect } from "vitest";
import { moves, computeLongestRoad } from "../moves.js";
import { makeG, ctxFor, fakeEvents, grant } from "./testUtils.js";

function buildRoadChain(board, startIntersectionId, length, excludeEdges = new Set()) {
  const chain = [];
  const usedEdges = new Set();
  const visitedVertices = new Set([startIntersectionId]);
  let frontierVertex = startIntersectionId;

  while (chain.length < length) {
    const candidateEdgeIds = board.intersections[frontierVertex].adjacentEdges;
    const edgeId = candidateEdgeIds.find((id) => {
      if (usedEdges.has(id) || excludeEdges.has(id)) return false;
      const [a, b] = board.edges[id].endpoints;
      const otherEnd = a === frontierVertex ? b : a;
      return !visitedVertices.has(otherEnd);
    });
    if (!edgeId) throw new Error("Board graph too small for requested chain length");

    const [a, b] = board.edges[edgeId].endpoints;
    const otherEnd = a === frontierVertex ? b : a;

    chain.push(edgeId);
    usedEdges.add(edgeId);
    visitedVertices.add(otherEnd);
    frontierVertex = otherEnd;
  }
  return chain;
}

describe("computeLongestRoad", () => {
  it("returns 0 when the player has no roads", () => {
    const G = makeG(2);
    expect(computeLongestRoad(G, "0")).toBe(0);
  });

  it("counts the length of an unbroken road chain", () => {
    const G = makeG(2);
    const startIntersection = Object.keys(G.board.intersections)[0];
    const chain = buildRoadChain(G.board, startIntersection, 4);
    chain.forEach((edgeId) => G.players["0"].roads.push({ id: edgeId, owner: "0" }));
    expect(computeLongestRoad(G, "0")).toBe(4);
  });

  it("is cut off by an opponent settlement on the path", () => {
    const G = makeG(2);
    const startIntersection = Object.keys(G.board.intersections)[0];
    const chain = buildRoadChain(G.board, startIntersection, 4);
    chain.forEach((edgeId) => G.players["0"].roads.push({ id: edgeId, owner: "0" }));

    const secondEdge = G.board.edges[chain[1]];
    const cutNode = secondEdge.endpoints[0];
    G.players["1"].settlements.push({ id: cutNode, owner: "1", adjacentHexes: [] });

    const cutLength = computeLongestRoad(G, "0");
    expect(cutLength).toBeLessThan(4);
  });
});

describe("Longest Road award / transfer (via buildRoad)", () => {
  it("awards +2 VP and hasLongestRoad when a player reaches >=5 segments", () => {
    const G = makeG(2);
    const startIntersection = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: startIntersection, owner: "0", adjacentHexes: [] });
    const chain = buildRoadChain(G.board, startIntersection, 5);

    const ctx = ctxFor(0, { phase: "main" });
    chain.forEach((edgeId) => {
      grant(G.players["0"], { brick: 1, lumber: 1 });
      moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    });

    expect(G.longestRoadHolder).toBe("0");
    expect(G.players["0"].hasLongestRoad).toBe(true);
    expect(G.players["0"].victoryPoints).toBe(2);
  });

  it("does not award Longest Road below 5 segments", () => {
    const G = makeG(2);
    const startIntersection = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: startIntersection, owner: "0", adjacentHexes: [] });
    const chain = buildRoadChain(G.board, startIntersection, 4);

    const ctx = ctxFor(0, { phase: "main" });
    chain.forEach((edgeId) => {
      grant(G.players["0"], { brick: 1, lumber: 1 });
      moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    });

    expect(G.longestRoadHolder).toBeNull();
    expect(G.players["0"].victoryPoints).toBe(0);
  });

  it("transfers Longest Road to an opponent with a longer chain", () => {
    const G = makeG(2);

    const start0 = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: start0, owner: "0", adjacentHexes: [] });
    const chain0 = buildRoadChain(G.board, start0, 5);
    const ctx0 = ctxFor(0, { phase: "main" });
    chain0.forEach((edgeId) => {
      grant(G.players["0"], { brick: 1, lumber: 1 });
      moves.buildRoad({ G, ctx: ctx0, events: fakeEvents() }, edgeId);
    });
    expect(G.longestRoadHolder).toBe("0");

    const usedIntersections = new Set(
        chain0.flatMap((edgeId) => G.board.edges[edgeId].endpoints),
    );
    const usedEdges0 = new Set(chain0);
    const candidates = Object.keys(G.board.intersections).filter(
        (id) => !usedIntersections.has(id),
    );
    let start1;
    let chain1;
    for (const candidate of candidates) {
      try {
        chain1 = buildRoadChain(G.board, candidate, 6, usedEdges0);
        start1 = candidate;
        break;
      } catch {
        continue;
      }
    }
    if (!chain1) throw new Error("No candidate start found room for a 6-road chain");
    G.players["1"].settlements.push({ id: start1, owner: "1", adjacentHexes: [] });

    const ctx1 = ctxFor(1, { phase: "main" });
    chain1.forEach((edgeId) => {
      grant(G.players["1"], { brick: 1, lumber: 1 });
      moves.buildRoad({ G, ctx: ctx1, events: fakeEvents() }, edgeId);
    });

    expect(G.longestRoadHolder).toBe("1");
    expect(G.players["0"].hasLongestRoad).toBe(false);
    expect(G.players["0"].victoryPoints).toBe(0);
    expect(G.players["1"].hasLongestRoad).toBe(true);
    expect(G.players["1"].victoryPoints).toBe(2);
  });
});
