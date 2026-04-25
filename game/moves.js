import { RESOURCES } from "./constants.js";

const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 },
};

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

    const die1 = random.D6();
    const die2 = random.D6();
    const roll = die1 + die2;

    G.diceValue = roll;
    G.diceRolled = true;

    console.log(`BACKEND STORED: ${roll}`);
    console.log(`SERVER-SIDE ROLL: ${roll}`);

    console.log("Rolled value:", roll);
    console.log("Stored in G.diceValue:", roll);
    console.log(`Player ${ctx.currentPlayer} rolled ${roll}`);

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
      return [...p.settlements, ...p.cities].some((building) => {
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
    if (!intersectionData) return "INVALID_MOVE";

    if (!isDistanceRuleMet(G, intersectionId)) return "INVALID_MOVE";

    if (ctx.phase !== "setup") {
      if (!hasEnoughResources(player, BUILD_COSTS.settlement))
        return "INVALID_MOVE";

      if (
        !isIntersectionConnectedToPlayerRoad(
          G,
          ctx.currentPlayer,
          intersectionId,
        )
      )
        return "INVALID_MOVE";
      deductResources(player, BUILD_COSTS.settlement);
    } else if (player.settlements.length >= 2) {
      return "INVALID_MOVE";
    }

    player.settlements.push({
      id: intersectionId,
      owner: ctx.currentPlayer,
      adjacentHexes: intersectionData.adjacentHexes || [],
    });
    player.victoryPoints += 1;
  },

  buildCity({ G, ctx }, intersectionId) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";
    const player = G.players[ctx.currentPlayer];

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
    } else {
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
    }
  },

  tradeWithBank({ G, ctx }, { give, receive }) {
    if (ctx.playerID && String(ctx.playerID) !== String(ctx.currentPlayer))
      return "INVALID_MOVE";

    const player = G.players[ctx.currentPlayer];

    if (!player || !player.resources) return;
    if (give === receive) return;

    if (player.resources[give] >= 4) {
      player.resources[give] -= 4;
      player.resources[receive] += 1;

      console.log(
        `Player ${ctx.currentPlayer} traded 4 ${give} for 1 ${receive}`,
      );
    } else {
      console.log(
        `Trade failed: Player ${ctx.currentPlayer} only has ${player.resources[give]} ${give}`,
      );
    }
  },

  payToMoveRobber({ G, ctx }) {
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
    G.turnCount += 1;

    if (G.turnCount > 0 && G.turnCount % 5 === 0) {
      advanceSeason(G);
    }

    events.endTurn();
  },

  claimLargestArmy({ G, ctx }) {
    const player = G.players[ctx.currentPlayer];
    const currentHolder = G.largestArmyHolder;
    if (currentHolder === ctx.currentPlayer) return "INVALID_MOVE";

    if (currentHolder !== null) {
      G.players[currentHolder].victoryPoints -= 2;
    }
    G.largestArmyHolder = ctx.currentPlayer;
    player.victoryPoints += 2;

    advanceSeason(G);
    console.log(
      `Player ${ctx.currentPlayer} claimed Largest Army. Season → ${G.season}`,
    );
  },
};

function hasEnoughResources(player, cost) {
  return Object.keys(cost).every((res) => player.resources[res] >= cost[res]);
}

function deductResources(player, cost) {
  Object.keys(cost).forEach((res) => {
    player.resources[res] -= cost[res];
  });
}

function isIntersectionConnectedToPlayerRoad(G, playerID, intersectionId) {
  const playerRoads = G.players[playerID].roads;
  const adjEdges = G.board.intersections[intersectionId]?.adjacentEdges || [];
  return playerRoads.some((road) => adjEdges.includes(road.id));
}

function distributeResourcesLogic({ G, roll, random }) {
  const season = G.season;
  console.log(
    `--- Distributing Resources for Roll: ${roll} (Season: ${season}) ---`,
  );

  if (season === "Winter" && (roll === 2 || roll === 12)) {
    const activeHex = G.board.hexes.find((h) => h.number === roll);
    if (activeHex) {
      G.board.robberPosition = activeHex.id;
      console.log(`Winter: Robber moved to hex ${activeHex.id}`);

      Object.keys(G.players).forEach((pId) => {
        const player = G.players[pId];
        const isAdjacent = [...player.settlements, ...player.cities].some((b) =>
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

function isDistanceRuleMet(G, intId) {
  const neighbors = G.board.intersections[intId]?.neighbors || [];
  return !neighbors.some((nId) =>
    Object.values(G.players).some((p) =>
      [...p.settlements, ...p.cities].some((b) => b.id === nId),
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

  const touchesRoad = player.roads.some((r) => {
    const roadData = G.board.edges[r.id];
    return roadData?.neighbors?.includes(edgeId);
  });

  return touchesSettlement || touchesCity || touchesRoad;
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
