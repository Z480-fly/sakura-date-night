/**
 * Sakura Date Night — Packwright Smith build v6
 *
 * The architecture of the first build that PROVED the dimension, the shard and
 * the startup registration work is untouched:
 *   - dimension id sakura:date_night, void generator, registered in
 *     system.beforeEvents.startup
 *   - item sakura:enchanted_echo_shard, off-hand usable, returns you home
 *   - chat commands !date / !shard / !rebuild
 *   - script builds the scene once, then a world flag stops it rebuilding
 *
 * v5 changes ONLY the scene, plus the two things that were actually breaking it:
 *   1. v4 tried to set ~100k blocks inside a single tick, so the client stalled
 *      and most writes never landed. v5 queues the build as small tasks and
 *      spends a fixed op budget per tick.
 *   2. v4 loaded a 6 block ticking area, so most of the island was in unloaded
 *      chunks and getBlock() returned undefined. v5 loads the whole island for
 *      the build and keeps it loaded.
 *
 * v6 keeps every one of those and, on the owner's request, extends the scene
 * in two ways only:
 *   1. the surrounding sky IS a canopy. A ragged blossom dome built from the
 *      two glass colours the tree already uses — red + pink stained glass and
 *      nothing else — wraps the whole scene. Standing on the picnic you look
 *      out (or up through the rotunda) at the canopy, and looking down past
 *      its rim the island, the lawn and the words are all still there.
 *   2. the I <heart> YOU area is now a real lawn: grass, grass tufts, pink
 *      petals, flowers and a ring of small cherry trees framing the words.
 *
 * Scene layout (ground surface y=65):
 *   y 64      grass island, sand rim, pink path ring, pond + cherry bridge
 *   y 65      "I <heart> YOU" in concrete, south of the tree
 *   y 64-100  cherry trunk with buttress roots
 *   y 65-105  walkable spiral staircase (1 block spacing, ~215 degrees)
 *   y 100-106 picnic deck: log pillar, smooth quartz, pink/white checkered
 *            carpet, cake, chests, lantern posts, cherry fence railing
 *   y 94-124  eight branches sweeping out of the trunk to carry the crown
 *   y 112-136 red crown: nether wart mass, red/pink stained glass, ragged
 *            blossom edge, a 10 wide open rotunda straight down onto the
 *            picnic, shroomlights inside, blossom strands below
 *   y 72-144 blossom canopy: the "sky". An ellipsoid shell of only red and
 *            pink stained glass, r 58, springing from just outside the island
 *            rim and closing at y 144 above the crown, with ~190 blossom
 *            strands hanging from its underside. Its rim hangs open at y 72
 *            so the horizon below the canopy stays visible.
 *   y 64-73  the letters lawn: grass, short/tall grass, pink petals, flowers,
 *            and a ring of small cherry trees framing I <heart> YOU
 */

import { ItemStack, Player, system, world } from "@minecraft/server";

const DIMENSION_ID = "sakura:date_night";
const SHARD_ID = "sakura:enchanted_echo_shard";
const RETURN_KEY = "sakura:return_location";
const BUILT_KEY = "sakura:date_night_built_v6";
const ARRIVAL_WAIT = 40;
const COOLDOWN = 20;
const LOAD_RADIUS = 60;
const OPS_PER_TICK = 3000;

const OX = 0;
const OY = 64; // grass block layer
const OZ = 0;

const ISLAND_R = 52;
const PATH_R = 14;
const TRUNK_TOP = 100;

const DECK_Y = 106; // quartz walking surface
const DECK_R = 9;

const CROWN_BASE = 112;
const CROWN_LAYERS = [
  [0, 12], [1, 15], [2, 17], [3, 18], [4, 19], [5, 19], [6, 19], [7, 18],
  [8, 18], [9, 17], [10, 16], [11, 15], [12, 14], [13, 13], [14, 12], [15, 11],
  [16, 10], [17, 9], [18, 8], [19, 7], [20, 6], [21, 5], [22, 4], [23, 3],
  [24, 2],
];

// The surrounding "sky" is a canopy. Same two glass colours as the tree, no
// other block at all, so the dome reads as one blossom. DOME_R sits just past
// ISLAND_R (52) and DOME_H lifts the zenith to y 144, above the crown (136).
const DOME_R = 58;
const DOME_H = 80;
const DOME_FLOOR = OY + 8; // rim hangs open so the horizon stays visible

const STAIR_Y0 = 65;
const STAIR_Y1 = 105;
const STAIR_A0 = Math.PI / 2;
const STAIR_STEP = 0.092;
const STAIR_R0 = 11;
const STAIR_R1 = 10.4;

const lastUse = new Map();
/** @type {import("@minecraft/server").Dimension | undefined} */
let dim;
let building = false;
let queue = [];
let queueIndex = 0;

function stairT(y) {
  return (y - STAIR_Y0) / (STAIR_Y1 - STAIR_Y0);
}
function stairAngle(y) {
  return STAIR_A0 + STAIR_STEP * (y - STAIR_Y0);
}
function stairRadius(y) {
  return STAIR_R0 + (STAIR_R1 - STAIR_R0) * stairT(y);
}

const LANDING_ANGLE = stairAngle(STAIR_Y1);
const LANDING_X = OX + Math.round(Math.cos(LANDING_ANGLE) * (STAIR_R1 - 1));
const LANDING_Z = OZ + Math.round(Math.sin(LANDING_ANGLE) * (STAIR_R1 - 1));

// ---------------------------------------------------------------- block utils

function set(d, x, y, z, b) {
  try {
    const block = d.getBlock({ x, y, z });
    if (block) block.setType(b);
  } catch (_) {
    /* unloaded chunk or out of world */
  }
}

function disk(d, cx, cy, cz, r, b) {
  const r2 = r * r;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz <= r2) set(d, cx + dx, cy, cz + dz, b);
    }
  }
}

function sphere(d, cx, cy, cz, r, b) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy + dz * dz <= r2) set(d, cx + dx, cy + dy, cz + dz, b);
      }
    }
  }
}

function hash(x, y, z) {
  const h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  return (h >>> 0) % 100;
}

function ring(d, cx, cy, cz, r, b, gap) {
  const steps = Math.max(48, Math.round(r * 6));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    if (gap && Math.abs(angleDelta(a, gap)) < 0.35) continue;
    set(d, cx + Math.round(Math.cos(a) * r), cy, cz + Math.round(Math.sin(a) * r), b);
  }
}

function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ------------------------------------------------------------- task queue

function task(cost, fn) {
  queue.push({ cost, fn });
}

function pump() {
  if (!building) return;
  let spent = 0;
  while (queueIndex < queue.length && spent < OPS_PER_TICK) {
    const t = queue[queueIndex++];
    t.fn();
    spent += t.cost;
  }
  if (queueIndex < queue.length) return;
  building = false;
  queue = [];
  queueIndex = 0;
  world.setDynamicProperty(BUILT_KEY, true);
  console.warn("[DateNight] scene built");
}

system.runInterval(pump, 1);

// ------------------------------------------------------------------ the scene

function buildIsland(d) {
  const r2 = ISLAND_R * ISLAND_R;
  const rim = (ISLAND_R - 4) * (ISLAND_R - 4);
  for (let dz = -ISLAND_R; dz <= ISLAND_R; dz++) {
    task(160, () => {
      for (let dx = -ISLAND_R; dx <= ISLAND_R; dx++) {
        const dist = dx * dx + dz * dz;
        if (dist > r2) continue;
        const x = OX + dx;
        const z = OZ + dz;
        set(d, x, OY - 3, z, "minecraft:dirt");
        set(d, x, OY - 2, z, "minecraft:dirt");
        set(d, x, OY - 1, z, "minecraft:dirt");
        set(d, x, OY, z, dist > rim ? "minecraft:sand" : "minecraft:grass_block");
      }
    });
  }
  // pink path ring + walkway out to the letters
  task(320, () => {
    ring(d, OX, OY + 1, OZ, PATH_R, "minecraft:pink_concrete");
    for (let z = PATH_R; z <= 25; z++) {
      set(d, OX - 1, OY + 1, OZ + z, "minecraft:pink_concrete");
      set(d, OX, OY + 1, OZ + z, "minecraft:pink_concrete");
      set(d, OX + 1, OY + 1, OZ + z, "minecraft:pink_concrete");
    }
  });
  // lantern posts along the walkway
  task(40, () => {
    for (let z = 18; z <= 25; z += 7) {
      set(d, OX - 3, OY + 1, OZ + z, "minecraft:cherry_fence");
      set(d, OX - 3, OY + 2, OZ + z, "minecraft:lantern");
      set(d, OX + 3, OY + 1, OZ + z, "minecraft:cherry_fence");
      set(d, OX + 3, OY + 2, OZ + z, "minecraft:lantern");
    }
  });
}

function buildTrunk(d) {
  for (let y = OY; y <= TRUNK_TOP; y++) {
    const t = (y - OY) / (TRUNK_TOP - OY);
    let r = Math.max(3, Math.round(6 - 3 * t));
    if (y <= OY + 3) r += 2; // base flare
    task(90, () => disk(d, OX, y, OZ, r, "minecraft:cherry_log"));
  }
  // buttress roots on the surface
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    task(60, () => {
      for (let s = 5; s <= 12; s++) {
        const px = OX + Math.round(Math.cos(a) * s);
        const pz = OZ + Math.round(Math.sin(a) * s);
        const h = s < 8 ? 3 : 2;
        for (let i2 = 0; i2 < h; i2++) set(d, px, OY + i2, pz, "minecraft:cherry_log");
      }
    });
  }
}

function buildBranches(d) {
  // eight branches leaving the trunk low and steep so they arch over the deck
  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2;
    task(600, () => {
      for (let s = 0; s <= 20; s++) {
        const t = s / 20;
        const r = 3.5 + 12.5 * t;
        const y = Math.round(94 + 30 * t);
        const th = Math.max(1, Math.round(2.4 - 1.6 * t));
        disk(d, OX + Math.round(Math.cos(a) * r), y, OZ + Math.round(Math.sin(a) * r), th, "minecraft:cherry_log");
      }
    });
  }
}

function buildCrown(d) {
  for (const [dy, r] of CROWN_LAYERS) {
    const y = CROWN_BASE + dy;
    const oculus = 5; // 10 wide skylight straight down onto the picnic
    task(1200, () => {
      const r2 = r * r;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = dx * dx + dz * dz;
          if (dist > r2) continue;
          if (dist < oculus * oculus) continue; // open rotunda above the picnic
          const x = OX + dx;
          const z = OZ + dz;
          const h = hash(x, y, z);
          if (r >= 10 && dist > r2 * 0.82 && h > 55) continue; // ragged blossom edge
          if (dist > r2 * 0.45 && h < 14) {
            set(d, x, y, z, "minecraft:pink_stained_glass");
          } else if (dist > r2 * 0.22 && h < 30) {
            set(d, x, y, z, "minecraft:red_stained_glass");
          } else {
            set(d, x, y, z, "minecraft:nether_wart_block");
          }
        }
      }
    });
  }
  // warm lights inside the crown
  task(600, () => {
    for (const [dx, dy, dz, r] of [[11, 5, 0, 3], [-11, 4, 0, 3], [0, 6, 11, 3], [0, 5, -11, 3]]) {
      sphere(d, OX + dx, CROWN_BASE + dy, OZ + dz, r, "minecraft:shroomlight");
    }
  });
  // blossom strands hanging under the parasol
  task(500, () => {
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      const r = 12.5 + (i % 3) * 0.8;
      const len = 4 + (i % 6);
      const x = OX + Math.round(Math.cos(a) * r);
      const z = OZ + Math.round(Math.sin(a) * r);
      for (let h = 0; h <= len; h++) {
        set(d, x, CROWN_BASE - h, z, h % 3 === 0 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass");
      }
    }
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2 + 0.1;
      const r = 17 + (i % 2);
      const len = 3 + (i % 4);
      const x = OX + Math.round(Math.cos(a) * r);
      const z = OZ + Math.round(Math.sin(a) * r);
      for (let h = 1; h <= len; h++) {
        set(d, x, CROWN_BASE + 4 - h, z, h % 4 === 0 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass");
      }
    }
  });
  task(300, () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const x = OX + Math.round(Math.cos(a) * 11.5);
      const z = OZ + Math.round(Math.sin(a) * 11.5);
      set(d, x, CROWN_BASE, z, "minecraft:chain");
      set(d, x, CROWN_BASE - 1, z, "minecraft:chain");
      set(d, x, CROWN_BASE - 2, z, "minecraft:lantern");
    }
  });
}

function buildDeck(d) {
  for (let y = TRUNK_TOP; y <= DECK_Y - 1; y++) {
    task(320, () => disk(d, OX, y, OZ, DECK_R, "minecraft:cherry_log"));
  }
  task(320, () => disk(d, OX, DECK_Y, OZ, DECK_R, "minecraft:smooth_quartz"));
  task(320, () => {
    // keep head room clear over the picnic, branches only cross the outer ring
    for (let dz = -DECK_R; dz <= DECK_R; dz++) {
      for (let dx = -DECK_R; dx <= DECK_R; dx++) {
        if (dx * dx + dz * dz > DECK_R * DECK_R) continue;
        for (let y = DECK_Y + 1; y <= DECK_Y + 3; y++) set(d, OX + dx, y, OZ + dz, "minecraft:air");
      }
    }
  });
  task(200, () => {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        set(d, OX + dx, DECK_Y + 1, OZ + dz, (dx + dz) % 2 === 0 ? "minecraft:pink_carpet" : "minecraft:white_carpet");
      }
    }
    set(d, OX, DECK_Y + 2, OZ, "minecraft:cake");
    set(d, OX + 2, DECK_Y + 1, OZ + 2, "minecraft:chest");
    set(d, OX - 2, DECK_Y + 1, OZ + 2, "minecraft:chest");
    set(d, OX + 2, DECK_Y + 1, OZ - 2, "minecraft:poppy");
    set(d, OX - 2, DECK_Y + 1, OZ - 2, "minecraft:poppy");
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const x = OX + Math.round(Math.cos(a) * 7.5);
      const z = OZ + Math.round(Math.sin(a) * 7.5);
      set(d, x, DECK_Y + 1, z, "minecraft:cherry_log");
      set(d, x, DECK_Y + 2, z, "minecraft:lantern");
    }
  });
  task(200, () => {
    ring(d, OX, DECK_Y + 1, OZ, DECK_R, "minecraft:cherry_fence", LANDING_ANGLE);
    // bridge the top of the stairs onto the deck
    for (let r = Math.round(STAIR_R1) - 1; r >= DECK_R - 1; r--) {
      const x = OX + Math.round(Math.cos(LANDING_ANGLE) * r);
      const z = OZ + Math.round(Math.sin(LANDING_ANGLE) * r);
      set(d, x, DECK_Y, z, "minecraft:cherry_planks");
      set(d, x, DECK_Y + 1, z, "minecraft:air");
    }
  });
  task(60, () => {
    for (let r = DECK_R - 2; r <= DECK_R - 1; r++) {
      set(d, OX + Math.round(Math.cos(LANDING_ANGLE) * r), DECK_Y + 1, OZ + Math.round(Math.sin(LANDING_ANGLE) * r), "minecraft:cherry_fence");
    }
  });
}

function buildStairs(d) {
  for (let y = STAIR_Y0; y <= STAIR_Y1; y++) {
    task(12, () => {
      const a = stairAngle(y);
      const r = stairRadius(y);
      const x = OX + Math.round(Math.cos(a) * r);
      const z = OZ + Math.round(Math.sin(a) * r);
      set(d, x, y, z, "minecraft:cherry_stairs");
      set(d, x, y + 1, z, "minecraft:air");
      set(d, x, y + 2, z, "minecraft:air");
      // outer handrail posts + lanterns
      const px = OX + Math.round(Math.cos(a) * (r + 1.4));
      const pz = OZ + Math.round(Math.sin(a) * (r + 1.4));
      if (y % 4 === 0) set(d, px, y, pz, "minecraft:cherry_fence");
      if (y % 16 === 0) {
        set(d, px, y, pz, "minecraft:lantern");
      }
    });
  }
}

function buildLetters(d) {
  const patterns = {
    I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
    heart: [".#.#.", "#####", "#####", ".###.", "..#.."],
    Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
    O: [" ### ", "#   #", "#   #", "#   #", " ### "],
    U: ["#   #", "#   #", "#   #", "#   #", " ### "],
  };
  const order = [
    ["I", "minecraft:black_concrete"],
    ["heart", "minecraft:red_concrete"],
    ["Y", "minecraft:black_concrete"],
    ["O", "minecraft:black_concrete"],
    ["U", "minecraft:black_concrete"],
  ];
  task(200, () => {
    let x = OX - 16;
    const z = OZ + 27;
    for (const [key, block] of order) {
      const pat = patterns[key];
      for (let row = 0; row < pat.length; row++) {
        for (let col = 0; col < pat[row].length; col++) {
          if (pat[row][col] !== "#") continue;
          set(d, x + col, OY + 1, z + row, block);
        }
      }
      x += pat[0].length + 2;
    }
  });
}

function buildPond(d) {
  const px = OX - 30;
  const pz = OZ + 4;
  const rx = 12;
  const rz = 8;
  for (let dz = -rz - 2; dz <= rz + 2; dz++) {
    task(200, () => {
      for (let dx = -rx - 2; dx <= rx + 2; dx++) {
        const e = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
        if (e > 1.35) continue;
        const x = px + dx;
        const z = pz + dz;
        if (e <= 1) {
          set(d, x, OY, z, "minecraft:water");
          set(d, x, OY - 1, z, "minecraft:water");
          set(d, x, OY - 2, z, "minecraft:gravel");
          if (hash(x, 0, z) < 18) set(d, x, OY + 1, z, "minecraft:lily_pad");
        } else {
          set(d, x, OY, z, "minecraft:coarse_dirt");
        }
      }
    });
  }
  task(220, () => {
    for (let dx = -rx - 3; dx <= rx + 3; dx++) {
      set(d, px + dx, OY + 1, pz, "minecraft:cherry_planks");
      set(d, px + dx, OY + 2, pz - 1, "minecraft:cherry_fence");
      set(d, px + dx, OY + 2, pz + 1, "minecraft:cherry_fence");
    }
    for (const dx of [-rx - 2, 0, rx + 2]) {
      set(d, px + dx, OY + 2, pz - 1, "minecraft:lantern");
      set(d, px + dx, OY + 2, pz + 1, "minecraft:lantern");
    }
  });
}

// one small cherry tree with a lantern: shared by the grove and the lawn ring
function plantCherry(d, x, z) {
  for (let h = 1; h <= 5; h++) set(d, x, OY + h, z, "minecraft:cherry_log");
  sphere(d, x, OY + 6, z, 3, "minecraft:cherry_leaves");
  sphere(d, x + 1, OY + 6, z, 2, "minecraft:cherry_leaves");
  set(d, x + 2, OY + 1, z, "minecraft:cherry_log");
  set(d, x + 2, OY + 2, z, "minecraft:lantern");
}

function buildGrove(d) {
  const spots = [
    [24, 14], [-22, 18], [19, -22], [-24, -14], [30, -6], [-19, 21],
    [19, 34], [-30, 2], [38, 18], [-38, -20],
  ];
  for (const [dx, dz] of spots) {
    task(300, () => plantCherry(d, OX + dx, OZ + dz));
  }
}

// the words get a real lawn under and around them, then a ring of small cherry
// trees frames them. Runs AFTER buildIsland and BEFORE buildLetters, so the
// concrete letters are painted on top of the grass and the tufts.
function buildLettersGarden(d) {
  task(900, () => {
    for (let dz = -4; dz <= 8; dz++) {
      for (let dx = -24; dx <= 24; dx++) {
        const z = OZ + 27 + dz;
        const dzc = z - OZ;
        if (dx * dx + dzc * dzc > (ISLAND_R - 4) * (ISLAND_R - 4)) continue;
        set(d, OX + dx, OY, z, "minecraft:grass_block");
        set(d, OX + dx, OY - 1, z, "minecraft:dirt");
      }
    }
  });
  task(700, () => {
    for (let dz = 26; dz <= 36; dz++) {
      for (let dx = -24; dx <= 24; dx++) {
        const x = OX + dx;
        const z = OZ + dz;
        if (dx * dx + dz * dz > (ISLAND_R - 6) * (ISLAND_R - 6)) continue;
        const h = hash(x, 41, z);
        if (h >= 24) continue; // thin scatter, mostly open lawn
        // mostly plain grass, with flowers dotted through it
        let b = "minecraft:short_grass";
        if (h >= 21) b = "minecraft:tall_grass";
        else if (h >= 18) b = "minecraft:pink_petals";
        else if (h >= 15) b = "minecraft:dandelion";
        else if (h >= 12) b = "minecraft:cornflower";
        else if (h >= 9) b = "minecraft:poppy";
        set(d, x, OY + 1, z, b);
      }
    }
  });
  const ring = [
    [-25, 27], [-21, 34], [-13, 35], [-5, 36], [3, 36], [11, 35],
    [19, 34], [25, 27],
  ];
  for (const [dx, dz] of ring) {
    task(300, () => plantCherry(d, OX + dx, OZ + dz));
  }
}

// ------------------------------------------------------------------- the sky
// The canopy the owner asked for: the surrounding sky IS a cherry blossom,
// built from red + pink stained glass and nothing else. An ellipsoid shell
// springs from just outside the island rim, sweeps up over the whole grove and
// closes high above the tree crown, so from the picnic you look out at glass
// instead of empty void. The rim hangs open (DOME_FLOOR) so the island, the
// lawn and the words stay visible below the canopy.

function domeTopY(dist) {
  const t = Math.min(1, dist / DOME_R);
  return OY + Math.round(DOME_H * Math.sqrt(Math.max(0, 1 - t * t)));
}

function canopyGlass(t, h) {
  if (t > 0.72) return h < 78 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass";
  if (t > 0.42) return h < 48 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass";
  return h < 20 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass";
}

function buildCanopySky(d) {
  const r2 = DOME_R * DOME_R;
  for (let dz = -DOME_R; dz <= DOME_R; dz++) {
    task(320, () => {
      for (let dx = -DOME_R; dx <= DOME_R; dx++) {
        const dh = dx * dx + dz * dz;
        if (dh > r2) continue;
        const dist = Math.sqrt(dh);
        const t = dist / DOME_R;
        const top = domeTopY(dist) + (hash(dx, 3, dz) % 7) - 3; // organic shell
        const thick = 1 + (hash(dx, 9, dz) < 55 ? 1 : 0) + (hash(dx, 17, dz) < 22 ? 1 : 0);
        const b = canopyGlass(t, hash(dx, 23, dz));
        for (let k = 0; k < thick; k++) {
          const y = top - k;
          if (y < DOME_FLOOR) continue; // keep the horizon open under the rim
          set(d, OX + dx, y, OZ + dz, b);
        }
      }
    });
  }
  // blossom strands hanging out of the canopy underside
  task(1500, () => {
    for (let i = 0; i < 190; i++) {
      const a = (i / 190) * Math.PI * 2 * 3.7;
      const dist = DOME_R * (0.18 + 0.79 * (((i * 7919) % 100) / 100));
      const top = domeTopY(dist);
      if (top < DOME_FLOOR + 4) continue;
      const x = OX + Math.round(Math.cos(a) * dist);
      const z = OZ + Math.round(Math.sin(a) * dist);
      const len = 3 + (i % 7);
      for (let h = 1; h <= len; h++) {
        set(d, x, top - h, z, h % 3 === 0 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass");
      }
    }
  });
}

function buildScene(d) {
  buildIsland(d);
  buildLettersGarden(d);
  buildLetters(d);
  buildPond(d);
  buildGrove(d);
  buildTrunk(d);
  buildBranches(d);
  buildStairs(d);
  buildDeck(d);
  buildCrown(d);
  buildCanopySky(d);
}

// --------------------------------------------------------------- world logic

function resolveDim() {
  if (dim) return dim;
  try {
    dim = world.getDimension(DIMENSION_ID);
  } catch (_) {
    dim = undefined;
  }
  return dim;
}

function loadChunks(d) {
  try {
    d.runCommand(`tickingarea add circle ${OX} ${OY} ${OZ} ${LOAD_RADIUS} sakura_date_night`);
  } catch (_) {
    /* already exists or command unavailable: the player still loads the centre */
  }
}

function ensureScene(d) {
  if (building || world.getDynamicProperty(BUILT_KEY) === true) return;
  queue = [];
  queueIndex = 0;
  building = true;
  buildScene(d);
}

function saveReturn(player) {
  let rot = { x: 0, y: 0 };
  try {
    rot = player.getRotation();
  } catch (_) {}
  const l = player.location;
  world.setDynamicProperty(
    RETURN_KEY,
    JSON.stringify({
      dimension: player.dimension.id,
      x: l.x,
      y: l.y,
      z: l.z,
      pitch: rot.x,
      yaw: rot.y,
    })
  );
}

function loadReturn() {
  const raw = world.getDynamicProperty(RETURN_KEY);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function tp(player, targetDim, loc, rot) {
  try {
    player.teleport({ x: loc.x, y: loc.y, z: loc.z }, { dimension: targetDim, rotation: rot });
    return true;
  } catch (_) {
    return false;
  }
}

function goDate(player) {
  const d = resolveDim();
  if (!d) {
    player.sendMessage("§cDate Night dimension missing. Enable Beta APIs + BP.");
    return;
  }
  saveReturn(player);
  player.sendMessage("§dTaking you somewhere special...");
  loadChunks(d);

  system.runTimeout(
    () => {
      ensureScene(d);
      const spot = { x: OX + 0.5, y: DECK_Y + 1, z: OZ + 6.5 };
      if (!tp(player, d, spot, { x: 12, y: 180 })) {
        system.runTimeout(() => {
          tp(player, d, { x: LANDING_X + 0.5, y: DECK_Y + 1, z: LANDING_Z + 0.5 }, { x: 15, y: 210 });
        }, 20);
      }
      player.sendMessage("§dWelcome — the picnic sits under a blossom canopy, stairs spiral the trunk.");
    },
    ARRIVAL_WAIT
  );
}

function goHome(player) {
  const s = loadReturn();
  if (!s) {
    const ow = world.getDimension("minecraft:overworld");
    const sp = world.getDefaultSpawnLocation();
    tp(player, ow, { x: sp.x, y: sp.y + 1, z: sp.z });
    return;
  }
  try {
    const td = world.getDimension(s.dimension);
    tp(player, td, { x: s.x, y: s.y, z: s.z }, { x: s.pitch, y: s.yaw });
  } catch (_) {
    const ow = world.getDimension("minecraft:overworld");
    const sp = world.getDefaultSpawnLocation();
    tp(player, ow, { x: sp.x, y: sp.y + 1, z: sp.z });
  }
}

function onUse(player) {
  const now = system.currentTick;
  const last = lastUse.get(player.id) ?? -999;
  if (now - last < COOLDOWN) return;
  lastUse.set(player.id, now);
  if (player.dimension.id === DIMENSION_ID) goHome(player);
  else goDate(player);
}

function giveShard(player) {
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (let i = 0; i < inv.size; i++) {
      if (inv.getItem(i)?.typeId === SHARD_ID) return;
    }
    inv.addItem(new ItemStack(SHARD_ID, 1));
    player.sendMessage("§dEnchanted Echo Shard — use it for Date Night.");
  } catch (_) {}
}

// --------------------------------------------------------------------- events

system.beforeEvents.startup.subscribe((event) => {
  try {
    event.dimensionRegistry.registerCustomDimension(DIMENSION_ID);
    console.warn("[DateNight] registered " + DIMENSION_ID);
  } catch (e) {
    console.warn("[DateNight] dim register: " + e);
  }
});

system.run(() => {
  resolveDim();
});

world.afterEvents.itemUse.subscribe((ev) => {
  if (!(ev.source instanceof Player)) return;
  if (ev.itemStack?.typeId !== SHARD_ID) return;
  onUse(ev.source);
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.runTimeout(() => giveShard(ev.player), 40);
});

try {
  world.beforeEvents.chatSend.subscribe((ev) => {
    const m = ev.message.trim().toLowerCase();
    if (m === "!date" || m === "!datenight") {
      ev.cancel = true;
      system.run(() => onUse(ev.sender));
    }
    if (m === "!shard") {
      ev.cancel = true;
      system.run(() => giveShard(ev.sender));
    }
    if (m === "!rebuild") {
      ev.cancel = true;
      system.run(() => {
        world.setDynamicProperty(BUILT_KEY, false);
        const d = resolveDim();
        if (d) {
          loadChunks(d);
          ensureScene(d);
        }
        ev.sender.sendMessage("§dDate Night rebuilding — give it a few seconds.");
      });
    }
  });
} catch (_) {}
