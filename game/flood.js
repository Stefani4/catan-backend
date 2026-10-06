import { FLOOD_CONFIG } from "./constants.js";

// ---------------------------------------------------------------------------
// Shrinking board — pure helpers.
//
// The coastline erodes inward. Each tide floods a few "coastal" hexes (a hex
// with at least one missing / already-flooded neighbour), and the NEXT tide's
// victims are published in advance (`flood.pending`) so players can see what's
// coming and fight over what will remain.
//
// A flooded hex is open water: it produces nothing, can't hold the robber, and
// vertices / edges that touch ONLY flooded hexes can no longer be built on.
// Existing buildings and roads are never destroyed (so no VP or road-length
// recalculation is needed) — they just stop producing.
//
// To guarantee the game can always finish, the last tide starts a short
// countdown after which the VP leader wins ("the tide ends the game").
// ---------------------------------------------------------------------------

const AXIAL_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function hexIndexByCoord(hexes) {
  const map = new Map();
  hexes.forEach((h) => map.set(`${h.q},${h.r}`, h));
  return map;
}

export function isHexFlooded(G, hexId) {
  const hex = G.board.hexes.find((h) => h.id === hexId);
  return Boolean(hex?.flooded);
}

export function floodedHexIds(G) {
  return G.board.hexes.filter((h) => h.flooded).map((h) => h.id);
}

/** Hexes still above water. */
export function dryHexes(G) {
  return G.board.hexes.filter((h) => !h.flooded);
}

/**
 * A dry hex is "coastal" if any of its 6 neighbours is missing from the board,
 * flooded, or already scheduled to flood in this same tide (`extraGone`).
 */
export function coastalHexes(hexes, extraGone = new Set()) {
  const byCoord = hexIndexByCoord(hexes);
  return hexes.filter((hex) => {
    if (hex.flooded || extraGone.has(hex.id)) return false;
    return AXIAL_DIRECTIONS.some(([dq, dr]) => {
      const neighbor = byCoord.get(`${hex.q + dq},${hex.r + dr}`);
      return !neighbor || neighbor.flooded || extraGone.has(neighbor.id);
    });
  });
}

/** True when every hex touching this vertex is under water (nothing left to build on). */
export function isIntersectionSubmerged(G, intersectionId) {
  const vertex = G.board.intersections[intersectionId];
  if (!vertex) return false;
  const hexes = vertex.adjacentHexes || [];
  if (hexes.length === 0) return false;
  return hexes.every((id) => isHexFlooded(G, id));
}

/** The hexes an edge borders (the ones shared by both of its endpoints). */
export function edgeHexIds(G, edgeId) {
  const edge = G.board.edges[edgeId];
  if (!edge) return [];
  const [a, b] = edge.endpoints;
  const hexesA = G.board.intersections[a]?.adjacentHexes || [];
  const hexesB = G.board.intersections[b]?.adjacentHexes || [];
  return hexesA.filter((h) => hexesB.includes(h));
}

export function isEdgeSubmerged(G, edgeId) {
  const hexes = edgeHexIds(G, edgeId);
  if (hexes.length === 0) return false;
  return hexes.every((id) => isHexFlooded(G, id));
}

export function floodRoundOf(G, numPlayers) {
  return Math.floor((G.turnCount ?? 0) / numPlayers);
}

function planTide(hexes, count, minLand, shuffle) {
  const dryCount = hexes.filter((h) => !h.flooded).length;
  const allowed = Math.max(0, Math.min(count, dryCount - minLand));
  const chosen = [];
  const gone = new Set();
  for (let i = 0; i < allowed; i++) {
    const candidates = coastalHexes(hexes, gone);
    if (candidates.length === 0) break;
    const pick = shuffle(candidates)[0];
    chosen.push(pick.id);
    gone.add(pick.id);
  }
  return chosen;
}

export function createFloodState(board, numPlayers, shuffle = (a) => [...a].sort(() => Math.random() - 0.5)) {
  const landCount = board.hexes.length;
  const perEvent = Math.max(1, Math.round(landCount / FLOOD_CONFIG.hexesPerEventDivisor));
  const minLand = Math.max(
      FLOOD_CONFIG.minLandFloor,
      Math.ceil(landCount * FLOOD_CONFIG.minLandRatio),
  );
  const pending = planTide(board.hexes, perEvent, minLand, shuffle);
  return {
    enabled: true,
    perEvent,
    minLand,
    nextRound: FLOOD_CONFIG.firstRound,
    pending,
    tides: 0,
    final: pending.length === 0,
    endsAtTurnCount: null,
  };
}

/**
 * Called after `G.turnCount` has been incremented by endTurn. Floods the
 * pending hexes when a full round has just finished and the schedule says so.
 * `log(text)` is optional. Returns the list of hexes that went under.
 */
export function advanceFlood(G, numPlayers, shuffle, log) {
  const flood = G.flood;
  if (!flood || !flood.enabled) return [];
  if (flood.final) return [];
  if (G.turnCount % numPlayers !== 0) return []; // only on round boundaries

  const round = G.turnCount / numPlayers;
  if (round < flood.nextRound) return [];

  const sunk = [];
  flood.pending.forEach((hexId) => {
    const hex = G.board.hexes.find((h) => h.id === hexId);
    if (!hex || hex.flooded) return;
    hex.flooded = true;
    hex.hasRobber = false;
    sunk.push(hexId);
    if (G.board.robberPosition === hexId) {
      // The robber is washed away; the next 7 / Knight places it again.
      G.board.robberPosition = "neutral";
    }
  });

  flood.tides += 1;
  flood.nextRound = round + FLOOD_CONFIG.everyRounds;
  flood.pending = planTide(G.board.hexes, flood.perEvent, flood.minLand, shuffle);

  if (flood.pending.length === 0) {
    // Nothing more can be flooded without going below the minimum: this was the
    // last tide. Everyone gets `finalGraceRounds` more rounds, then the VP
    // leader wins.
    flood.final = true;
    flood.endsAtTurnCount = G.turnCount + numPlayers * FLOOD_CONFIG.finalGraceRounds;
  }

  if (log) log(sunk.length, flood.final);
  return sunk;
}

/** Rounds until the next tide arrives (0 = floods at the start of the next round). */
export function roundsUntilTide(G, numPlayers) {
  const flood = G.flood;
  if (!flood || flood.final) return null;
  const round = Math.floor((G.turnCount ?? 0) / numPlayers);
  return Math.max(0, flood.nextRound - round);
}

export function isTideGameOver(G) {
  const flood = G.flood;
  return Boolean(
      flood &&
      flood.endsAtTurnCount !== null &&
      flood.endsAtTurnCount !== undefined &&
      (G.turnCount ?? 0) >= flood.endsAtTurnCount,
  );
}

/**
 * When the tide ends the game, the VP leader wins. Ties are broken by
 * (cities + resorts), then settlements, then cards in hand, then lowest seat.
 */
export function pickTideWinner(G) {
  const total = (p) => Object.values(p.resources || {}).reduce((a, b) => a + b, 0);
  const rank = Object.entries(G.players).map(([pid, p]) => ({
    pid,
    vp: p.victoryPoints || 0,
    big: (p.cities?.length || 0) + (p.resorts?.length || 0),
    small: p.settlements?.length || 0,
    hand: total(p),
  }));
  rank.sort(
      (a, b) =>
          b.vp - a.vp ||
          b.big - a.big ||
          b.small - a.small ||
          b.hand - a.hand ||
          Number(a.pid) - Number(b.pid),
  );
  return rank[0]?.pid ?? null;
}
