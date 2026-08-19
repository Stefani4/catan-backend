import { Server } from "boardgame.io/dist/cjs/server.js";
import { CatanGame } from "../game/CatanGame.js";

const PORT = process.env.PORT || 8000;

const origins = process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];

const server = Server({
  games: [CatanGame],
  origins,
});

server.run(PORT);

console.log(`Backend running on port ${PORT}`);
console.log(`Allowed origins: ${origins.join(", ")}`);