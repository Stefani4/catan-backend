import { describe, it, expect } from "vitest";
import { setup } from "../setup.js";
import {
  normalizeGameSettings,
  GAME_SETTINGS_DEFAULTS,
  DEV_CARD_DECK_COMPOSITION,
  RESOURCES,
} from "../constants.js";

describe("setup()", () => {
  it("creates the correct number of players", () => {
    const G = setup({ ctx: { numPlayers: 3 } }, {});
    expect(Object.keys(G.players)).toEqual(["0", "1", "2"]);
  });

  it("starts every player with 0 resources, 0 VP and empty lists", () => {
    const G = setup({ ctx: { numPlayers: 2 } }, {});
    Object.values(G.players).forEach((p) => {
      RESOURCES.forEach((r) => expect(p.resources[r]).toBe(0));
      expect(p.victoryPoints).toBe(0);
      expect(p.settlements).toEqual([]);
      expect(p.roads).toEqual([]);
      expect(p.cities).toEqual([]);
    });
  });

  it("applies custom settings when they are valid", () => {
    const G = setup(
        { ctx: { numPlayers: 2 } },
        { victoryPointsTarget: 15, diceMode: "wheel", mapType: "large" },
    );
    expect(G.settings.victoryPointsTarget).toBe(15);
    expect(G.settings.diceMode).toBe("wheel");
    expect(G.settings.mapType).toBe("large");
    expect(G.board.hexes.length).toBe(37);
  });

  it("builds the dev card deck with the correct composition", () => {
    const G = setup({ ctx: { numPlayers: 2 } }, {});
    const counts = {};
    G.devCardDeck.forEach((c) => {
      counts[c.type] = (counts[c.type] || 0) + 1;
    });
    expect(counts).toEqual(DEV_CARD_DECK_COMPOSITION);

    const total = Object.values(DEV_CARD_DECK_COMPOSITION).reduce((a, b) => a + b, 0);
    expect(G.devCardDeck.length).toBe(total);
  });

  it("gives every Victory Point card a name", () => {
    const G = setup({ ctx: { numPlayers: 2 } }, {});
    G.devCardDeck
        .filter((c) => c.type === "victoryPoint")
        .forEach((c) => expect(typeof c.name).toBe("string"));
  });
});

describe("normalizeGameSettings()", () => {
  it("falls back to defaults for invalid or unknown settings", () => {
    const s = normalizeGameSettings({
      victoryPointsTarget: 999,
      diceMode: "not-a-real-mode",
      mapType: "huge",
      seasonsEnabled: "yes",
    });
    expect(s).toEqual(GAME_SETTINGS_DEFAULTS);
  });

  it("keeps valid values unchanged", () => {
    const s = normalizeGameSettings({
      victoryPointsTarget: 20,
      diceMode: "wheel",
      mapType: "large",
      seasonsEnabled: false,
      robberPayToClear: false,
      resortEnabled: false,
    });
    expect(s).toEqual({
      victoryPointsTarget: 20,
      diceMode: "wheel",
      mapType: "large",
      seasonsEnabled: false,
      robberPayToClear: false,
      resortEnabled: false,
    });
  });

  it("works when no settings object is passed at all", () => {
    expect(normalizeGameSettings(undefined)).toEqual(GAME_SETTINGS_DEFAULTS);
  });
});
