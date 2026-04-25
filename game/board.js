import { NUMBER_TOKENS, TERRAIN_RESOURCE_MAP } from "./constants.js";

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const HEX_ADJACENCY = [
  [1, 3, 4],
  [0, 2, 4, 5],
  [1, 5, 6],
  [0, 4, 7, 8],
  [0, 1, 3, 5, 8, 9],
  [1, 2, 4, 6, 9, 10],
  [2, 5, 10, 11],
  [3, 8, 12],
  [3, 4, 7, 9, 12, 13],
  [4, 5, 8, 10, 13, 14],
  [5, 6, 9, 11, 14, 15],
  [6, 10, 15],
  [7, 8, 13, 16],
  [8, 9, 12, 14, 16, 17],
  [9, 10, 13, 15, 17, 18],
  [10, 11, 14, 18],
  [12, 13, 17],
  [13, 14, 16, 18],
  [14, 15, 17],
];

function generateConstrainedTerrains() {
  const TERRAIN_COUNTS = {
    hills: 3,
    forest: 4,
    fields: 4,
    pasture: 4,
    mountains: 3,
    desert: 1,
  };

  const assignment = new Array(19).fill(null);
  const remaining = { ...TERRAIN_COUNTS };

  function backtrack(pos) {
    if (pos === 19) return true;

    const candidates = shuffle(
      Object.keys(remaining).filter((t) => remaining[t] > 0),
    );

    for (const terrain of candidates) {
      const hasConflict = HEX_ADJACENCY[pos].some(
        (n) => assignment[n] === terrain,
      );
      if (hasConflict) continue;

      assignment[pos] = terrain;
      remaining[terrain]--;

      if (backtrack(pos + 1)) return true;

      assignment[pos] = null;
      remaining[terrain]++;
    }

    return false;
  }

  backtrack(0);
  return assignment;
}

export const createBoard = () => {
  const terrains = generateConstrainedTerrains();

  const numbers = shuffle([...NUMBER_TOKENS]);
  let numberIndex = 0;

  const hexes = terrains.map((terrain, index) => {
    const isDesert = terrain === "desert";
    return {
      id: `hex_${index}`,
      terrain,
      resource: TERRAIN_RESOURCE_MAP[terrain],
      number: isDesert ? null : numbers[numberIndex++],
      hasRobber: isDesert,
    };
  });

  const intersections = {};
  const edges = {};

  const SHARED_MAP = {
    int_hex_0_bottom: ["hex_3", "hex_4"],
    int_hex_1_bottom: ["hex_4", "hex_5"],
    int_hex_2_bottom: ["hex_5", "hex_6"],

    int_hex_3_top: ["hex_0"],
    int_hex_4_top: ["hex_0", "hex_1"],
    int_hex_5_top: ["hex_1", "hex_2"],
    int_hex_6_top: ["hex_2"],

    int_hex_3_bottom: ["hex_7", "hex_8"],
    int_hex_4_bottom: ["hex_8", "hex_9"],
    int_hex_5_bottom: ["hex_9", "hex_10"],
    int_hex_6_bottom: ["hex_10", "hex_11"],

    int_hex_7_top: ["hex_3"],
    int_hex_8_top: ["hex_3", "hex_4"],
    int_hex_9_top: ["hex_4", "hex_5"],
    int_hex_10_top: ["hex_5", "hex_6"],
    int_hex_11_top: ["hex_6"],

    int_hex_7_bottom: ["hex_12"],
    int_hex_8_bottom: ["hex_12", "hex_13"],
    int_hex_9_bottom: ["hex_13", "hex_14"],
    int_hex_10_bottom: ["hex_14", "hex_15"],
    int_hex_11_bottom: ["hex_15"],

    int_hex_12_top: ["hex_7", "hex_8"],
    int_hex_13_top: ["hex_8", "hex_9"],
    int_hex_14_top: ["hex_9", "hex_10"],
    int_hex_15_top: ["hex_10", "hex_11"],

    int_hex_16_top: ["hex_12", "hex_13"],
    int_hex_17_top: ["hex_13", "hex_14"],
    int_hex_18_top: ["hex_14", "hex_15"],
  };

  hexes.forEach((hex) => {
    ["top", "bottom"].forEach((pos) => {
      const id = `int_${hex.id}_${pos}`;
      if (!intersections[id]) {
        intersections[id] = {
          id,
          adjacentHexes: [hex.id],
          neighbors: [],
          adjacentEdges: [],
        };
      }
      if (SHARED_MAP[id]) {
        SHARED_MAP[id].forEach((sharedHexId) => {
          if (!intersections[id].adjacentHexes.includes(sharedHexId)) {
            intersections[id].adjacentHexes.push(sharedHexId);
          }
        });
      }
    });
  });

  const addEdge = (intA, intB) => {
    if (!intersections[intA] || !intersections[intB]) return;
    const endpoints = [intA, intB].sort();
    const edgeId = endpoints.join("--");
    if (!edges[edgeId]) {
      edges[edgeId] = { id: edgeId, endpoints, neighbors: [] };
      intersections[intA].adjacentEdges.push(edgeId);
      intersections[intB].adjacentEdges.push(edgeId);
      intersections[intA].neighbors.push(intB);
      intersections[intB].neighbors.push(intA);
    }
  };

  hexes.forEach((h) => addEdge(`int_${h.id}_top`, `int_${h.id}_bottom`));

  Object.keys(SHARED_MAP).forEach((intId) => {
    const otherSide = intId.includes("top") ? "bottom" : "top";
    SHARED_MAP[intId].forEach((sharedHexId) => {
      addEdge(intId, `int_${sharedHexId}_${otherSide}`);
    });
  });

  Object.keys(edges).forEach((edgeId) => {
    const neighborSet = new Set();
    edges[edgeId].endpoints.forEach((endpoint) => {
      (intersections[endpoint]?.adjacentEdges || []).forEach((adjEdge) => {
        if (adjEdge !== edgeId) neighborSet.add(adjEdge);
      });
    });
    edges[edgeId].neighbors = [...neighborSet];
  });

  return {
    hexes,
    intersections,
    edges,
    robberPosition: hexes.find((h) => h.terrain === "desert")?.id || "hex_0",
  };
};
