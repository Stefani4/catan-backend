import { Server } from "boardgame.io/dist/cjs/server.js";
import Router from "@koa/router";
import { koaBody } from "koa-body";
import { CatanGame } from "../game/CatanGame.js";

const PORT = process.env.PORT || 8000;

const origins = process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];

const server = Server({
  games: [CatanGame],
  origins,
});

// --- Lobby chat -----------------------------------------------------------
// Separate from in-game chat (which boardgame.io syncs automatically via
// G.chatMessages + moves.sendChat). Before a match starts there's no
// boardgame.io game state to piggyback on, so lobby chat gets its own
// small REST endpoint that every client polls — same pattern already used
// for polling the player list.
const lobbyChats = new Map(); // matchID -> [{ id, name, text, ts }]
const MAX_LOBBY_MESSAGES = 200;

const chatRouter = new Router();

chatRouter.get("/games/catan/:matchID/chat", (ctx) => {
  const { matchID } = ctx.params;
  ctx.body = lobbyChats.get(matchID) || [];
});

chatRouter.post("/games/catan/:matchID/chat", koaBody(), (ctx) => {
  const { matchID } = ctx.params;
  const { name, text } = ctx.request.body || {};

  if (!text || !String(text).trim()) {
    ctx.status = 400;
    ctx.body = { error: "text is required" };
    return;
  }

  const messages = lobbyChats.get(matchID) || [];
  messages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name ? String(name).slice(0, 40) : "Player",
    text: String(text).slice(0, 240),
    ts: Date.now(),
  });
  if (messages.length > MAX_LOBBY_MESSAGES) messages.shift();
  lobbyChats.set(matchID, messages);

  ctx.body = { ok: true };
});

// boardgame.io's Server() only sets up CORS for its own built-in routes,
// so custom routes need their own CORS handling for the same origins.
server.app.use(async (ctx, next) => {
  const origin = ctx.get("Origin");
  if (origins.includes(origin)) {
    ctx.set("Access-Control-Allow-Origin", origin);
    ctx.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    ctx.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (ctx.method === "OPTIONS") {
    ctx.status = 204;
    return;
  }
  await next();
});

server.app.use(chatRouter.routes());
server.app.use(chatRouter.allowedMethods());

server.run(PORT);

console.log(`Backend running on port ${PORT}`);
console.log(`Allowed origins: ${origins.join(", ")}`);