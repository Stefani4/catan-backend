export const RESOURCES = ["brick", "lumber", "grain", "wool", "ore"];

export const TERRAIN_RESOURCE_MAP = {
  hills: "brick",
  forest: "lumber",
  fields: "grain",
  pasture: "wool",
  mountains: "ore",
  desert: null,
};

export const NUMBER_TOKENS = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

export const VICTORY_POINTS_TO_WIN = 10;

export const VICTORY_POINTS_OPTIONS = [10, 15, 20];

export const MAP_TYPES = {
  standard: { label: "Hexagon", shape: "hexagon", hexRadius: 2, hexCount: 19 },
  large: { label: "Hexagon (Large)", shape: "hexagon", hexRadius: 3, hexCount: 37 },
  ribbon: { label: "Ribbon", shape: "rectangle", cols: 5, rows: 4, hexCount: 20 },
  delta: { label: "Delta", shape: "triangle", side: 6, hexCount: 21 },
  // 4x3 staggered rectangle (12 hexes / 38 vertices vs. 19 / 54 for standard).
  // Small enough to feel cramped, but verified to never dead-end the initial
  // placement for 2-4 players. Used by Blitz mode, selectable in any mode.
  compact: { label: "Compact", shape: "rectangle", cols: 4, rows: 3, hexCount: 12 },
  custom: { label: "Custom", shape: "hexagon", hexRadius: 2, hexCount: 19 },
};

export const DICE_MODES = {
  standard: { label: "Two Dice (standard)" },
  wheel: { label: "Spinning Wheel" },
};

// ---------------------------------------------------------------------------
// Game modes
//
// A mode is a preset layered on top of the regular settings. `forced` lists the
// settings a mode owns: normalizeGameSettings() applies them LAST, so the rules
// engine (and therefore the server) is the single authority — a client can't
// ask for "Blitz with a 20 VP target".
// ---------------------------------------------------------------------------
export const GAME_MODES = {
  classic: { forced: {} },
  // Shorter timer, smaller board, first to 6 VP.
  blitz: {
    forced: { victoryPointsTarget: 6, mapType: "compact", turnTimerSeconds: 30 },
  },
  // Pack-passing draft for starting resources + claimed hexes replaces the
  // second-settlement resource grant of the standard setup.
  draft: { forced: {} },
  // The coastline floods inward on a telegraphed schedule.
  shrinking: { forced: {} },
};

export const GAME_MODE_IDS = Object.keys(GAME_MODES);

// --- Draft Catan -----------------------------------------------------------
// Every player is dealt a pack; each round everybody picks one card at the same
// time and passes the pack on, exactly like a Magic booster draft. Packs hold
// `packSize` cards but only `picksPerPlayer` rounds are played, so each pack
// ends with `packSize - picksPerPlayer` unpicked ("burned") cards — the last
// pick is still a real choice.
export const DRAFT_CONFIG = {
  picksPerPlayer: 4,
  packSize: 6,
  maxHexCardsPerPack: 3,
  // A claimed hex pays its owner this many extra cards whenever its number is
  // rolled (robber / flooding still block it) — even with no building on it.
  hexClaimBonus: 1,
  // Client-side auto-pick so one idle player can't stall the whole table.
  pickSeconds: 40,
};

// Starting-resource cards. `common` bundles are 3 cards, the single `rare`
// per pack is 4. All drafted bundles are paid out of the bank.
export const DRAFT_BUNDLES = [
  { id: "lumberjack", rarity: "common", resources: { lumber: 2, brick: 1 } },
  { id: "brickyard", rarity: "common", resources: { brick: 2, wool: 1 } },
  { id: "shepherd", rarity: "common", resources: { wool: 2, grain: 1 } },
  { id: "farmhand", rarity: "common", resources: { grain: 2, lumber: 1 } },
  { id: "prospector", rarity: "common", resources: { ore: 2, grain: 1 } },
  { id: "smithy", rarity: "common", resources: { ore: 1, grain: 1, wool: 1 } },
  { id: "roadcrew", rarity: "rare", resources: { brick: 2, lumber: 2 } },
  { id: "settlerpack", rarity: "rare", resources: { brick: 1, lumber: 1, grain: 1, wool: 1 } },
  { id: "cityfund", rarity: "rare", resources: { grain: 2, ore: 2 } },
];

// --- Shrinking board -------------------------------------------------------
// Flooding is telegraphed: the hexes that will go under next are published in
// G.flood.pending as soon as they're chosen, so players can react.
export const FLOOD_CONFIG = {
  firstRound: 4, // first tide arrives at the start of this round (0-based)
  everyRounds: 4, // then every N rounds
  hexesPerEventDivisor: 9, // hexes per tide = max(1, round(landHexes / 9))
  minLandRatio: 0.4, // never flood below this share of the starting land...
  minLandFloor: 6, // ...or below this many hexes, whichever is larger
  finalGraceRounds: 1, // rounds played after the last tide, then the leader wins
};

export const GAME_SETTINGS_DEFAULTS = {
  victoryPointsTarget: VICTORY_POINTS_TO_WIN,
  diceMode: "standard",
  mapType: "standard",
  seasonsEnabled: true,
  robberPayToClear: true,
  resortEnabled: true,
  gameMode: "classic",
  turnTimerSeconds: null,
};

export function normalizeGameSettings(setupData) {
  const s = setupData || {};

  const gameMode = GAME_MODE_IDS.includes(s.gameMode)
      ? s.gameMode
      : GAME_SETTINGS_DEFAULTS.gameMode;
  const forced = GAME_MODES[gameMode].forced;

  // The mode's forced values win over whatever the host picked.
  const requestedMapType = Object.keys(MAP_TYPES).includes(s.mapType)
      ? s.mapType
      : GAME_SETTINGS_DEFAULTS.mapType;
  const mapType = forced.mapType ?? requestedMapType;

  // A custom board is only valid if it actually has the right hex count and
  // every land hex has a number token — otherwise silently fall back to the
  // standard hexagon rather than letting a malformed board reach createBoard.
  let customBoard = null;
  if (mapType === "custom" && s.customBoard && Array.isArray(s.customBoard.hexes)) {
    const hexes = s.customBoard.hexes;
    const expectedCount = MAP_TYPES.custom.hexCount;
    const desertCount = hexes.filter((h) => h.terrain === "desert").length;
    const valid =
        hexes.length === expectedCount &&
        desertCount === 1 &&
        hexes.every(
            (h) =>
                Object.keys(TERRAIN_RESOURCE_MAP).includes(h.terrain) &&
                (h.terrain === "desert" ? h.number === null : Number.isInteger(h.number)),
        );
    if (valid) customBoard = { hexes };
  }

  const requestedVp = VICTORY_POINTS_OPTIONS.includes(s.victoryPointsTarget)
      ? s.victoryPointsTarget
      : GAME_SETTINGS_DEFAULTS.victoryPointsTarget;

  const requestedTimer =
      Number.isFinite(s.turnTimerSeconds) && s.turnTimerSeconds >= 5
          ? Math.floor(s.turnTimerSeconds)
          : GAME_SETTINGS_DEFAULTS.turnTimerSeconds;

  return {
    gameMode,
    victoryPointsTarget: forced.victoryPointsTarget ?? requestedVp,
    diceMode: Object.keys(DICE_MODES).includes(s.diceMode)
        ? s.diceMode
        : GAME_SETTINGS_DEFAULTS.diceMode,
    mapType: mapType === "custom" && !customBoard ? GAME_SETTINGS_DEFAULTS.mapType : mapType,
    customBoard,
    // Per-turn action timer cap enforced by every client (null = use the
    // player's own local Settings value).
    turnTimerSeconds: forced.turnTimerSeconds ?? requestedTimer,
    seasonsEnabled:
        typeof s.seasonsEnabled === "boolean"
            ? s.seasonsEnabled
            : GAME_SETTINGS_DEFAULTS.seasonsEnabled,
    robberPayToClear:
        typeof s.robberPayToClear === "boolean"
            ? s.robberPayToClear
            : GAME_SETTINGS_DEFAULTS.robberPayToClear,
    resortEnabled:
        typeof s.resortEnabled === "boolean"
            ? s.resortEnabled
            : GAME_SETTINGS_DEFAULTS.resortEnabled,
  };
}

export const DEV_CARD_DECK_COMPOSITION = {
  knight: 14,
  monopoly: 2,
  roadBuilding: 2,
  yearOfPlenty: 2,
  victoryPoint: 5,
};

export const DEV_CARD_COST = { ore: 1, grain: 1, wool: 1 };

export const VP_CARD_NAMES = [
  "Chapel",
  "Great Hall",
  "Library",
  "Market",
  "University",
];