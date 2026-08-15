import { createBoard } from "../board.js";
import { createPlayer } from "../players.js";

export function makeG(numPlayers = 2, overrides = {}) {
  const players = {};
  for (let i = 0; i < numPlayers; i++) {
    players[String(i)] = createPlayer();
  }
  return {
    players,
    board: createBoard("standard"),
    settings: {},
    chatMessages: [],
    turnCount: 0,
    devCardDeck: [],
    devCardPlayedThisTurn: false,
    season: "Spring",
    longestRoadHolder: null,
    largestArmyHolder: null,
    activeOffer: null,
    ...overrides,
  };
}

export function ctxFor(currentPlayer, extra = {}) {
  return { currentPlayer: String(currentPlayer), phase: "main", ...extra };
}

export function fakeRandom({ d6Sequence = [], shufflePicksFirst = true } = {}) {
  let d6Calls = 0;
  return {
    D6: () => {
      const v = d6Sequence[d6Calls % d6Sequence.length] ?? 1;
      d6Calls++;
      return v;
    },
    Die: (sides) => 1,
    Shuffle: (arr) => (shufflePicksFirst ? [...arr] : [...arr].reverse()),
  };
}

export function fakeEvents() {
  const calls = [];
  return {
    calls,
    setStage: (s) => calls.push(["setStage", s]),
    setActivePlayers: (v) => calls.push(["setActivePlayers", v]),
    endTurn: () => calls.push(["endTurn"]),
  };
}

export function grant(player, resources) {
  Object.entries(resources).forEach(([res, amt]) => {
    player.resources[res] = (player.resources[res] || 0) + amt;
  });
}

export function edgeTouching(board, intersectionId) {
  return board.intersections[intersectionId].adjacentEdges[0];
}

export function firstFreeIntersectionId(board) {
  return Object.keys(board.intersections)[0];
}
