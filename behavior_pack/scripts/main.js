/**
 * Sakura Date Night
 * Architecture matches the first pack that successfully showed the tree in sakura:date_night.
 * Only change from that build: purple canopy → cherry trunk + red leaves/glass, picnic on top.
 */
import { ItemStack, Player, system, world } from "@minecraft/server";

const DIMENSION_ID = "sakura:date_night";
const SHARD_ID = "sakura:enchanted_echo_shard";
const RETURN_KEY = "sakura:return_location";
const BUILT_KEY = "sakura:date_night_built_v4";
const ARRIVAL_WAIT = 40;
const COOLDOWN = 20;

const OX = 0, OY = 64, OZ = 0;
const TREE_H = 40;
const PICNIC_Y = OY + TREE_H + 4;

const lastUse = new Map();
/** @type {import("@minecraft/server").Dimension | undefined} */
let dim;
let building = false;

function set(d, x, y, z, b) {
  try { d.getBlock({ x, y, z })?.setType(b); } catch (_) {}
}
function disk(d, cx, cy, cz, r, b) {
  const r2 = r * r;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dz * dz <= r2) set(d, cx + dx, cy, cz + dz, b);
}
function sphere(d, cx, cy, cz, r, b) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy + dz * dz <= r2) set(d, cx + dx, cy + dy, cz + dz, b);
}

function buildPlatform(d) {
  const R = 48;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R) continue;
      set(d, OX + dx, OY - 1, OZ + dz, "minecraft:dirt");
      set(d, OX + dx, OY, OZ + dz, "minecraft:grass_block");
      set(d, OX + dx, OY + 1, OZ + dz, "minecraft:air");
      set(d, OX + dx, OY + 2, OZ + dz, "minecraft:air");
    }
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    set(d, OX + Math.round(Math.cos(ang) * 14), OY, OZ + Math.round(Math.sin(ang) * 14), "minecraft:pink_concrete");
  }
}

function buildLetters(d) {
  const letters = {
    I: ["###", " # ", " # ", " # ", "###"],
    H: ["# #", "###", "###", " # ", "   "],
    Y: ["# #", "# #", " # ", " # ", " # "],
    O: ["###", "# #", "# #", "# #", "###"],
    U: ["# #", "# #", "# #", "# #", "###"],
  };
  function paint(ox, oz, pat, b) {
    for (let r = 0; r < pat.length; r++)
      for (let c = 0; c < pat[r].length; c++)
        if (pat[r][c] === "#") set(d, ox + c, OY + 1, oz + r, b);
    return pat[0].length + 2;
  }
  let x = OX - 12;
  const z = OZ - 22;
  x += paint(x, z, letters.I, "minecraft:black_concrete");
  x += paint(x, z, letters.H, "minecraft:red_concrete");
  x += paint(x, z, letters.Y, "minecraft:black_concrete");
  x += paint(x, z, letters.O, "minecraft:black_concrete");
  paint(x, z, letters.U, "minecraft:black_concrete");
}

function buildTrunk(d) {
  for (let y = OY; y < OY + TREE_H; y++) {
    const t = (y - OY) / TREE_H;
    const r = Math.max(2, Math.floor(5 * (1 - t * 0.4)));
    disk(d, OX, y, OZ, r, "minecraft:cherry_log");
  }
  for (const [dx, dz] of [[10,0],[-10,0],[0,10],[0,-10],[8,8],[-8,8],[8,-8],[-8,-8]]) {
    for (let i = 0; i <= 5; i++) {
      const px = OX + Math.round((dx * i) / 5);
      const pz = OZ + Math.round((dz * i) / 5);
      for (let yy = 0; yy < Math.max(1, 4 - Math.floor(i / 2)); yy++)
        set(d, px, OY + yy, pz, "minecraft:cherry_log");
    }
  }
}

function buildCanopy(d) {
  const cy = OY + TREE_H;
  for (const [ox, oy, oz, r] of [[0,0,0,15],[11,2,5,10],[-11,1,-4,10],[5,3,-12,9],[-6,2,11,9],[0,5,0,8]]) {
    const r2 = r * r;
    for (let dy = -r; dy <= Math.floor(r * 0.65); dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const dist = dx * dx + dy * dy * 1.25 + dz * dz;
          if (dist > r2) continue;
          const h = ((dx * 73856093) ^ (dy * 19349663) ^ (dz * 83492791)) >>> 0;
          if (dist > r2 * 0.72 && (h % 100) > 55) continue;
          if (dist > r2 * 0.5 && (h % 100) < 20)
            set(d, OX + ox + dx, cy + oy + dy, OZ + oz + dz, "minecraft:red_stained_glass");
          else
            set(d, OX + ox + dx, cy + oy + dy, OZ + oz + dz, "minecraft:nether_wart_block");
        }
  }
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    const dist = 5 + (i % 7);
    const hx = OX + Math.round(Math.cos(ang) * dist);
    const hz = OZ + Math.round(Math.sin(ang) * dist);
    const len = 5 + (i % 8);
    for (let h = 1; h <= len; h++)
      set(d, hx, cy - h, hz, h % 3 === 0 ? "minecraft:pink_stained_glass" : "minecraft:red_stained_glass");
  }
  for (const [dx, dy, dz] of [[0,1,0],[6,0,3],[-5,2,-3],[3,-1,-6]])
    sphere(d, OX + dx, cy + dy, OZ + dz, 2, "minecraft:shroomlight");
}

function buildStairs(d) {
  let y = OY, angle = 0;
  while (y <= PICNIC_Y) {
    const r = 8;
    const sx = OX + Math.round(Math.cos(angle) * r);
    const sz = OZ + Math.round(Math.sin(angle) * r);
    set(d, sx, y, sz, "minecraft:cherry_stairs");
    set(d, sx, y + 1, sz, "minecraft:air");
    set(d, sx, y + 2, sz, "minecraft:air");
    set(d, OX + Math.round(Math.cos(angle) * (r + 1)), y, OZ + Math.round(Math.sin(angle) * (r + 1)), "minecraft:cherry_planks");
    set(d, OX + Math.round(Math.cos(angle) * (r + 2)), y + 1, OZ + Math.round(Math.sin(angle) * (r + 2)), "minecraft:cherry_fence");
    angle += 0.28;
    y += 1;
  }
}

function buildPicnic(d) {
  const y = PICNIC_Y;
  for (let dz = -9; dz <= 9; dz++)
    for (let dx = -9; dx <= 9; dx++) {
      if (dx * dx + dz * dz > 81) continue;
      for (let dy = 0; dy <= 5; dy++) set(d, OX + dx, y + dy, OZ + dz, "minecraft:air");
      set(d, OX + dx, y - 1, OZ + dz, "minecraft:cherry_log");
      set(d, OX + dx, y, OZ + dz, "minecraft:smooth_quartz");
    }
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++)
      set(d, OX + dx, y + 1, OZ + dz, ((dx + dz) % 2 === 0) ? "minecraft:pink_carpet" : "minecraft:white_carpet");
  set(d, OX, y + 1, OZ, "minecraft:cake");
  set(d, OX + 2, y + 1, OZ + 1, "minecraft:candle_cake");
  set(d, OX - 2, y + 1, OZ - 1, "minecraft:chest");
  for (const [dx, dz] of [[7,0],[-7,0],[0,7],[0,-7],[5,5],[-5,5],[5,-5],[-5,-5]]) {
    set(d, OX + dx, y + 1, OZ + dz, "minecraft:cherry_log");
    set(d, OX + dx, y + 2, OZ + dz, "minecraft:lantern");
  }
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    set(d, OX + Math.round(Math.cos(ang) * 9), y + 1, OZ + Math.round(Math.sin(ang) * 9), "minecraft:cherry_fence");
  }
}

function buildGrove(d) {
  for (const [dx, dz] of [[18,12],[-16,14],[14,-18],[-20,-10],[22,-8],[-12,20],[8,22],[-22,6]]) {
    const tx = OX + dx, tz = OZ + dz;
    for (let h = 0; h < 5; h++) set(d, tx, OY + 1 + h, tz, "minecraft:cherry_log");
    sphere(d, tx, OY + 6, tz, 3, "minecraft:cherry_leaves");
    set(d, tx + 2, OY + 4, tz, "minecraft:lantern");
  }
}

function buildPond(d) {
  const pz = OZ + 18;
  for (let dz = -5; dz <= 5; dz++)
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx / 64 + dz * dz / 25 > 1) continue;
      set(d, OX + dx, OY - 1, pz + dz, "minecraft:dirt");
      set(d, OX + dx, OY, pz + dz, "minecraft:water");
    }
  for (let dx = -9; dx <= 9; dx++) {
    set(d, OX + dx, OY, pz, "minecraft:cherry_planks");
    set(d, OX + dx, OY + 1, pz - 1, "minecraft:cherry_fence");
    set(d, OX + dx, OY + 1, pz + 1, "minecraft:cherry_fence");
  }
}

function buildScene(d) {
  buildPlatform(d);
  buildLetters(d);
  buildTrunk(d);
  buildCanopy(d);
  buildStairs(d);
  buildPicnic(d);
  buildGrove(d);
  buildPond(d);
}

function resolveDim() {
  if (dim) return dim;
  try { dim = world.getDimension(DIMENSION_ID); } catch (_) { dim = undefined; }
  return dim;
}

function ensureScene(d) {
  if (world.getDynamicProperty(BUILT_KEY) === true || building) return;
  building = true;
  try {
    buildScene(d);
    world.setDynamicProperty(BUILT_KEY, true);
  } finally {
    building = false;
  }
}

function saveReturn(player) {
  let rot = { x: 0, y: 0 };
  try { rot = player.getRotation(); } catch (_) {}
  const l = player.location;
  world.setDynamicProperty(RETURN_KEY, JSON.stringify({
    dimension: player.dimension.id, x: l.x, y: l.y, z: l.z, pitch: rot.x, yaw: rot.y
  }));
}

function loadReturn() {
  const raw = world.getDynamicProperty(RETURN_KEY);
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function tp(player, targetDim, loc, rot) {
  try {
    player.teleport({ x: loc.x, y: loc.y, z: loc.z }, { dimension: targetDim, rotation: rot });
    return true;
  } catch (_) { return false; }
}

function goDate(player) {
  const d = resolveDim();
  if (!d) {
    player.sendMessage("§cDate Night dimension missing. Enable Beta APIs + BP.");
    return;
  }
  saveReturn(player);
  player.sendMessage("§dTaking you somewhere special...");
  try { d.runCommand("tickingarea add circle 0 64 0 6 sakura_date_arrival"); } catch (_) {}

  system.runTimeout(() => {
    ensureScene(d);
    const ok = tp(player, d, { x: OX + 0.5, y: PICNIC_Y + 2, z: OZ + 0.5 }, { x: 25, y: 180 });
    if (!ok) {
      system.runTimeout(() => {
        tp(player, d, { x: OX + 0.5, y: OY + 3, z: OZ - 12.5 }, { x: 20, y: 0 });
      }, 15);
    }
    player.sendMessage("§dWelcome — picnic is on top of the tree. Stairs spiral up the trunk.");
  }, ARRIVAL_WAIT);
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
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === SHARD_ID) return;
    inv.addItem(new ItemStack(SHARD_ID, 1));
    player.sendMessage("§dEnchanted Echo Shard — use it for Date Night.");
  } catch (_) {}
}

system.beforeEvents.startup.subscribe((event) => {
  try {
    event.dimensionRegistry.registerCustomDimension(DIMENSION_ID);
    console.warn("[DateNight] registered " + DIMENSION_ID);
  } catch (e) {
    console.warn("[DateNight] dim register: " + e);
  }
});

system.run(() => { resolveDim(); });

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
    if (m === "!date" || m === "!datenight") { ev.cancel = true; system.run(() => onUse(ev.sender)); }
    if (m === "!shard") { ev.cancel = true; system.run(() => giveShard(ev.sender)); }
    if (m === "!rebuild") {
      ev.cancel = true;
      system.run(() => {
        world.setDynamicProperty(BUILT_KEY, false);
        const d = resolveDim();
        if (d) ensureScene(d);
        ev.sender.sendMessage("§dDate Night rebuilt.");
      });
    }
  });
} catch (_) {}
