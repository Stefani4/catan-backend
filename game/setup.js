import { createPlayer } from "./players.js";
import { createBoard } from "./board.js";

export const setup = ({ ctx }) => {
  const players = {};

  for (let i = 0; i < ctx.numPlayers; i++) {
    players[i.toString()] = createPlayer();
  }

  return {
    players,
    board: createBoard(),
    diceValue: null,
    diceRolled: false,
    turnCount: 0,
    season: "Spring",
    longestRoadHolder: null,
    largestArmyHolder: null,
    activeOffer: null,
  };
};
