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

// --- Advanced Rules (configurable per match) ------------------------------
//
// Chosen by the host before creating a lobby (see src/GameSetupModal.jsx),
// sent to the boardgame.io server as `setupData` on match creation, and
// read back out of G.settings by game logic (see game/setup.js, moves.js,
// CatanGame.js) so every rule can be toggled without editing code.

export const VICTORY_POINTS_OPTIONS = [10, 15, 20];

export const MAP_TYPES = {
  standard: { label: "Standard", hexRadius: 2, hexCount: 19 },
  large: { label: "Large", hexRadius: 3, hexCount: 37 },
};

export const DICE_MODES = {
  standard: { label: "Two Dice (standard)" },
  wheel: { label: "Spinning Wheel" },
};

export const GAME_SETTINGS_DEFAULTS = {
  victoryPointsTarget: VICTORY_POINTS_TO_WIN,
  diceMode: "standard", // "standard" | "wheel" — see DICE_MODES
  mapType: "standard", // "standard" | "large" — see MAP_TYPES
  seasonsEnabled: true, // doc's advanced rule #1
  robberPayToClear: true, // doc's advanced rule #2
  resortEnabled: true, // doc's advanced rule #5
};

// Merges a (possibly partial/untrusted) setupData object from a client with
// the defaults, dropping anything that isn't a recognized option so a
// malformed or malicious payload can't inject arbitrary G.settings values.
export function normalizeGameSettings(setupData) {
  const s = setupData || {};
  return {
    victoryPointsTarget: VICTORY_POINTS_OPTIONS.includes(s.victoryPointsTarget)
        ? s.victoryPointsTarget
        : GAME_SETTINGS_DEFAULTS.victoryPointsTarget,
    diceMode: Object.keys(DICE_MODES).includes(s.diceMode)
        ? s.diceMode
        : GAME_SETTINGS_DEFAULTS.diceMode,
    mapType: Object.keys(MAP_TYPES).includes(s.mapType)
        ? s.mapType
        : GAME_SETTINGS_DEFAULTS.mapType,
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

// Development cards: 14 knight + 6 progress (2 each of monopoly/roadBuilding/
// yearOfPlenty) + 5 victoryPoint = 25 total, matching the physical deck.
export const DEV_CARD_DECK_COMPOSITION = {
  knight: 14,
  monopoly: 2,
  roadBuilding: 2,
  yearOfPlenty: 2,
  victoryPoint: 5,
};

export const DEV_CARD_COST = { ore: 1, grain: 1, wool: 1 };

// Flavor names for the 5 (functionally identical) victory point cards.
export const VP_CARD_NAMES = [
  "Chapel",
  "Great Hall",
  "Library",
  "Market",
  "University",
];
