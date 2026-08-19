import { describe, it, expect, beforeEach } from "vitest";
import { moves, isDistanceRuleMet } from "../moves.js";
import { makeG, ctxFor, fakeRandom, fakeEvents, grant, edgeTouching } from "./testUtils.js";

describe("buildRoad", () => {
  let G;
  beforeEach(() => {
    G = makeG(2);
  });

  it("rejects building without enough resources", () => {
    const edgeId = Object.keys(G.board.edges)[0];
    const ctx = ctxFor(0);
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    expect(result).toBe("INVALID_MOVE");
    expect(G.players["0"].roads.length).toBe(0);
  });

  it("rejects a non-existent edgeId", () => {
    const ctx = ctxFor(0);
    grant(G.players["0"], { brick: 1, lumber: 1 });
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, "not-a-real-edge");
    expect(result).toBe("INVALID_MOVE");
  });

  it("requires the road to connect to an existing settlement in main phase", () => {
    const edgeId = Object.keys(G.board.edges)[0];
    grant(G.players["0"], { brick: 1, lumber: 1 });
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("builds the road and deducts resources when valid", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const edgeId = edgeTouching(G.board, intersectionId);
    G.players["0"].settlements.push({
      id: intersectionId,
      owner: "0",
      adjacentHexes: G.board.intersections[intersectionId].adjacentHexes,
    });
    grant(G.players["0"], { brick: 1, lumber: 1 });
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    expect(result).toBeUndefined();
    expect(G.players["0"].roads.map((r) => r.id)).toContain(edgeId);
    expect(G.players["0"].resources.brick).toBe(0);
    expect(G.players["0"].resources.lumber).toBe(0);
  });

  it("rejects an edge already occupied by another player", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const edgeId = edgeTouching(G.board, intersectionId);
    G.players["1"].roads.push({ id: edgeId, owner: "1" });
    grant(G.players["0"], { brick: 1, lumber: 1 });
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("enforces the 15 road limit", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    for (let i = 0; i < 15; i++) {
      G.players["0"].roads.push({ id: `fake_road_${i}`, owner: "0" });
    }
    grant(G.players["0"], { brick: 1, lumber: 1 });
    const edgeId = edgeTouching(G.board, intersectionId);
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildRoad({ G, ctx, events: fakeEvents() }, edgeId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("in setup phase requires the road to touch the last placed settlement and ends the turn", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const edgeId = edgeTouching(G.board, intersectionId);
    G.players["0"].settlements.push({
      id: intersectionId,
      owner: "0",
      adjacentHexes: [],
    });
    const events = fakeEvents();
    const ctx = ctxFor(0, { phase: "setup" });
    const result = moves.buildRoad({ G, ctx, events }, edgeId);
    expect(result).toBeUndefined();
    expect(events.calls).toContainEqual(["endTurn"]);
  });
});

describe("buildSettlement", () => {
  let G;
  beforeEach(() => {
    G = makeG(2);
  });

  it("the first settlement in setup phase is free", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const ctx = ctxFor(0, { phase: "setup" });
    const result = moves.buildSettlement({ G, ctx }, intersectionId);
    expect(result).toBeUndefined();
    expect(G.players["0"].settlements.length).toBe(1);
    expect(G.players["0"].victoryPoints).toBe(1);
    expect(G.players["0"].resources.brick).toBe(0);
  });

  it("rejects a second setup settlement before a road is placed", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    const otherIntersection = Object.keys(G.board.intersections).find(
        (id) => !G.board.intersections[id].neighbors.includes(intersectionId) && id !== intersectionId,
    );
    const ctx = ctxFor(0, { phase: "setup" });
    const result = moves.buildSettlement({ G, ctx }, otherIntersection);
    expect(result).toBe("INVALID_MOVE");
  });

  it("enforces the distance rule against neighboring settlements", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    const neighborId = G.board.intersections[intersectionId].neighbors[0];
    expect(isDistanceRuleMet(G, neighborId)).toBe(false);

    const ctx = ctxFor(1, { phase: "main" });
    grant(G.players["1"], { brick: 1, lumber: 1, grain: 1, wool: 1 });
    const result = moves.buildSettlement({ G, ctx }, neighborId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("requires resources and a connected road in main phase", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const edgeId = edgeTouching(G.board, intersectionId);
    G.players["0"].roads.push({ id: edgeId, owner: "0" });
    const ctx = ctxFor(0, { phase: "main" });

    let result = moves.buildSettlement({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");

    grant(G.players["0"], { brick: 1, lumber: 1, grain: 1, wool: 1 });
    result = moves.buildSettlement({ G, ctx }, intersectionId);
    expect(result).toBeUndefined();
    expect(G.players["0"].settlements.length).toBe(1);
    expect(G.players["0"].resources.brick).toBe(0);
  });

  it("rejects building on an already occupied spot", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["1"].settlements.push({ id: intersectionId, owner: "1", adjacentHexes: [] });
    const ctx = ctxFor(0, { phase: "setup" });
    const result = moves.buildSettlement({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("the second setup settlement grants starting resources from adjacent hexes", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    const edgeId = edgeTouching(G.board, intersectionId);
    G.players["0"].settlements.push({ id: "somewhere-else", owner: "0", adjacentHexes: [] });
    G.players["0"].roads.push({ id: edgeId, owner: "0" });

    const ctx = ctxFor(0, { phase: "setup" });
    const before = { ...G.players["0"].resources };
    const result = moves.buildSettlement({ G, ctx }, intersectionId);
    expect(result).toBeUndefined();

    const totalBefore = Object.values(before).reduce((a, b) => a + b, 0);
    const totalAfter = Object.values(G.players["0"].resources).reduce((a, b) => a + b, 0);
    const adjHexes = G.board.intersections[intersectionId].adjacentHexes;
    const nonDesertAdjacent = adjHexes.filter(
        (hId) => G.board.hexes.find((h) => h.id === hId).terrain !== "desert",
    );
    expect(totalAfter - totalBefore).toBe(nonDesertAdjacent.length);
  });
});

describe("buildCity", () => {
  let G;
  beforeEach(() => {
    G = makeG(2);
  });

  it("upgrades own settlement to a city, costs resources, +1 VP", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    G.players["0"].victoryPoints = 1;
    grant(G.players["0"], { grain: 2, ore: 3 });

    const ctx = ctxFor(0);
    const result = moves.buildCity({ G, ctx }, intersectionId);
    expect(result).toBeUndefined();
    expect(G.players["0"].settlements.length).toBe(0);
    expect(G.players["0"].cities.length).toBe(1);
    expect(G.players["0"].victoryPoints).toBe(2);
    expect(G.players["0"].resources.grain).toBe(0);
    expect(G.players["0"].resources.ore).toBe(0);
  });

  it("rejects upgrading a settlement that isn't the player's own", () => {
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["1"].settlements.push({ id: intersectionId, owner: "1", adjacentHexes: [] });
    grant(G.players["0"], { grain: 2, ore: 3 });
    const ctx = ctxFor(0);
    const result = moves.buildCity({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("enforces the 4 city limit", () => {
    const G2 = makeG(1);
    for (let i = 0; i < 4; i++) {
      G2.players["0"].cities.push({ id: `city_${i}`, owner: "0", adjacentHexes: [] });
    }
    const intersectionId = Object.keys(G2.board.intersections)[0];
    G2.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    grant(G2.players["0"], { grain: 2, ore: 3 });
    const ctx = ctxFor(0);
    const result = moves.buildCity({ G: G2, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });
});

describe("buildResort", () => {
  it("seizes an opponent's city and converts it into a Resort when the rule is enabled", () => {
    const G = makeG(2);
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["1"].cities.push({ id: intersectionId, owner: "1", adjacentHexes: [] });
    G.players["1"].victoryPoints = 4;
    grant(G.players["0"], { ore: 3, lumber: 4, wool: 2, brick: 1 });

    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildResort({ G, ctx }, intersectionId);
    expect(result).toBeUndefined();
    expect(G.players["1"].cities.length).toBe(0);
    expect(G.players["1"].victoryPoints).toBe(2);
    expect(G.players["0"].resorts.map((r) => r.id)).toContain(intersectionId);
    expect(G.players["0"].victoryPoints).toBe(2);
  });

  it("is disabled when resortEnabled is false in the settings", () => {
    const G = makeG(2, { settings: { resortEnabled: false } });
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["1"].cities.push({ id: intersectionId, owner: "1", adjacentHexes: [] });
    grant(G.players["0"], { ore: 3, lumber: 4, wool: 2, brick: 1 });
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildResort({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("cannot be used during setup phase", () => {
    const G = makeG(2);
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["1"].cities.push({ id: intersectionId, owner: "1", adjacentHexes: [] });
    grant(G.players["0"], { ore: 3, lumber: 4, wool: 2, brick: 1 });
    const ctx = ctxFor(0, { phase: "setup" });
    const result = moves.buildResort({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });

  it("rejects targeting anything other than an opponent's city", () => {
    const G = makeG(2);
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    grant(G.players["0"], { ore: 3, lumber: 4, wool: 2, brick: 1 });
    const ctx = ctxFor(0, { phase: "main" });
    const result = moves.buildResort({ G, ctx }, intersectionId);
    expect(result).toBe("INVALID_MOVE");
  });
});

describe("tradeWithBank", () => {
  it("trades at the default 4:1 ratio without a harbor", () => {
    const G = makeG(2);
    grant(G.players["0"], { brick: 4 });
    const ctx = ctxFor(0);
    moves.tradeWithBank({ G, ctx }, { give: "brick", receive: "ore" });
    expect(G.players["0"].resources.brick).toBe(0);
    expect(G.players["0"].resources.ore).toBe(1);
  });

  it("rejects the trade if the player can't reach even the best ratio", () => {
    const G = makeG(2);
    grant(G.players["0"], { brick: 3 });
    const ctx = ctxFor(0);
    moves.tradeWithBank({ G, ctx }, { give: "brick", receive: "ore" });
    expect(G.players["0"].resources.brick).toBe(3);
    expect(G.players["0"].resources.ore).toBe(0);
  });

  it("uses a better ratio (2:1) when the player has the matching harbor", () => {
    const G = makeG(2);
    const oreHarbor = G.board.harbors.find((h) => h.type === "ore");
    const [intId] = oreHarbor.intersectionIds;
    G.players["0"].settlements.push({ id: intId, owner: "0", adjacentHexes: [] });
    grant(G.players["0"], { ore: 2 });
    const ctx = ctxFor(0);
    moves.tradeWithBank({ G, ctx }, { give: "ore", receive: "brick" });
    expect(G.players["0"].resources.ore).toBe(0);
    expect(G.players["0"].resources.brick).toBe(1);
  });

  it("does nothing when give === receive", () => {
    const G = makeG(2);
    grant(G.players["0"], { brick: 10 });
    const ctx = ctxFor(0);
    moves.tradeWithBank({ G, ctx }, { give: "brick", receive: "brick" });
    expect(G.players["0"].resources.brick).toBe(10);
  });
});

describe("offerTrade / acceptTrade / cancelTrade", () => {
  it("offerTrade sets activeOffer and active players when the offerer has enough", () => {
    const G = makeG(2);
    grant(G.players["0"], { brick: 2 });
    const events = fakeEvents();
    const ctx = ctxFor(0);
    moves.offerTrade(
        { G, ctx, events },
        { targetPlayerId: "1", give: { type: "brick", amount: 2 }, receive: { type: "ore", amount: 1 } },
    );
    expect(G.activeOffer).toMatchObject({ from: "0", to: "1" });
    expect(events.calls[0][0]).toBe("setActivePlayers");
  });

  it("acceptTrade swaps resources when both sides have enough", () => {
    const G = makeG(2);
    G.players["0"].resources.brick = 2;
    G.players["1"].resources.ore = 1;
    G.activeOffer = {
      from: "0",
      to: "1",
      give: { type: "brick", amount: 2 },
      receive: { type: "ore", amount: 1 },
    };
    const events = fakeEvents();
    const ctx = ctxFor(1);
    moves.acceptTrade({ G, ctx, events });

    expect(G.players["0"].resources.brick).toBe(0);
    expect(G.players["0"].resources.ore).toBe(1);
    expect(G.players["1"].resources.ore).toBe(0);
    expect(G.players["1"].resources.brick).toBe(2);
    expect(G.activeOffer).toBeNull();
  });

  it("acceptTrade does nothing if the acceptor can't pay", () => {
    const G = makeG(2);
    G.players["0"].resources.brick = 2;
    G.players["1"].resources.ore = 0;
    G.activeOffer = {
      from: "0",
      to: "1",
      give: { type: "brick", amount: 2 },
      receive: { type: "ore", amount: 1 },
    };
    const ctx = ctxFor(1);
    moves.acceptTrade({ G, ctx, events: fakeEvents() });
    expect(G.activeOffer).not.toBeNull();
    expect(G.players["0"].resources.brick).toBe(2);
  });

  it("cancelTrade clears the offer when cancelled by either side", () => {
    const G = makeG(2);
    G.activeOffer = { from: "0", to: "1", give: { type: "brick", amount: 1 }, receive: { type: "ore", amount: 1 } };
    const events = fakeEvents();
    moves.cancelTrade({ G, ctx: ctxFor(1), events });
    expect(G.activeOffer).toBeNull();
  });
});

describe("dice & resource distribution", () => {
  it("rollDice rejects a second roll in the same turn", () => {
    const G = makeG(2, { diceRolled: true });
    const ctx = ctxFor(0);
    const result = moves.rollDice({ G, ctx, random: fakeRandom({ d6Sequence: [3, 3] }), events: fakeEvents() });
    expect(result).toBe("INVALID_MOVE");
  });

  it("standard mode sums two D6 rolls", () => {
    const G = makeG(2);
    const ctx = ctxFor(0);
    moves.rollDice({ G, ctx, random: fakeRandom({ d6Sequence: [4, 5] }), events: fakeEvents() });
    expect(G.diceValue).toBe(9);
    expect(G.diceRolled).toBe(true);
  });

  it("rolling a 7 triggers a discard (>7 cards -> half) and starts robber placement", () => {
    const G = makeG(2);
    G.players["0"].resources.brick = 9;
    const events = fakeEvents();
    const ctx = ctxFor(0);
    moves.rollDice({ G, ctx, random: fakeRandom({ d6Sequence: [4, 3] }), events });
    expect(G.diceValue).toBe(7);
    expect(G.isRobberPlacing).toBe(true);
    expect(events.calls).toContainEqual(["setStage", "placingRobber"]);
    const total = Object.values(G.players["0"].resources).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
  });

  it("distributes resources for settlements adjacent to the rolled number", () => {
    const G = makeG(2);
    const hex = G.board.hexes.find((h) => h.terrain !== "desert");
    const intersectionId = Object.keys(G.board.intersections).find((id) =>
        G.board.intersections[id].adjacentHexes.includes(hex.id),
    );
    G.players["0"].settlements.push({
      id: intersectionId,
      owner: "0",
      adjacentHexes: G.board.intersections[intersectionId].adjacentHexes,
    });
    const ctx = ctxFor(0);
    const roll = hex.number;
    moves.rollDice({ G, ctx, random: fakeRandom({ d6Sequence: splitRoll(roll) }), events: fakeEvents() });
    const resType = { hills: "brick", forest: "lumber", fields: "grain", pasture: "wool", mountains: "ore" }[hex.terrain];
    expect(G.players["0"].resources[resType]).toBeGreaterThanOrEqual(1);
  });
});

function splitRoll(total) {
  const d1 = Math.max(1, Math.min(6, total - 1));
  const d2 = total - d1;
  return [d1, d2];
}

describe("placeRobber", () => {
  it("moves the robber and steals from a random adjacent opponent", () => {
    const G = makeG(2);
    const hex = G.board.hexes.find((h) => h.terrain !== "desert" && h.id !== G.board.robberPosition);
    const intersectionId = Object.keys(G.board.intersections).find((id) =>
        G.board.intersections[id].adjacentHexes.includes(hex.id),
    );
    G.players["1"].settlements.push({
      id: intersectionId,
      owner: "1",
      adjacentHexes: G.board.intersections[intersectionId].adjacentHexes,
    });
    G.players["1"].resources.brick = 3;

    const events = fakeEvents();
    const ctx = ctxFor(0);
    const result = moves.placeRobber({ G, ctx, events, random: fakeRandom() }, hex.id);
    expect(result).toBeUndefined();
    expect(G.board.robberPosition).toBe(hex.id);
    expect(events.calls).toContainEqual(["setStage", "playing"]);

    const totalStolen = Object.values(G.players["0"].resources).reduce((a, b) => a + b, 0);
    expect(totalStolen).toBe(1);
  });

  it("rejects placing the robber on the hex it's already on", () => {
    const G = makeG(2);
    const ctx = ctxFor(0);
    const result = moves.placeRobber(
        { G, ctx, events: fakeEvents(), random: fakeRandom() },
        G.board.robberPosition,
    );
    expect(result).toBe("INVALID_MOVE");
  });
});

describe("payToMoveRobber", () => {
  it("costs 1 of each resource and clears the robber when the rule is enabled", () => {
    const G = makeG(2);
    grant(G.players["0"], { brick: 1, lumber: 1, grain: 1, wool: 1, ore: 1 });
    const ctx = ctxFor(0);
    moves.payToMoveRobber({ G, ctx });
    expect(G.board.robberPosition).toBe("neutral");
    Object.values(G.players["0"].resources).forEach((v) => expect(v).toBe(0));
  });

  it("is disabled when robberPayToClear is false", () => {
    const G = makeG(2, { settings: { robberPayToClear: false } });
    grant(G.players["0"], { brick: 1, lumber: 1, grain: 1, wool: 1, ore: 1 });
    const ctx = ctxFor(0);
    const result = moves.payToMoveRobber({ G, ctx });
    expect(result).toBe("INVALID_MOVE");
    expect(G.players["0"].resources.brick).toBe(1);
  });
});

describe("turn flow", () => {
  it("endTurn resets per-turn flags and increments turnCount", () => {
    const G = makeG(2, { diceRolled: true, diceValue: 6, devCardPlayedThisTurn: true, turnCount: 0 });
    const events = fakeEvents();
    moves.endTurn({ G, ctx: ctxFor(0), events });
    expect(G.diceRolled).toBe(false);
    expect(G.diceValue).toBeNull();
    expect(G.devCardPlayedThisTurn).toBe(false);
    expect(G.turnCount).toBe(1);
    expect(events.calls).toContainEqual(["endTurn"]);
  });

  it("endTurn is blocked while the robber is being placed", () => {
    const G = makeG(2, { isRobberPlacing: true });
    const result = moves.endTurn({ G, ctx: ctxFor(0), events: fakeEvents() });
    expect(result).toBe("INVALID_MOVE");
  });

  it("advances the season every 5 turns", () => {
    const G = makeG(2, { turnCount: 4, season: "Spring" });
    moves.endTurn({ G, ctx: ctxFor(0), events: fakeEvents() });
    expect(G.turnCount).toBe(5);
    expect(G.season).toBe("Summer");
  });

  it("sendChat rejects empty/whitespace messages", () => {
    const G = makeG(2);
    const result = moves.sendChat({ G, ctx: ctxFor(0), playerID: "0" }, "   ");
    expect(result).toBe("INVALID_MOVE");
    expect(G.chatMessages.length).toBe(0);
  });

  it("sendChat trims and stores the message text", () => {
    const G = makeG(2);
    moves.sendChat({ G, ctx: ctxFor(0), playerID: "0" }, "  hello  ");
    expect(G.chatMessages[0].text).toBe("hello");
  });
});

describe("development cards", () => {
  it("buyDevelopmentCard deducts resources and adds a card; Victory Point card scores immediately", () => {
    const G = makeG(2, { devCardDeck: [{ type: "victoryPoint", name: "Chapel" }], turnCount: 3 });
    grant(G.players["0"], { ore: 1, grain: 1, wool: 1 });
    const ctx = ctxFor(0);
    moves.buyDevelopmentCard({ G, ctx, random: fakeRandom() });
    expect(G.players["0"].developmentCards.length).toBe(1);
    expect(G.players["0"].victoryPoints).toBe(1);
    expect(G.players["0"].resources.ore).toBe(0);
  });

  it("buyDevelopmentCard rejects when the deck is empty", () => {
    const G = makeG(2, { devCardDeck: [] });
    grant(G.players["0"], { ore: 1, grain: 1, wool: 1 });
    const result = moves.buyDevelopmentCard({ G, ctx: ctxFor(0), random: fakeRandom() });
    expect(result).toBe("INVALID_MOVE");
  });

  it("playKnight increments knights played, triggers robber placement, and blocks a same-turn purchase", () => {
    const G = makeG(2, { turnCount: 5 });
    G.players["0"].developmentCards.push({ type: "knight", boughtTurn: 3 });
    const events = fakeEvents();
    moves.playKnight({ G, ctx: ctxFor(0), events });
    expect(G.players["0"].knightsPlayed).toBe(1);
    expect(G.devCardPlayedThisTurn).toBe(true);
    expect(events.calls).toContainEqual(["setStage", "placingRobber"]);

    G.players["0"].developmentCards.push({ type: "knight", boughtTurn: 3 });
    const result = moves.playKnight({ G, ctx: ctxFor(0), events });
    expect(result).toBe("INVALID_MOVE");
  });

  it("rejects playing a card bought in the current turn (boughtTurn === currentTurn)", () => {
    const G = makeG(2, { turnCount: 5 });
    G.players["0"].developmentCards.push({ type: "knight", boughtTurn: 5 });
    const result = moves.playKnight({ G, ctx: ctxFor(0), events: fakeEvents() });
    expect(result).toBe("INVALID_MOVE");
  });

  it("awards Largest Army at 3 knights", () => {
    const G = makeG(2, { turnCount: 5 });
    G.players["0"].knightsPlayed = 2;
    G.players["0"].developmentCards.push({ type: "knight", boughtTurn: 1 });
    moves.playKnight({ G, ctx: ctxFor(0), events: fakeEvents() });
    expect(G.players["0"].knightsPlayed).toBe(3);
    expect(G.largestArmyHolder).toBe("0");
    expect(G.players["0"].hasLargestArmy).toBe(true);
    expect(G.players["0"].victoryPoints).toBe(2);
  });

  it("playMonopoly takes all of one resource from every opponent", () => {
    const G = makeG(3, { turnCount: 5 });
    G.players["0"].developmentCards.push({ type: "monopoly", boughtTurn: 1 });
    G.players["1"].resources.wool = 3;
    G.players["2"].resources.wool = 2;
    moves.playMonopoly({ G, ctx: ctxFor(0) }, "wool");
    expect(G.players["0"].resources.wool).toBe(5);
    expect(G.players["1"].resources.wool).toBe(0);
    expect(G.players["2"].resources.wool).toBe(0);
    expect(G.devCardPlayedThisTurn).toBe(true);
  });

  it("playYearOfPlenty grants 2 chosen resources from the bank", () => {
    const G = makeG(2, { turnCount: 5 });
    G.players["0"].developmentCards.push({ type: "yearOfPlenty", boughtTurn: 1 });
    moves.playYearOfPlenty({ G, ctx: ctxFor(0) }, "brick", "ore");
    expect(G.players["0"].resources.brick).toBe(1);
    expect(G.players["0"].resources.ore).toBe(1);
  });

  it("playRoadBuilding builds up to 2 free roads with no cost", () => {
    const G = makeG(2, { turnCount: 5 });
    const intersectionId = Object.keys(G.board.intersections)[0];
    G.players["0"].settlements.push({ id: intersectionId, owner: "0", adjacentHexes: [] });
    G.players["0"].developmentCards.push({ type: "roadBuilding", boughtTurn: 1 });

    const edges = G.board.intersections[intersectionId].adjacentEdges.slice(0, 2);
    const result = moves.playRoadBuilding({ G, ctx: ctxFor(0) }, edges);
    expect(result).toBeUndefined();
    expect(G.players["0"].roads.length).toBe(2);
    expect(G.players["0"].resources.brick).toBe(0);
  });

  it("only allows one development card per turn", () => {
    const G = makeG(2, { turnCount: 5, devCardPlayedThisTurn: true });
    G.players["0"].developmentCards.push({ type: "monopoly", boughtTurn: 1 });
    const result = moves.playMonopoly({ G, ctx: ctxFor(0) }, "wool");
    expect(result).toBe("INVALID_MOVE");
  });
});
