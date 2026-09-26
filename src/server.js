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

const lobbyChats = new Map();
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

const rematches = new Map();

const rematchRouter = new Router();

rematchRouter.get("/games/catan/:matchID/rematch", (ctx) => {
  const { matchID } = ctx.params;
  ctx.body = rematches.get(matchID) || null;
});

rematchRouter.post("/games/catan/:matchID/rematch", koaBody(), (ctx) => {
  const { matchID } = ctx.params;
  const { newMatchID, proposedBy } = ctx.request.body || {};

  if (!newMatchID || !String(newMatchID).trim()) {
    ctx.status = 400;
    ctx.body = { error: "newMatchID is required" };
    return;
  }

  if (!rematches.has(matchID)) {
    rematches.set(matchID, {
      newMatchID: String(newMatchID),
      proposedBy: proposedBy !== undefined ? String(proposedBy) : null,
      ts: Date.now(),
    });
  }

  ctx.body = rematches.get(matchID);
});

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

server.app.use(rematchRouter.routes());
server.app.use(rematchRouter.allowedMethods());

server.run(PORT);

console.log(`Backend running on port ${PORT}`);
console.log(`Allowed origins: ${origins.join(", ")}`);