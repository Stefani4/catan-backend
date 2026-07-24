import { NUMBER_TOKENS, TERRAIN_RESOURCE_MAP, MAP_TYPES } from "./constants.js";

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// The 6 axial-coordinate unit steps between neighboring hexes (pointy-top
// layout), used both to generate a hexagon-shaped board of any radius and
// to derive which generated hexes are adjacent to each other.
const AXIAL_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

// All axial (q, r) coordinates within `radius` hexes of the center,
// row-major top to bottom — i.e. every hex in a regular hexagon-shaped
// board. radius=2 gives the standard 19-hex board, radius=3 gives a
// 37-hex "Large" board, etc. Count = 3*radius^2 + 3*radius + 1.
function generateHexagonAxialCoords(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

// Adjacency list (by index into `axialCoords`) derived purely from the
// coordinates themselves, replacing what used to be a hardcoded table for
// the fixed 19-hex board — this is what lets createBoard() support any
// board radius/shape without hand-maintaining a matching adjacency table.
function computeHexAdjacency(axialCoords) {
  const key = (q, r) => `${q},${r}`;
  const index = new Map(axialCoords.map((c, i) => [key(c.q, c.r), i]));
  return axialCoords.map((c) => {
    const neighbors = [];
    AXIAL_DIRECTIONS.forEach(({ q: dq, r: dr }) => {
      const i = index.get(key(c.q + dq, c.r + dr));
      if (i !== undefined) neighbors.push(i);
    });
    return neighbors;
  });
}

// Scales the standard board's terrain ratio (3 hills : 4 forest : 4 fields :
// 4 pasture : 3 mountains, +1 desert per ~19 hexes) up or down to fit any
// hex count, so a "Large" board gets proportionally the same land mix
// rather than a hardcoded set of counts that only adds up to 19.
function computeTerrainCounts(hexCount) {
  const desertCount = Math.max(1, Math.round(hexCount / 19));
  const landCount = hexCount - desertCount;
  const ratios = { hills: 3, forest: 4, fields: 4, pasture: 4, mountains: 3 };
  const ratioSum = Object.values(ratios).reduce((a, b) => a + b, 0);

  const keys = Object.keys(ratios);
  const counts = {};
  let assigned = 0;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      // Last one absorbs any rounding remainder so counts always sum to
      // exactly landCount.
      counts[k] = landCount - assigned;
    } else {
      const c = Math.round((ratios[k] / ratioSum) * landCount);
      counts[k] = c;
      assigned += c;
    }
  });
  counts.desert = desertCount;
  return counts;
}

// Repeats the standard 18-token pattern (which already has the correct
// relative 2d6 frequency — two 6s, two 8s, one 2, one 12, etc.) enough
// times to cover any land-hex count, then trims to size and shuffles. This
// keeps the same "6s and 8s are the hot tiles" character on a bigger board
// instead of inventing a new distribution.
function generateNumberPool(landCount) {
  const pool = [];
  while (pool.length < landCount) pool.push(...NUMBER_TOKENS);
  return shuffle(pool.slice(0, landCount));
}

// Circumradius of each hex in px. Chosen to match the previous ~100x110 tile
// footprint (width = size*sqrt(3), height = size*2).
const HEX_SIZE = 57;
const ROUND_PRECISION = 3;

function round(n) {
  const r = Number(n.toFixed(ROUND_PRECISION));
  return Object.is(r, -0) ? 0 : r;
}

function axialToPixel(q, r, size) {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

// Pointy-top hex corners in screen space (y grows downward), starting at the
// top vertex and going clockwise: top, upperRight, lowerRight, bottom,
// lowerLeft, upperLeft. Matches the hex tile's clip-path polygon order.
function hexCorners(cx, cy, size) {
  const angles = [270, 330, 30, 90, 150, 210];
  return angles.map((deg) => {
    const rad = (Math.PI / 180) * deg;
    return {
      x: round(cx + size * Math.cos(rad)),
      y: round(cy + size * Math.sin(rad)),
    };
  });
}

function vertexKey(x, y) {
  return `v_${x}_${y}`.replace(/-/g, "n").replace(/\./g, "p");
}

function edgeKey(a, b) {
  return [a, b].sort().join("--");
}

// A boundary edge is one that belongs to only a single hex (i.e. it's part
// of the outer coastline, facing open sea) rather than being shared between
// two neighboring hexes. We detect this by intersecting the adjacentHexes
// lists of its two endpoints: an interior (shared) edge's endpoints have 2
// hexes in common, a coastline edge's endpoints only have 1 hex in common.
function findBoundaryEdges(intersections, edges) {
  return Object.values(edges).filter((edge) => {
    const [a, b] = edge.endpoints;
    const hexesA = intersections[a].adjacentHexes;
    const hexesB = intersections[b].adjacentHexes;
    const common = hexesA.filter((h) => hexesB.includes(h));
    return common.length === 1;
  });
}

// Walks the coastline into a single ordered loop, starting anywhere. Every
// boundary vertex touches exactly 2 boundary edges (it's a simple polygon),
// so at each step we just hop to the "other" boundary edge at our new
// endpoint until we're back where we started.
function orderBoundaryLoop(boundaryEdges) {
  const byVertex = {};
  boundaryEdges.forEach((edge) => {
    edge.endpoints.forEach((v) => {
      if (!byVertex[v]) byVertex[v] = [];
      byVertex[v].push(edge.id);
    });
  });
  const edgeById = Object.fromEntries(boundaryEdges.map((e) => [e.id, e]));

  const ordered = [];
  const visited = new Set();
  let current = boundaryEdges[0];
  let cameFromVertex = current.endpoints[0];

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ordered.push(current);
    const nextVertex = current.endpoints.find((v) => v !== cameFromVertex);
    const nextEdgeId = (byVertex[nextVertex] || []).find(
        (id) => id !== current.id,
    );
    current = nextEdgeId ? edgeById[nextEdgeId] : null;
    cameFromVertex = nextVertex;
  }

  return ordered;
}

// Standard Catan harbor set: 4 generic 3:1 ports + one 2:1 port per resource.
const HARBOR_KINDS = [
  { type: "generic", ratio: 3 },
  { type: "generic", ratio: 3 },
  { type: "generic", ratio: 3 },
  { type: "generic", ratio: 3 },
  { type: "brick", ratio: 2 },
  { type: "lumber", ratio: 2 },
  { type: "grain", ratio: 2 },
  { type: "wool", ratio: 2 },
  { type: "ore", ratio: 2 },
];

// Places the 9 harbors evenly around the coastline loop, then records which
// 2 intersections each harbor grants port access to directly on those
// intersection objects (a settlement/city on either endpoint benefits).
function generateHarbors(intersections, edges, boardCenter) {
  const boundaryEdges = findBoundaryEdges(intersections, edges);
  const loop = orderBoundaryLoop(boundaryEdges);
  if (loop.length === 0) return [];

  const kinds = shuffle([...HARBOR_KINDS]);
  const harbors = [];

  for (let i = 0; i < kinds.length; i++) {
    const edgeIndex = Math.round((i * loop.length) / kinds.length);
    const edge = loop[edgeIndex];
    const [aId, bId] = edge.endpoints;
    const a = intersections[aId];
    const b = intersections[bId];

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = midX - boardCenter.x;
    const dy = midY - boardCenter.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dockX = round(midX + (dx / dist) * 32);
    const dockY = round(midY + (dy / dist) * 32);

    const harbor = {
      id: `harbor_${i}`,
      edgeId: edge.id,
      intersectionIds: [aId, bId],
      type: kinds[i].type,
      ratio: kinds[i].ratio,
      x: dockX,
      y: dockY,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
    harbors.push(harbor);

    [a, b].forEach((intersection) => {
      // An intersection could in theory be pulled toward 2 harbors if they
      // ended up adjacent; keep whichever has the better (lower) ratio.
      if (!intersection.harbor || intersection.harbor.ratio > harbor.ratio) {
        intersection.harbor = { type: harbor.type, ratio: harbor.ratio };
      }
    });
  }

  return harbors;
}

function generateConstrainedTerrains(hexAdjacency, terrainCounts) {
  const hexCount = hexAdjacency.length;
  const assignment = new Array(hexCount).fill(null);
  const remaining = { ...terrainCounts };

  function backtrack(pos) {
    if (pos === hexCount) return true;

    const candidates = shuffle(
        Object.keys(remaining).filter((t) => remaining[t] > 0),
    );

    for (const terrain of candidates) {
      const hasConflict = hexAdjacency[pos].some(
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

export const createBoard = (mapType = "standard") => {
  const { hexRadius } = MAP_TYPES[mapType] || MAP_TYPES.standard;
  const axialCoords = generateHexagonAxialCoords(hexRadius);
  const hexAdjacency = computeHexAdjacency(axialCoords);
  const hexCount = axialCoords.length;

  const terrainCounts = computeTerrainCounts(hexCount);
  const terrains = generateConstrainedTerrains(hexAdjacency, terrainCounts);

  const landCount = hexCount - terrainCounts.desert;
  const numbers = generateNumberPool(landCount);
  let numberIndex = 0;

  const hexes = terrains.map((terrain, index) => {
    const isDesert = terrain === "desert";
    const { q, r } = axialCoords[index];
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    return {
      id: `hex_${index}`,
      terrain,
      resource: TERRAIN_RESOURCE_MAP[terrain],
      number: isDesert ? null : numbers[numberIndex++],
      hasRobber: isDesert,
      q,
      r,
      // Raw (unrounded) center, used for corner math so shared corners between
      // neighboring hexes land on identical floats before rounding for the
      // merge key. Rounded to 'x'/'y' for output only, after corners are built.
      _rawX: x,
      _rawY: y,
      x: round(x),
      y: round(y),
    };
  });

  const intersections = {};
  const edges = {};

  hexes.forEach((hex) => {
    const corners = hexCorners(hex._rawX, hex._rawY, HEX_SIZE);
    const cornerIds = corners.map(({ x, y }) => {
      const id = vertexKey(x, y);
      if (!intersections[id]) {
        intersections[id] = {
          id,
          x,
          y,
          adjacentHexes: [],
          neighbors: [],
          adjacentEdges: [],
        };
      }
      if (!intersections[id].adjacentHexes.includes(hex.id)) {
        intersections[id].adjacentHexes.push(hex.id);
      }
      return id;
    });

    for (let i = 0; i < 6; i++) {
      const a = cornerIds[i];
      const b = cornerIds[(i + 1) % 6];
      const id = edgeKey(a, b);
      if (!edges[id]) {
        edges[id] = { id, endpoints: [a, b].sort(), neighbors: [] };
        intersections[a].adjacentEdges.push(id);
        intersections[b].adjacentEdges.push(id);
        intersections[a].neighbors.push(b);
        intersections[b].neighbors.push(a);
      }
    }
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

  const allX = Object.values(intersections).map((i) => i.x);
  const allY = Object.values(intersections).map((i) => i.y);
  const minX = Math.min(...allX);
  const minY = Math.min(...allY);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY);
  const padding = HEX_SIZE * 0.5;

  const shiftX = -minX + padding;
  const shiftY = -minY + padding;

  hexes.forEach((h) => {
    h.x = round(h.x + shiftX);
    h.y = round(h.y + shiftY);
    delete h._rawX;
    delete h._rawY;
  });
  Object.values(intersections).forEach((v) => {
    v.x = round(v.x + shiftX);
    v.y = round(v.y + shiftY);
  });

  const boardCenter = {
    x: round((maxX - minX) / 2 + padding),
    y: round((maxY - minY) / 2 + padding),
  };
  const harbors = generateHarbors(intersections, edges, boardCenter);

  return {
    hexes,
    intersections,
    edges,
    harbors,
    robberPosition: hexes.find((h) => h.terrain === "desert")?.id || "hex_0",
    layout: {
      hexSize: HEX_SIZE,
      hexWidth: HEX_SIZE * Math.sqrt(3),
      hexHeight: HEX_SIZE * 2,
      width: round(maxX - minX + padding * 2),
      height: round(maxY - minY + padding * 2),
    },
  };
};
