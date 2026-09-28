# Sakura Date Night

Minecraft Bedrock add-on: custom dimension `sakura:date_night` + **Enchanted Echo Shard** (off-hand OK).

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
- Script builds scene once with `Block.setType` after `tickingarea` is set
- Built flag: world dynamic property `sakura:date_night_built_v4`
- Chat: `!date` `!shard` `!rebuild`

## Pack layout

```
behavior_pack/   → Sakura Date Night BP
resource_pack/   → Sakura Date Night RP
```

Zip both folders into a `.mcaddon` (or import as separate packs).

**Required:** Beta APIs experiment on. Prefer a **new world**.

## Known issue from prior attempts

First Smith build produced a **purple wool** blob tree — owner confirmed that version *did* load the dimension and place blocks. Subsequent redesigns (new UUIDs, overworld fallback, fill commands) regressed to empty void. **Do not change the dimension/shard/startup flow.** Only adjust the tree materials/shape in `buildTrunk` / `buildCanopy` / `buildPicnic`.

## Reference repos

- `Z480-fly/sakura-underworld-dimension` — working dimension + shard + startup registration
- `Z480-fly/unstable-underworld-bedrock` — terrain generator (not required for this pack)

## Owner note for Freebuff

Make the tree look good (cherry trunk, red leaves/glass, picnic clearly on top, huge). Everything else in the scene is fine. Dimension access via the echo shard must keep working like the first successful test.
