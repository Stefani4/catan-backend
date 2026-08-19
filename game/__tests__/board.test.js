import { describe, it, expect } from "vitest";
import { createBoard } from "../board.js";

describe("createBoard", () => {
  it("generates the correct hex count for standard (19) and large (37) maps", () => {
    expect(createBoard("standard").hexes.length).toBe(19);
    expect(createBoard("large").hexes.length).toBe(37);
  });

  it("has exactly one desert hex", () => {
    const board = createBoard("standard");
    const deserts = board.hexes.filter((h) => h.terrain === "desert");
    expect(deserts.length).toBe(1);
  });

  it("starts the robber on the desert hex", () => {
    const board = createBoard("standard");
    const desert = board.hexes.find((h) => h.terrain === "desert");
    expect(board.robberPosition).toBe(desert.id);
  });

  it("does not place two identical non-desert terrains next to each other", () => {
    const board = createBoard("standard");
    const byId = Object.fromEntries(board.hexes.map((h) => [h.id, h]));
    const hexNeighbors = {};
    Object.values(board.intersections).forEach((intersection) => {
      const hexes = intersection.adjacentHexes;
      hexes.forEach((h1) => {
        hexes.forEach((h2) => {
          if (h1 === h2) return;
          hexNeighbors[h1] = hexNeighbors[h1] || new Set();
          hexNeighbors[h1].add(h2);
        });
      });
    });

    Object.entries(hexNeighbors).forEach(([hexId, neighborSet]) => {
      const hex = byId[hexId];
      if (hex.terrain === "desert") return;
      neighborSet.forEach((neighborId) => {
        const neighbor = byId[neighborId];
        if (neighbor.terrain === "desert") return;
        expect(neighbor.terrain).not.toBe(hex.terrain);
      });
    });
  });

  it("only puts number tokens (2-12, no 7) on land hexes", () => {
    const board = createBoard("standard");
    board.hexes.forEach((hex) => {
      if (hex.terrain === "desert") {
        expect(hex.number).toBeNull();
      } else {
        expect(hex.number).toBeGreaterThanOrEqual(2);
        expect(hex.number).toBeLessThanOrEqual(12);
        expect(hex.number).not.toBe(7);
      }
    });
  });

  it("gives each non-desert hex the resource matching its terrain type", () => {
    const board = createBoard("standard");
    const expectedResource = {
      hills: "brick",
      forest: "lumber",
      fields: "grain",
      pasture: "wool",
      mountains: "ore",
    };
    board.hexes.forEach((hex) => {
      if (hex.terrain === "desert") {
        expect(hex.resource).toBeNull();
      } else {
        expect(hex.resource).toBe(expectedResource[hex.terrain]);
      }
    });
  });

  it("generates 9 harbors with the correct type ratio", () => {
    const board = createBoard("standard");
    expect(board.harbors.length).toBe(9);
    const generic = board.harbors.filter((h) => h.type === "generic");
    const specific = board.harbors.filter((h) => h.type !== "generic");
    expect(generic.length).toBe(4);
    expect(specific.length).toBe(5);
    generic.forEach((h) => expect(h.ratio).toBe(3));
    specific.forEach((h) => expect(h.ratio).toBe(2));
  });

  it("keeps intersection <-> edge adjacency symmetric", () => {
    const board = createBoard("standard");
    Object.values(board.edges).forEach((edge) => {
      const [a, b] = edge.endpoints;
      expect(board.intersections[a].adjacentEdges).toContain(edge.id);
      expect(board.intersections[b].adjacentEdges).toContain(edge.id);
      expect(board.intersections[a].neighbors).toContain(b);
      expect(board.intersections[b].neighbors).toContain(a);
    });
  });

  it("keeps edge.neighbors reciprocal for every edge", () => {
    const board = createBoard("standard");
    Object.values(board.edges).forEach((edge) => {
      edge.neighbors.forEach((neighborId) => {
        expect(board.edges[neighborId].neighbors).toContain(edge.id);
      });
    });
  });
});
