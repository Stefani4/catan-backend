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

  for (let i = 0; i < ctx.numPlayers; i++) {
    players[i.toString()] = createPlayer();
  }

  return {
    players,
    settings,
    board: createBoard(settings.mapType),
    diceValue: null,
    diceRolled: false,
    turnCount: 0,
    season: "Spring",
    longestRoadHolder: null,
    largestArmyHolder: null,
    activeOffer: null,
    chatMessages: [],
    devCardDeck: buildDevCardDeck(),
    devCardPlayedThisTurn: false,
  };
};
