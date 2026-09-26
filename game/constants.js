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
  custom: { label: "Custom", shape: "hexagon", hexRadius: 2, hexCount: 19 },
};

export const DICE_MODES = {
  standard: { label: "Two Dice (standard)" },
  wheel: { label: "Spinning Wheel" },
};

export const GAME_SETTINGS_DEFAULTS = {
  victoryPointsTarget: VICTORY_POINTS_TO_WIN,
  diceMode: "standard",
  mapType: "standard",
  seasonsEnabled: true,
  robberPayToClear: true,
  resortEnabled: true,
};

export function normalizeGameSettings(setupData) {
  const s = setupData || {};
  const mapType = Object.keys(MAP_TYPES).includes(s.mapType)
      ? s.mapType
      : GAME_SETTINGS_DEFAULTS.mapType;

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

  return {
    victoryPointsTarget: VICTORY_POINTS_OPTIONS.includes(s.victoryPointsTarget)
        ? s.victoryPointsTarget
        : GAME_SETTINGS_DEFAULTS.victoryPointsTarget,
    diceMode: Object.keys(DICE_MODES).includes(s.diceMode)
        ? s.diceMode
        : GAME_SETTINGS_DEFAULTS.diceMode,
    mapType: mapType === "custom" && !customBoard ? GAME_SETTINGS_DEFAULTS.mapType : mapType,
    customBoard,
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