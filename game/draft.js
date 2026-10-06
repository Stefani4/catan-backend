import { DRAFT_BUNDLES, DRAFT_CONFIG } from "./constants.js";

// ---------------------------------------------------------------------------
// Draft Catan — pure helpers.
//
// The draft is a pack-passing draft like a Magic booster draft:
//   * one pack per player, `packSize` cards each (hex claims + resource bundles)
//   * every round all players pick ONE card from the pack in front of them
//     simultaneously, then packs rotate one seat
//   * after `picksPerPlayer` rounds the draft is complete
//
// Nothing in here touches boardgame.io, so it is trivial to unit-test and the
// bots / UI can share the exact same pack-lookup logic as the rules engine.
// ---------------------------------------------------------------------------

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function bundleCardsTotal(resources) {
  return Object.values(resources).reduce((a, b) => a + b, 0);
}

/**
 * Deals the packs. `board` is only read (never mutated); hex cards reference
 * hexes by id so a claim can later be looked up on the live board.
 */
export function createDraft(board, playerIds, rng = Math.random) {
  const order = [...playerIds].map(String);
  const n = order.length;
  const { picksPerPlayer, packSize, maxHexCardsPerPack } = DRAFT_CONFIG;

  const claimable = board.hexes.filter((h) => h.terrain !== "desert" && h.number != null);

  // Never deal more distinct hex cards than the board can supply.
  const hexPerPack = Math.max(
      0,
      Math.min(maxHexCardsPerPack, Math.floor(claimable.length / n), packSize - 1),
  );
  const hexPool = shuffled(claimable, rng);

  const commons = DRAFT_BUNDLES.filter((b) => b.rarity === "common");
  const rares = DRAFT_BUNDLES.filter((b) => b.rarity === "rare");

  const packs = order.map((_, packIdx) => {
    const cards = [];

    for (let i = 0; i < hexPerPack; i++) {
      const hex = hexPool.pop();
      cards.push({
        id: `hex_${hex.id}`,
        kind: "hex",
        hexId: hex.id,
        terrain: hex.terrain,
        resource: hex.resource,
        number: hex.number,
      });
    }

    // Resource cards fill the rest of the pack: exactly one rare, the rest common.
    const bundleSlots = packSize - hexPerPack;
    const picked = [];
    if (bundleSlots > 0) picked.push(shuffled(rares, rng)[0]);
    picked.push(...shuffled(commons, rng).slice(0, Math.max(0, bundleSlots - 1)));
    picked.forEach((bundle, i) => {
      cards.push({
        id: `res_${packIdx}_${i}_${bundle.id}`,
        kind: "resources",
        bundleId: bundle.id,
        rarity: bundle.rarity,
        resources: { ...bundle.resources },
      });
    });

    return { id: packIdx, cards: shuffled(cards, rng) };
  });

  const picks = {};
  const pickedThisRound = {};
  order.forEach((pid) => {
    picks[pid] = [];
    pickedThisRound[pid] = false;
  });

  return {
    order,
    packs,
    picks,
    pickedThisRound,
    claims: {}, // hexId -> playerId
    round: 0,
    rounds: picksPerPlayer,
    complete: false,
    resourcesGranted: false,
  };
}

/** Which pack is in front of `playerId` this round (packs rotate one seat per round). */
export function getPackIndex(draft, playerId) {
  const seat = draft.order.indexOf(String(playerId));
  if (seat === -1) return -1;
  return (seat + draft.round) % draft.order.length;
}

export function getCurrentPack(draft, playerId) {
  if (!draft || draft.complete) return null;
  const idx = getPackIndex(draft, playerId);
  return idx === -1 ? null : draft.packs[idx] || null;
}

export function hasPickedThisRound(draft, playerId) {
  return Boolean(draft?.pickedThisRound?.[String(playerId)]);
}

/** Applies one pick. Returns an error string, or null on success. Mutates `draft`. */
export function applyDraftPick(draft, playerId, cardId) {
  const pid = String(playerId);
  if (!draft || draft.complete) return "draft_not_active";
  if (!draft.order.includes(pid)) return "not_a_drafter";
  if (draft.pickedThisRound[pid]) return "already_picked";

  const pack = getCurrentPack(draft, pid);
  if (!pack) return "no_pack";
  const idx = pack.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return "card_not_in_pack";

  const [card] = pack.cards.splice(idx, 1);
  draft.picks[pid].push(card);
  if (card.kind === "hex") draft.claims[card.hexId] = pid;
  draft.pickedThisRound[pid] = true;

  // Everyone has picked: rotate the packs and open the next round.
  if (draft.order.every((p) => draft.pickedThisRound[p])) {
    draft.round += 1;
    draft.order.forEach((p) => {
      draft.pickedThisRound[p] = false;
    });
    if (draft.round >= draft.rounds) draft.complete = true;
  }
  return null;
}

/**
 * Heuristic card value shared by the bots and by the idle-player auto-pick, so
 * "auto-pick" always means "a sensible pick" rather than a random one.
 */
const PIP_VALUE = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export function scoreDraftCard(card) {
  if (card.kind === "hex") return (PIP_VALUE[card.number] || 0) * 1.1;
  const total = bundleCardsTotal(card.resources);
  return total + (card.rarity === "rare" ? 1.5 : 0);
}

export function bestDraftCard(pack) {
  if (!pack || !pack.cards.length) return null;
  return [...pack.cards].sort((a, b) => scoreDraftCard(b) - scoreDraftCard(a))[0];
}

/**
 * What a given viewer is allowed to see. Packs other than the one in front of
 * the viewer are hidden (only their size is kept) — otherwise the draft would
 * be trivially readable from the network tab. Picks and claims stay public.
 */
export function maskDraftForPlayer(draft, playerId) {
  if (!draft) return draft;
  const mine = playerId === undefined || playerId === null ? -1 : getPackIndex(draft, playerId);
  return {
    ...draft,
    packs: draft.packs.map((pack, i) =>
        i === mine || draft.complete
            ? pack
            : { id: pack.id, cards: [], hidden: true, size: pack.cards.length },
    ),
  };
}
