import { RESOURCES } from "./constants.js";

export const createPlayer = () => ({
  resources: RESOURCES.reduce((acc, r) => {
    acc[r] = 0;
    return acc;
  }, {}),

  roads: [],
  settlements: [],
  cities: [],
  resorts: [],

  developmentCards: [],
  knightsPlayed: 0,

  victoryPoints: 0,

  hasLongestRoad: false,
  hasLargestArmy: false,
});
