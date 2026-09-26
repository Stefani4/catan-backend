import { createPlayer } from "./players.js";
import { createBoard } from "./board.js";
import {
  DEV_CARD_DECK_COMPOSITION,
  VP_CARD_NAMES,
  normalizeGameSettings,
} from "./constants.js";

function buildDevCardDeck() {
  const deck = [];
  let vpIndex = 0;
  Object.entries(DEV_CARD_DECK_COMPOSITION).forEach(([type, count]) => {
    for (let i = 0; i < count; i++) {
      const card = { type };
      if (type === "victoryPoint") {
        card.name = VP_CARD_NAMES[vpIndex % VP_CARD_NAMES.length];
        vpIndex++;
      }
      deck.push(card);
    }
  });
  return deck;
}

export const setup = ({ ctx }, setupData) => {
  const players = {};
  const settings = normalizeGameSettings(setupData);

  const diceRolls = {};
  for (let n = 2; n <= 12; n++) diceRolls[n] = 0;

  const resourcesCollected = {};
  const bankTrades = {};
  const playerTrades = {};
  const cardsBought = {};
  const cardsPlayed = {};
  const robberMoves = {};

  for (let i = 0; i < ctx.numPlayers; i++) {
    players[i.toString()] = createPlayer();
    resourcesCollected[i.toString()] = { lumber: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
    bankTrades[i.toString()] = 0;
    playerTrades[i.toString()] = 0;
    cardsBought[i.toString()] = 0;
    cardsPlayed[i.toString()] = 0;
    robberMoves[i.toString()] = 0;
  }

  return {
    players,
    settings,
    board: createBoard(settings.mapType, settings.customBoard),
    diceValue: null,
    diceRolled: false,
    turnCount: 0,
    season: "Spring",
    longestRoadHolder: null,
    largestArmyHolder: null,
    activeOffer: null,
    chatMessages: [],
    reactions: [],
    devCardDeck: buildDevCardDeck(),
    devCardPlayedThisTurn: false,
    stats: {
      diceRolls,
      resourcesCollected,
      bankTrades,
      playerTrades,
      cardsBought,
      cardsPlayed,
      robberMoves,
    },
  };
};