# Sakura Date Night

Minecraft Bedrock add-on: custom dimension `sakura:date_night` + **Enchanted Echo Shard** (off-hand OK).

## Agent: Packwright Smith

**Whoever works this repo (including Freebuff) operates as Packwright Smith.**

Persona source: [`Z480-fly/bedrock-Ai` → `packwright/PACKWRIGHT_SMITH.md`](https://github.com/Z480-fly/bedrock-Ai/blob/main/packwright/PACKWRIGHT_SMITH.md)

- Senior Bedrock engineer: behavior packs, resource packs, custom dimensions, Script API
- Precise, practical, direct. No fluff.
- Extend working architecture. Do not rewrite what already worked.
- Preserve namespaces, UUIDs, and pack structure unless there is a clear reason to change them.

## What the owner wants

Romantic date-night scene:

1. **Custom void dimension** `sakura:date_night` (same pattern as `sakura-underworld-dimension`)
2. **Enchanted Echo Shard** — use to enter / leave (saves return location)
3. **Huge tree** in the middle:
   - **Cherry log trunk** (thick, with roots)
   - **Red canopy** — nether wart block leaves + red/pink stained glass
   - **Red glass strands** hanging under the canopy
   - **Picnic platform ON TOP of the tree** (quartz deck, pink checkered carpet, cake, lanterns, fence)
   - Stairs spiral up the trunk to the picnic
4. Ground: grass island, pink path ring, **I heart YOU** in black/red concrete
5. Small cherry trees with lanterns around the island
6. Pond + cherry bridge south of the tree

## Architecture (copy from working underworld pack)

- Dimension JSON + `system.beforeEvents.startup` → `dimensionRegistry.registerCustomDimension`
- Shard item: `sakura:enchanted_echo_shard` (glint, off-hand, stack 1)
- Script builds the scene once with `Block.setType`, from a task queue, after the
  whole island is force-loaded
- Built flag: world dynamic property `sakura:date_night_built_v5`
- Chat: `!date` `!shard` `!rebuild`

## Pack layout

```
behavior_pack/   → Sakura Date Night BP
resource_pack/   → Sakura Date Night RP
```

Build the importable add-on (both packs, manifests at pack top level):

```sh
sh ./build-mcaddon.sh      # → dist/sakura-date-night.mcaddon
```

**Required:** Beta APIs experiment on. Prefer a **new world**.

## Scene layout (ground surface y=65)

| y | what |
|---|---|
| 64 | grass island r=52 with a sand rim, pink path ring r=14, walkway to the letters |
| 65 | `I <heart> YOU` in black/red concrete, south of the tree |
| 64 | pond + cherry plank bridge with lantern posts, west of the tree |
| 64–100 | cherry trunk, r=6 → r=3, ten buttress roots on the surface |
| 65–105 | spiral staircase, r=11 → r=10.4, 0.092 rad per step (≈1 block spacing, ~215°), fence posts + lanterns on the outside |
| 100–106 | picnic deck: log pillar, smooth quartz r=9, pink/white checkered carpet, cake, chests, poppies, lantern posts, cherry fence rail with a gap at the landing |
| 94–124 | eight branches sweeping out of the trunk and up into the crown |
| 112–133 | red crown: nether wart mass with red/pink stained glass, ragged blossom edge, 10-wide open rotunda straight down onto the picnic, shroomlights inside, blossom strands + hanging lanterns below |

The player is dropped on the deck south of the cake. Stairs lead down to the
path ring, the path leads south to the letters, the bridge crosses the pond.

## Known issue from prior attempts

First Smith build produced a **purple wool** blob tree — owner confirmed that version *did* load the dimension and place blocks. Subsequent redesigns (new UUIDs, overworld fallback, fill commands) regressed to empty void. **Do not change the dimension/shard/startup flow.** Only adjust the tree materials/shape in `buildTrunk` / `buildCanopy` / `buildPicnic`.

### Why v4 was empty void

Two bugs, both in the build step, not in the dimension/shard/startup flow:

1. `buildScene()` set ~100k blocks inside a single tick, so the client stalled
   and most writes were dropped. v5 queues the build as small tasks and spends a
   fixed op budget per tick (`OPS_PER_TICK`, ~21 ticks for the whole scene).
2. The ticking area was `circle 0 64 0 6`, so nearly all of the island was in
   unloaded chunks where `getBlock()` returns undefined and `setType` does
   nothing. v5 loads radius 60 and keeps the area alive.

Keep both of those in mind before changing the build again.

## Reference repos

- `Z480-fly/sakura-underworld-dimension` — working dimension + shard + startup registration
- `Z480-fly/unstable-underworld-bedrock` — terrain generator (not required for this pack)
- `Z480-fly/bedrock-Ai` — Packwright Smith persona

## Task for Smith (Freebuff)

Make the tree look good: cherry trunk, red leaves/glass, picnic clearly on top, huge. Keep the echo-shard dimension path working exactly like the first successful test. Ship a working `.mcaddon` the owner can import and use on a new world with Beta APIs.

**Status (v5, pack version 1.4.1):** done. Dimension id, shard item, startup
registration, return-location save and chat commands are untouched. The scene is
rebuilt as a treehouse: picnic deck carried by the trunk, red parasol crown with
an open rotunda above the picnic, walkable spiral stairs, `I <heart> YOU`, pond
and bridge, cherry grove.

`scripts/main.js` was verified off-game by replaying the whole build against a
stub dimension: ~53k blocks in 21 ticks, and a walk simulation confirms a player
can go ground → path → spiral stairs → deck → cake.
