import { Server } from "boardgame.io/dist/cjs/server.js";
import { CatanGame } from "../game/CatanGame.js";

const server = Server({
  games: [CatanGame],
  origins: ["http://localhost:5173"],
});

server.run(8000);

console.log("Backend running on http://localhost:8000");
