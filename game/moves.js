import { RESOURCES, DEV_CARD_COST } from "./constants.js";

const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 },
  // From the design doc's optional "Resort" rule: 3 ore, 4 wood, 2 wool, 1
  // clay. (The doc also lists an alternate "(2 grain, 2 wool, 1 ore)" cost
  // in parentheses without saying when it'd apply, so we go with the
  // primary figures.)
  resort: { ore: 3, lumber: 4, wool: 2, brick: 1 },
};

// Physical piece limits from the real game (5 settlement pieces, 4 city
// pieces, 15 road pieces per player).
const MAX_SETTLEMENTS = 5;
const MAX_CITIES = 4;
const MAX_ROADS = 15;

const TERRAIN_TO_RES = {
  forest: "lumber",
  hills: "brick",
  fields: "grain",
  pasture: "wool",
  mountains: "ore",
};

export const moves = {
  rollDice({ G, ctx, random, events }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    if (G.diceRolled) return "INVALID_MOVE";

    const diceMode = G.settings?.diceMode || "standard";
    let roll;

    if (diceMode === "wheel") {
      // A single spin, but weighted so the 2-12 distribution is IDENTICAL
      // to rolling two dice (1/36 per pip-combination) rather than a flat
      // 1-in-11 chance per number — otherwise every Season/robber rule that
      // keys off specific rolls (6/8, 3/11, 2/12...) would suddenly behave
      // very differently on a whim of which dice mode got picked.
      const WEIGHTS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]; // sums to 36, for rolls 2..12
      const pick = random.Die(36); // 1..36
      let cumulative = 0;
      roll = 2;
      for (let i = 0; i < WEIGHTS.length; i++) {
        cumulative += WEIGHTS[i];
        if (pick <= cumulative) {
          roll = 2 + i;
          break;
        }
      }
      G.diceValue = roll;
    } else {
      const die1 = random.D6();
      const die2 = random.D6();
      roll = die1 + die2;
      G.diceValue = roll;
    }

    G.diceRolled = true;

    console.log(`Player ${ctx.currentPlayer} rolled ${roll} (mode: ${diceMode})`);

    if (roll === 7) {
      handleRobberDiscard({ G, random });
      G.isRobberPlacing = true;
      events.setStage("placingRobber");
    } else {
      distributeResourcesLogic({ G, ctx, roll, random });
    }
  },

  placeRobber({ G, ctx, events, random }, hexId) {
    if (hexId === G.board.robberPosition) return "INVALID_MOVE";
    G.board.robberPosition = hexId;
    G.isRobberPlacing = false; // Turn off placement UI
    events.setStage("playing");

    const potentialVictims = Object.keys(G.players).filter((pid) => {
      if (pid === ctx.currentPlayer) return false;
      const p = G.players[pid];
      return [...p.settlements, ...p.cities, ...(p.resorts || [])].some((building) => {
        const intersection = G.board.intersections[building.id];
        return intersection?.adjacentHexes.includes(hexId);
      });
    });

    if (potentialVictims.length > 0) {
      const victimId = random.Shuffle(potentialVictims)[0];
      const victim = G.players[victimId];
      const heldResources = Object.keys(victim.resources).filter(
          (k) => victim.resources[k] > 0,
      );

      if (heldResources.length > 0) {
        const stolenRes = random.Shuffle(heldResources)[0];
        victim.resources[stolenRes]--;
        G.players[ctx.currentPlayer].resources[stolenRes]++;
        console.log(
            `Robber: Player ${ctx.currentPlayer} stole ${stolenRes} from Player ${victimId}`,
        );
      }
    }
  },

  buildSettlement({ G, ctx }, intersectionId) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];
    const intersectionData = G.board.intersections[intersectionId];
    if (!intersectionData) {
      console.warn(
          `buildSettlement rejected: "${intersectionId}" is not a known intersection on this board.`,
      );
      return "INVALID_MOVE";
    }

    if (!isDistanceRuleMet(G, intersectionId)) {
      console.warn(
          `buildSettlement rejected: "${intersectionId}" is within one edge of an existing settlement/city (distance rule).`,
      );
      return "INVALID_MOVE";
    }

    const isAlreadyOccupied = Object.values(G.players).some((p) =>
        [...p.settlements, ...p.cities, ...(p.resorts || [])].some(
            (b) => b.id === intersectionId,
        ),
    );
    if (isAlreadyOccupied) {
      console.warn(
          `buildSettlement rejected: "${intersectionId}" already has a building on it (Resorts can never be overwritten).`,
      );
      return "INVALID_MOVE";
    }

    if (ctx.phase !== "setup") {
      // Physical piece supply: real Catan gives each player only 5
      // settlement pieces. Without this cap a player could keep placing
      // settlements indefinitely as long as they had resources + roads.
      if (player.settlements.length >= MAX_SETTLEMENTS) {
        console.warn(
            `buildSettlement rejected: player ${ctx.currentPlayer} already has the max of ${MAX_SETTLEMENTS} settlements.`,
        );
        return "INVALID_MOVE";
      }

      if (!hasEnoughResources(player, BUILD_COSTS.settlement)) {
        console.warn(
            `buildSettlement rejected: player ${ctx.currentPlayer} lacks resources. Has:`,
            player.resources,
            "Needs:",
            BUILD_COSTS.settlement,
        );
        return "INVALID_MOVE";
      }

      if (
          !isIntersectionConnectedToPlayerRoad(
              G,
              ctx.currentPlayer,
              intersectionId,
          )
      ) {
        console.warn(
            `buildSettlement rejected: "${intersectionId}" is not adjacent to any of player ${ctx.currentPlayer}'s roads. Player's roads:`,
            player.roads.map((r) => r.id),
            "Intersection's adjacent edges:",
            intersectionData.adjacentEdges,
        );
        return "INVALID_MOVE";
      }
      deductResources(player, BUILD_COSTS.settlement);
    } else if (
        player.settlements.length >= 2 ||
        player.settlements.length !== player.roads.length
    ) {
      console.warn(
          `buildSettlement rejected during setup: player ${ctx.currentPlayer} has ${player.settlements.length} settlements and ${player.roads.length} roads (must place a road before the next settlement, max 2 total).`,
      );
      return "INVALID_MOVE";
    }

    player.settlements.push({
      id: intersectionId,
      owner: ctx.currentPlayer,
      adjacentHexes: intersectionData.adjacentHexes || [],
    });
    player.victoryPoints += 1;

    if (ctx.phase !== "setup") {
      // A settlement built on an intersection that used to run through the
      // middle of someone else's road chain severs it, so every player's
      // longest road needs re-checking, not just the builder's.
      updateLongestRoad(G);
    } else if (player.settlements.length === 2) {
      // Standard Catan setup rule: the SECOND settlement immediately grants
      // one resource card for every adjacent hex (desert produces nothing).
      // This was missing entirely, so every player entered the main phase
      // with zero resources and had to wait on a lucky dice roll before
      // they could ever afford to build again — which is exactly what made
      // it look like "I have a settlement but can never collect enough
      // resources to build another one."
      (intersectionData.adjacentHexes || []).forEach((hexId) => {
        const hex = G.board.hexes.find((h) => h.id === hexId);
        const resType = hex && TERRAIN_TO_RES[hex.terrain];
        if (resType) {
          player.resources[resType] += 1;
        }
      });
    }
  },

  buildCity({ G, ctx }, intersectionId) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    const player = G.players[ctx.currentPlayer];

    if (player.cities.length >= MAX_CITIES) {
      console.warn(
          `buildCity rejected: player ${ctx.currentPlayer} already has the max of ${MAX_CITIES} cities.`,
      );
      return "INVALID_MOVE";
    }

    if (!hasEnoughResources(player, BUILD_COSTS.city)) return "INVALID_MOVE";

    const sIdx = player.settlements.findIndex((s) => s.id === intersectionId);
    if (sIdx === -1) return "INVALID_MOVE";

    deductResources(player, BUILD_COSTS.city);
    const [originalSettlement] = player.settlements.splice(sIdx, 1);

    player.cities.push({
      id: originalSettlement.id,
      owner: ctx.currentPlayer,
      adjacentHexes: originalSettlement.adjacentHexes || [],
    });
    player.victoryPoints += 1;
  },

  // Optional "Resort" rule: seize another player's CITY (not a plain
  // settlement) and turn it into your own Resort. Once a spot is a Resort
  // it can never be taken over again by anyone (not even re-Resorted) —
  // enforced simply by the fact that it's no longer in anyone's `cities`
  // array, so this same lookup will never find it as a valid target again.
  buildResort({ G, ctx }, intersectionId) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    if (ctx.phase === "setup") return "INVALID_MOVE";
    if (G.settings && G.settings.resortEnabled === false) {
      console.warn("buildResort rejected: the Resort rule is disabled for this match.");
      return "INVALID_MOVE";
    }

    const player = G.players[ctx.currentPlayer];
    if (!hasEnoughResources(player, BUILD_COSTS.resort)) {
      console.warn(
          `buildResort rejected: player ${ctx.currentPlayer} lacks resources. Has:`,
          player.resources,
          "Needs:",
          BUILD_COSTS.resort,
      );
      return "INVALID_MOVE";
    }

    // Find an OPPONENT's city at this intersection. You can't Resort your
    // own city (upgrading further isn't the point — it's a land grab), and
    // an intersection that's a Resort or a bare settlement isn't a valid
    // target at all.
    let victimId = null;
    let cityIdx = -1;
    for (const pid of Object.keys(G.players)) {
      if (pid === ctx.currentPlayer) continue;
      const idx = G.players[pid].cities.findIndex((c) => c.id === intersectionId);
      if (idx !== -1) {
        victimId = pid;
        cityIdx = idx;
        break;
      }
    }

    if (victimId === null) {
      console.warn(
          `buildResort rejected: "${intersectionId}" is not an opponent's city (it may be empty, a settlement, your own city, or already a Resort).`,
      );
      return "INVALID_MOVE";
    }

    deductResources(player, BUILD_COSTS.resort);

    const victim = G.players[victimId];
    const [seizedCity] = victim.cities.splice(cityIdx, 1);
    victim.victoryPoints -= 2;

    if (!player.resorts) player.resorts = [];
    player.resorts.push({
      id: intersectionId,
      owner: ctx.currentPlayer,
      adjacentHexes: seizedCity.adjacentHexes || [],
    });
    // Valued the same as a City (2 VP) — the design doc doesn't specify a
    // point value for the Resort, so this keeps it consistent rather than
    // making it strictly better than what it replaces.
    player.victoryPoints += 2;

    console.log(
        `Player ${ctx.currentPlayer} seized Player ${victimId}'s city at "${intersectionId}" and built a Resort.`,
    );

    // Ownership of that intersection just changed hands, which can sever or
    // reconnect road chains passing through it for both players involved.
    updateLongestRoad(G);
  },

  buildRoad({ G, ctx, events }, edgeId) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];
    const cost = BUILD_COSTS.road;
    const boardEdge = G.board.edges[edgeId];

    if (!boardEdge) {
      console.error(
          `Road placement failed: Edge ID "${edgeId}" is not defined in G.board.edges.`,
      );
      return "INVALID_MOVE";
    }

    if (ctx.phase === "setup") {
      if (
          player.roads.length >= 2 ||
          player.roads.length >= player.settlements.length
      )
        return "INVALID_MOVE";

      const lastSettlement =
          player.settlements[player.settlements.length - 1];

      if (
          !lastSettlement ||
          !isEdgeAdjacentToIntersection(G, edgeId, lastSettlement.id)
      ) {
        console.warn(
            "Road placement failed: during setup the road must connect directly to the settlement you just placed.",
        );
        return "INVALID_MOVE";
      }
    } else {
      if (player.roads.length >= MAX_ROADS) {
        console.warn(
            `buildRoad rejected: player ${ctx.currentPlayer} already has the max of ${MAX_ROADS} roads.`,
        );
        return "INVALID_MOVE";
      }
      if (!hasEnoughResources(player, cost)) return "INVALID_MOVE";
      if (!isConnectedToPlayer(G, ctx.currentPlayer, edgeId)) {
        console.warn(
            "Road placement failed: Not connected to your existing buildings or roads.",
        );
        return "INVALID_MOVE";
      }

      deductResources(player, cost);
    }

    player.roads.push({ id: edgeId, owner: ctx.currentPlayer });

    if (ctx.phase === "setup") {
      events.endTurn();
    } else {
      updateLongestRoad(G);
    }
  },

  tradeWithBank({ G, ctx }, { give, receive }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];

    if (!player || !player.resources) return;
    if (give === receive) return;

    const ratio = getBestBankRatio(G, ctx.currentPlayer, give);

    if (player.resources[give] >= ratio) {
      player.resources[give] -= ratio;
      player.resources[receive] += 1;

      console.log(
          `Player ${ctx.currentPlayer} traded ${ratio} ${give} for 1 ${receive} (ratio ${ratio}:1)`,
      );
    } else {
      console.log(
          `Trade failed: Player ${ctx.currentPlayer} only has ${player.resources[give]} ${give}, needs ${ratio}`,
      );
    }
  },

  payToMoveRobber({ G, ctx }) {
    if (G.settings && G.settings.robberPayToClear === false) {
      console.warn("payToMoveRobber rejected: this rule is disabled for this match.");
      return "INVALID_MOVE";
    }

    const player = G.players[ctx.currentPlayer];
    const costs = ["brick", "lumber", "grain", "wool", "ore"];

    const canAfford = costs.every((res) => player.resources[res] >= 1);

    if (canAfford) {
      costs.forEach((res) => (player.resources[res] -= 1));
      G.board.robberPosition = "neutral";
      console.log(`Player ${ctx.currentPlayer} paid to clear the Robber.`);
    }
  },

  offerTrade({ G, ctx, events }, { targetPlayerId, give, receive }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const seller = G.players[ctx.currentPlayer];
    if (seller.resources[give.type] >= give.amount) {
      G.activeOffer = {
        from: String(ctx.currentPlayer),
        to: String(targetPlayerId),
        give: give,
        receive: receive,
      };

      events.setActivePlayers({
        value: {
          [ctx.currentPlayer]: "playing",
          [targetPlayerId]: "responding",
        },
      });

      console.log(`Trade offered: P${ctx.currentPlayer} -> P${targetPlayerId}`);
    }
  },

  clearTradeStatus(G) {
    G.lastTradeStatus = null;
  },

  sendChat({ G, ctx, playerID }, text) {
    if (typeof text !== "string") return "INVALID_MOVE";
    const trimmed = text.trim().slice(0, 240);
    if (!trimmed) return "INVALID_MOVE";

    const senderId = playerID !== undefined ? playerID : ctx.currentPlayer;

    if (!G.chatMessages) G.chatMessages = [];
    G.chatMessages.push({
      id: `${G.chatMessages.length}_${senderId}_${G.turnCount ?? 0}`,
      playerId: senderId,
      text: trimmed,
    });

    // Keep the log from growing unbounded over a long match
    if (G.chatMessages.length > 200) {
      G.chatMessages.splice(0, G.chatMessages.length - 200);
    }
  },

  acceptTrade({ G, ctx, events }) {
    const offer = G.activeOffer;
    if (!offer) return "INVALID_MOVE";

    if (
        ctx.playerID !== undefined &&
        String(ctx.playerID) !== String(offer.to)
    ) {
      return "INVALID_MOVE";
    }

    const seller = G.players[offer.from];
    const buyer = G.players[offer.to];

    if (
        seller.resources[offer.give.type] >= offer.give.amount &&
        buyer.resources[offer.receive.type] >= offer.receive.amount
    ) {
      seller.resources[offer.give.type] -= offer.give.amount;
      seller.resources[offer.receive.type] += offer.receive.amount;
      buyer.resources[offer.receive.type] -= offer.receive.amount;
      buyer.resources[offer.give.type] += offer.give.amount;

      G.activeOffer = null;
      events.setActivePlayers({ currentPlayer: "playing" });
    }
  },

  cancelTrade({ G, ctx, events }) {
    if (!G.activeOffer) return "INVALID_MOVE";
    const offer = G.activeOffer;
    const actingPlayer = String(
        ctx.playerID !== undefined ? ctx.playerID : ctx.currentPlayer,
    );

    if (
        actingPlayer === String(offer.to) ||
        actingPlayer === String(offer.from)
    ) {
      G.activeOffer = null;
      events.setActivePlayers({ currentPlayer: "playing" });
    }
  },

  endTurn({ G, ctx, events }) {
    if (G.isRobberPlacing) return "INVALID_MOVE";
    G.diceRolled = false;
    G.diceValue = null;
    G.devCardPlayedThisTurn = false;
    G.turnCount += 1;

    if (G.turnCount > 0 && G.turnCount % 5 === 0) {
      advanceSeason(G);
    }

    events.endTurn();
  },

  buyDevelopmentCard({ G, ctx, random }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];

    if (!G.devCardDeck || G.devCardDeck.length === 0) return "INVALID_MOVE";
    if (!hasEnoughResources(player, DEV_CARD_COST)) return "INVALID_MOVE";

    deductResources(player, DEV_CARD_COST);

    // Shuffle-and-draw from the remaining deck each time; avoids depending on
    // the random plugin being available at setup() time.
    const shuffled = random.Shuffle(G.devCardDeck);
    const card = { ...shuffled[0], boughtTurn: G.turnCount };
    G.devCardDeck = shuffled.slice(1);

    player.developmentCards.push(card);

    if (card.type === "victoryPoint") {
      // Counted immediately toward the win condition; kept out of the public
      // view via playerView so it stays secret to opponents until it matters.
      player.victoryPoints += 1;
    }
  },

  playKnight({ G, ctx, events }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    if (G.devCardPlayedThisTurn) return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];
    const idx = findPlayableCardIndex(player, "knight", G.turnCount);
    if (idx === -1) return "INVALID_MOVE";

    player.developmentCards.splice(idx, 1);
    player.knightsPlayed += 1;
    G.devCardPlayedThisTurn = true;

    checkLargestArmy(G, ctx.currentPlayer);

    // Reuse the existing robber-placement flow (same one triggered by
    // rolling a 7), just without the >7-card discard step.
    G.isRobberPlacing = true;
    events.setStage("placingRobber");
  },

  playMonopoly({ G, ctx }, resourceType) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    if (G.devCardPlayedThisTurn) return "INVALID_MOVE";
    if (!RESOURCES.includes(resourceType)) return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];
    const idx = findPlayableCardIndex(player, "monopoly", G.turnCount);
    if (idx === -1) return "INVALID_MOVE";

    player.developmentCards.splice(idx, 1);
    G.devCardPlayedThisTurn = true;

    let total = 0;
    Object.keys(G.players).forEach((pid) => {
      if (pid === ctx.currentPlayer) return;
      const opponent = G.players[pid];
      total += opponent.resources[resourceType] || 0;
      opponent.resources[resourceType] = 0;
    });
    player.resources[resourceType] += total;
  },

  playRoadBuilding({ G, ctx }, edgeIds) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    if (G.devCardPlayedThisTurn) return "INVALID_MOVE";
    if (!Array.isArray(edgeIds) || edgeIds.length === 0 || edgeIds.length > 2)
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];

    if (player.roads.length + edgeIds.length > MAX_ROADS) {
      console.warn(
          `playRoadBuilding rejected: player ${ctx.currentPlayer} would exceed the max of ${MAX_ROADS} roads.`,
      );
      return "INVALID_MOVE";
    }

    const idx = findPlayableCardIndex(player, "roadBuilding", G.turnCount);
    if (idx === -1) return "INVALID_MOVE";

    // Validate the whole batch before placing any of it, so a bad 2nd pick
    // can't leave a free road placed with no way to undo it.
    const seen = new Set();
    for (const edgeId of edgeIds) {
      if (seen.has(edgeId)) return "INVALID_MOVE";
      seen.add(edgeId);
      if (!G.board.edges[edgeId]) return "INVALID_MOVE";
      if (player.roads.some((r) => r.id === edgeId)) return "INVALID_MOVE";
    }

    // Roads placed later in the batch may rely on the earlier ones in the
    // same batch for connectivity, so validate/place incrementally.
    const placed = [];
    for (const edgeId of edgeIds) {
      if (!isConnectedToPlayer(G, ctx.currentPlayer, edgeId)) {
        return "INVALID_MOVE";
      }
      player.roads.push({ id: edgeId, owner: ctx.currentPlayer });
      placed.push(edgeId);
    }

    player.developmentCards.splice(idx, 1);
    G.devCardPlayedThisTurn = true;
    updateLongestRoad(G);
  },

  playYearOfPlenty({ G, ctx }, resourceType1, resourceType2) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    if (G.devCardPlayedThisTurn) return "INVALID_MOVE";
    if (
        !RESOURCES.includes(resourceType1) ||
        !RESOURCES.includes(resourceType2)
    )
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];
    const idx = findPlayableCardIndex(player, "yearOfPlenty", G.turnCount);
    if (idx === -1) return "INVALID_MOVE";

    player.developmentCards.splice(idx, 1);
    G.devCardPlayedThisTurn = true;

    player.resources[resourceType1] += 1;
    player.resources[resourceType2] += 1;
  },
};

function hasEnoughResources(player, cost) {
  return Object.keys(cost).every((res) => player.resources[res] >= cost[res]);
}

// Best (lowest) bank-trade ratio available to a player for a given resource:
// 4:1 by default, 3:1 if they have a settlement/city on a generic harbor,
// 2:1 if they have one on that specific resource's harbor. Harbor access is
// recorded directly on the intersection by board.js's generateHarbors().
export function getBestBankRatio(G, playerID, resource) {
  const player = G.players[playerID];
  if (!player) return 4;

  let best = 4;
  [...player.settlements, ...player.cities, ...(player.resorts || [])].forEach((b) => {
    const harbor = G.board.intersections[b.id]?.harbor;
    if (!harbor) return;
    if (harbor.type === "generic" || harbor.type === resource) {
      best = Math.min(best, harbor.ratio);
    }
  });
  return best;
}

function deductResources(player, cost) {
  Object.keys(cost).forEach((res) => {
    player.resources[res] -= cost[res];
  });
}

export function isIntersectionConnectedToPlayerRoad(G, playerID, intersectionId) {
  const playerRoads = G.players[playerID].roads;
  const adjEdges = G.board.intersections[intersectionId]?.adjacentEdges || [];
  return playerRoads.some((road) => adjEdges.includes(road.id));
}

function distributeResourcesLogic({ G, roll, random }) {
  const seasonsEnabled = !G.settings || G.settings.seasonsEnabled !== false;
  const season = seasonsEnabled ? G.season : null;
  console.log(
      `--- Distributing Resources for Roll: ${roll} (Season: ${season ?? "disabled"}) ---`,
  );

  if (season === "Winter" && (roll === 2 || roll === 12)) {
    const activeHex = G.board.hexes.find((h) => h.number === roll);
    if (activeHex) {
      G.board.robberPosition = activeHex.id;
      console.log(`Winter: Robber moved to hex ${activeHex.id}`);

      Object.keys(G.players).forEach((pId) => {
        const player = G.players[pId];
        const isAdjacent = [...player.settlements, ...player.cities, ...(player.resorts || [])].some((b) =>
            b.adjacentHexes.includes(activeHex.id),
        );

        if (isAdjacent) {
          const held = Object.keys(player.resources).filter(
              (r) => player.resources[r] > 0,
          );
          if (held.length > 0) {
            const toLose = random.Shuffle(held)[0];
            player.resources[toLose] -= 1;
          }
        }
      });
    }
    return;
  }

  G.board.hexes.forEach((hex) => {
    let shouldProduce = hex.number === roll;
    let sAmount = 1;
    let cAmount = 2;

    if (season === "Autumn" && (roll === 3 || roll === 11)) {
      if (hex.terrain === "forest" || hex.terrain === "hills") {
        shouldProduce = true;
      }
    }

    if (shouldProduce && hex.id !== G.board.robberPosition) {
      if (season === "Spring" && (roll === 6 || roll === 8)) {
        if (hex.terrain === "fields" || hex.terrain === "pasture") {
          sAmount += 1;
          cAmount += 1;
        }
      }

      if (season === "Summer" && (roll === 5 || roll === 9)) {
        if (hex.number === roll) {
          sAmount *= 2;
          cAmount *= 2;
        }
      }

      const resType = TERRAIN_TO_RES[hex.terrain];
      if (!resType) return;

      Object.keys(G.players).forEach((pId) => {
        const p = G.players[pId];
        p.settlements.forEach((s) => {
          if (s?.adjacentHexes?.includes(hex.id)) {
            p.resources[resType] += sAmount;
          }
        });

        p.cities.forEach((c) => {
          if (c?.adjacentHexes?.includes(hex.id)) {
            p.resources[resType] += cAmount;
          }
        });

        (p.resorts || []).forEach((r) => {
          if (r?.adjacentHexes?.includes(hex.id)) {
            p.resources[resType] += cAmount;
          }
        });
      });
    }
  });
}

function handleRobberDiscard({ G, random }) {
  Object.values(G.players).forEach((player) => {
    const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
    if (total > 7) {
      let discardCount = Math.floor(total / 2);
      while (discardCount > 0) {
        const available = Object.keys(player.resources).filter(
            (k) => player.resources[k] > 0,
        );
        const resToDrop = random.Shuffle(available)[0];
        player.resources[resToDrop]--;
        discardCount--;
      }
    }
  });
}

export function isDistanceRuleMet(G, intId) {
  const neighbors = G.board.intersections[intId]?.neighbors || [];
  return !neighbors.some((nId) =>
      Object.values(G.players).some((p) =>
          [...p.settlements, ...p.cities, ...(p.resorts || [])].some((b) => b.id === nId),
      ),
  );
}

function isConnectedToPlayer(G, playerID, edgeId) {
  const player = G.players[playerID];

  const boardEdge = G.board.edges ? G.board.edges[edgeId] : null;

  if (!boardEdge) {
    console.error(`Missing edge data for: ${edgeId}`);
    return false;
  }

  const touchesSettlement = player.settlements.some((s) =>
      G.board.intersections[s.id]?.adjacentEdges?.includes(edgeId),
  );

  const touchesCity = player.cities.some((c) =>
      G.board.intersections[c.id]?.adjacentEdges?.includes(edgeId),
  );

  const touchesResort = (player.resorts || []).some((r) =>
      G.board.intersections[r.id]?.adjacentEdges?.includes(edgeId),
  );

  const touchesRoad = player.roads.some((r) => {
    const roadData = G.board.edges[r.id];
    return roadData?.neighbors?.includes(edgeId);
  });

  return touchesSettlement || touchesCity || touchesResort || touchesRoad;
}

function isEdgeAdjacentToIntersection(G, edgeId, intersectionId) {
  const intersection = G.board.intersections[intersectionId];
  return intersection.adjacentEdges.includes(edgeId);
}

function advanceSeason(G) {
  const seasons = ["Spring", "Summer", "Autumn", "Winter"];
  const currentIndex = seasons.indexOf(G.season);
  G.season = seasons[(currentIndex + 1) % seasons.length];
  console.log(`Season advanced to: ${G.season}`);
}

// Longest continuous chain of a single player's own roads, in segments.
// Roads form a graph over board intersections; we DFS every simple path
// (no repeated edges) and take the longest. An intersection occupied by an
// OPPONENT's settlement/city blocks further travel past it (their building
// severs the road), matching the official rule — but doesn't prevent an
// edge from simply ending there.
export function computeLongestRoad(G, playerId) {
  const player = G.players[playerId];
  const roadIds = player.roads.map((r) => r.id);
  if (roadIds.length === 0) return 0;

  const opponentIntersections = new Set();
  Object.keys(G.players).forEach((pid) => {
    if (pid === playerId) return;
    const opponent = G.players[pid];
    [...opponent.settlements, ...opponent.cities, ...(opponent.resorts || [])].forEach((b) =>
        opponentIntersections.add(b.id),
    );
  });

  const adjacency = {};
  roadIds.forEach((edgeId) => {
    const edge = G.board.edges[edgeId];
    if (!edge) return;
    const [a, b] = edge.endpoints;
    if (!adjacency[a]) adjacency[a] = [];
    if (!adjacency[b]) adjacency[b] = [];
    adjacency[a].push({ edgeId, next: b });
    adjacency[b].push({ edgeId, next: a });
  });

  let best = 0;
  const visitedEdges = new Set();

  function dfs(node, length) {
    if (length > best) best = length;
    if (opponentIntersections.has(node)) return; // road severed here
    for (const { edgeId, next } of adjacency[node] || []) {
      if (visitedEdges.has(edgeId)) continue;
      visitedEdges.add(edgeId);
      dfs(next, length + 1);
      visitedEdges.delete(edgeId);
    }
  }

  Object.keys(adjacency).forEach((startNode) => dfs(startNode, 0));
  return best;
}

// Recomputes every player's longest road and awards/moves/revokes the 2 VP
// Longest Road card. Mirrors the official tie-breaking rule: a challenger
// only takes the card with a STRICTLY longer road than the current holder;
// if nobody currently holds it, it's only awarded when there's a single,
// unique leader at >= 5 (a tie among the leaders means nobody gets it yet).
function updateLongestRoad(G) {
  const lengths = {};
  Object.keys(G.players).forEach((pid) => {
    lengths[pid] = computeLongestRoad(G, pid);
    G.players[pid].longestRoadLength = lengths[pid];
  });

  const currentHolder = G.longestRoadHolder;
  let maxLen = 0;
  Object.values(lengths).forEach((len) => {
    if (len > maxLen) maxLen = len;
  });

  if (maxLen < 5) {
    if (currentHolder) {
      G.players[currentHolder].victoryPoints -= 2;
      G.players[currentHolder].hasLongestRoad = false;
      G.longestRoadHolder = null;
      console.log(`Player ${currentHolder} lost Longest Road (road cut).`);
    }
    return;
  }

  const leaders = Object.keys(lengths).filter((pid) => lengths[pid] === maxLen);
  let newHolder = currentHolder;

  if (!currentHolder || !leaders.includes(currentHolder)) {
    newHolder = leaders.length === 1 ? leaders[0] : null;
  }
  // else: current holder is still at (or tied for) the max — incumbent keeps it.

  if (newHolder !== currentHolder) {
    if (currentHolder) {
      G.players[currentHolder].victoryPoints -= 2;
      G.players[currentHolder].hasLongestRoad = false;
    }
    if (newHolder) {
      G.players[newHolder].victoryPoints += 2;
      G.players[newHolder].hasLongestRoad = true;
      console.log(`Player ${newHolder} claimed Longest Road (${maxLen} segments).`);
    }
    G.longestRoadHolder = newHolder;
  }
}

function checkLargestArmy(G, playerID) {
  const player = G.players[playerID];
  if (player.knightsPlayed < 3) return;

  const currentHolder = G.largestArmyHolder;
  if (currentHolder === playerID) return;

  const currentHolderKnights = currentHolder
      ? G.players[currentHolder].knightsPlayed
      : 0;

  if (player.knightsPlayed > currentHolderKnights) {
    if (currentHolder) {
      G.players[currentHolder].victoryPoints -= 2;
      G.players[currentHolder].hasLargestArmy = false;
    }
    G.largestArmyHolder = playerID;
    player.victoryPoints += 2;
    player.hasLargestArmy = true;

    // Per the seasons rules, the track also rotates whenever Largest Army
    // changes hands, in addition to every 5 turns.
    advanceSeason(G);
    console.log(`Player ${playerID} claimed Largest Army. Season → ${G.season}`);
  }
}

function findPlayableCardIndex(player, type, currentTurn) {
  // A card can't be played the same turn it was bought (standard Catan rule;
  // not stated in the design doc, but included for fairness/parity with the
  // physical game).
  return player.developmentCards.findIndex(
      (c) => c.type === type && c.boughtTurn !== currentTurn,
  );
}
