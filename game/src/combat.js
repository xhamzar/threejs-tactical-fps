// DUSK STRIKE — hitscan combat and grenades. A shot is a ray: walls stop
// it, fighters are three spheres (head, chest, legs) — headshots pay double.
// The shotgun fires a cone of pellets, one ray each. Grenades are little
// ballistic bodies with a fuse: frags blast, smoke blooms into a cloud that
// blinds bot sight, flashbangs blind anyone looking at the pop.
import { WEAPONS, GRENADE, SMOKE, FLASH } from './config.js';
import { applyDamage } from './player.js';
import { rayHitWorld, hasLineOfSight } from './world.js';
import { emit } from './state.js';
import { tryFire } from './weapons.js';

// One fighter's trigger pull for this tick: fire, resolve, make noise.
// Emits 'shotFired' {fighter, shot, result} for tracers, sound and stats.
export function fireFighter(state, world, f, wantFire, dt, speed) {
  const shot = tryFire(state, f, wantFire, dt, speed);
  if (!shot) return;
  if (shot.dry) { emit(state, 'dryfire', { fighter: f }); return; }
  const w = WEAPONS[shot.weapon];
  const result = shot.pellets
    ? resolvePellets(state, world, f, shot, w)
    : resolveShot(state, world, f, shot);
  addNoise(state, f.pos.x, f.pos.z, shot.weapon === 'shotgun' ? 30 : 24);
  emit(state, 'shotFired', { fighter: f, shot, result });
}

// Shotgun: one ray per pellet, each jittered inside the pellet cone. The
// tracer follows the first pellet; damage stacks per pellet that lands.
function resolvePellets(state, world, shooter, shot, w) {
  let first = null;
  for (let i = 0; i < shot.pellets; i++) {
    const d = jitterDir(shot.dx, shot.dy, shot.dz, w.pelletSpread);
    const r = resolveShot(state, world, shooter, { ...shot, dx: d.x, dy: d.y, dz: d.z });
    if (!first) first = r;
  }
  return first || { hit: false, end: { x: shot.ox, y: shot.oy, z: shot.oz } };
}

// Jitter a unit direction by a small random cone (plain math, no THREE).
function jitterDir(dx, dy, dz, amount) {
  let rx = -dz, ry = 0, rz = dx; // right = dir x up(0,1,0)
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // up2 = right x dir
  const ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;
  const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  let nx = dx + rx * g() * amount + ux * g() * amount;
  let ny = dy + ry * g() * amount + uy * g() * amount;
  let nz = dz + rz * g() * amount + uz * g() * amount;
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / l, y: ny / l, z: nz / l };
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Hit spheres for a fighter: [y-offset, radius, part].
function hitSpheres(f) {
  const crouch = f.crouching;
  return [
    [crouch ? 0.98 : 1.52, 0.17, 'head'],
    [crouch ? 0.62 : 1.02, 0.36, 'chest'],
    [0.42, 0.3, 'legs'],
  ];
}

export function resolveShot(state, world, shooter, shot) {
  const w = WEAPONS[shot.weapon];
  const maxDist = w.range;
  const wallDist = rayHitWorld(world, shot.ox, shot.oy, shot.oz, shot.dx, shot.dy, shot.dz, maxDist);
  let best = null, bestT = Math.min(wallDist, maxDist);
  for (const f of state.fighters) {
    if (f === shooter || !f.alive) continue;
    for (const [dy, r, part] of hitSpheres(f)) {
      const t = raySphere(shot.ox, shot.oy, shot.oz, shot.dx, shot.dy, shot.dz, f.pos.x, f.pos.y + dy, f.pos.z, r);
      if (t < bestT) { bestT = t; best = { victim: f, part }; }
    }
  }
  const end = {
    x: shot.ox + shot.dx * bestT, y: shot.oy + shot.dy * bestT, z: shot.oz + shot.dz * bestT,
  };
  if (!best) return { hit: false, end, wall: wallDist < maxDist };
  const mult = best.part === 'head' ? w.headMult : best.part === 'legs' ? 0.8 : 1;
  const died = applyDamage(best.victim, w.damage * mult);
  emit(state, 'hit', { shooter, victim: best.victim, head: best.part === 'head', died });
  if (died) emit(state, 'kill', { shooter, victim: best.victim, weapon: shot.weapon, head: best.part === 'head' });
  return { hit: true, end, victim: best.victim, head: best.part === 'head', died };
}

export function addNoise(state, x, z, radius) {
  state.noise.push({ x, z, radius, until: state.time + 1.5 });
}

export function updateGrenades(state, world, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vy -= 18 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.12) { g.y = 0.12; g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
    // Cheap wall bounce: reverse the axis that entered a collider.
    for (const b of world.colliders) {
      if (g.y > b.maxY || g.y < b.minY) continue;
      if (g.x > b.minX && g.x < b.maxX && g.z > b.minZ && g.z < b.maxZ) {
        const dxl = g.x - b.minX, dxr = b.maxX - g.x, dzl = g.z - b.minZ, dzr = b.maxZ - g.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) g.vx = -g.vx * 0.4; else g.vz = -g.vz * 0.4;
        g.x += g.vx * dt * 2; g.z += g.vz * dt * 2;
      }
    }
    if (g.mesh) g.mesh.position.set(g.x, g.y, g.z);
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    state.grenades.splice(i, 1);
    if (g.mesh) { g.mesh.parent?.remove(g.mesh); }
    if (g.kind === 'smoke') {
      // Bloom into a lingering cloud: bots cannot see through it.
      state.smoke.push({ x: g.x, y: 0.9, z: g.z, r: SMOKE.radius, until: state.time + SMOKE.duration });
      emit(state, 'smoke', { x: g.x, y: 0.9, z: g.z });
      addNoise(state, g.x, g.z, 12);
    } else if (g.kind === 'flash') {
      emit(state, 'flash', { x: g.x, y: g.y, z: g.z, owner: g.owner });
      addNoise(state, g.x, g.z, 30);
      blindFromFlash(state, world, g);
    } else {
      emit(state, 'explosion', { x: g.x, y: g.y, z: g.z, owner: g.owner });
      addNoise(state, g.x, g.z, 30);
      for (const f of state.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.pos.x - g.x, f.pos.z - g.z);
        if (d > GRENADE.radius) continue;
        const dmg = GRENADE.damage * (1 - (d / GRENADE.radius) * 0.7);
        const died = applyDamage(f, dmg);
        if (died && f !== g.owner) emit(state, 'kill', { shooter: g.owner, victim: f, weapon: 'grenade', head: false });
        else if (f !== g.owner) emit(state, 'hit', { shooter: g.owner, victim: f, head: false, died: false });
      }
    }
  }
  // Expire old noise and smoke.
  for (let i = state.noise.length - 1; i >= 0; i--) {
    if (state.noise[i].until < state.time) state.noise.splice(i, 1);
  }
  for (let i = state.smoke.length - 1; i >= 0; i--) {
    if (state.smoke[i].until < state.time) state.smoke.splice(i, 1);
  }
}

// A flashbang blinds every fighter with a clear line of sight to the pop,
// friend or foe — the owner included. Bots lose their target while blind;
// the player's screen whites out (handled by the HUD flash event).
function blindFromFlash(state, world, g) {
  for (const f of state.fighters) {
    if (!f.alive) continue;
    const d = Math.hypot(f.pos.x - g.x, f.pos.z - g.z);
    if (d > FLASH.radius) continue;
    const eye = { x: f.pos.x, y: f.pos.y + 1.5, z: f.pos.z };
    if (!hasLineOfSight(world, eye.x, eye.y, eye.z, g.x, g.y, g.z)) continue;
    // Facing away halves the effect; staring straight at it is the worst.
    const facing = { x: -Math.sin(f.yaw), z: -Math.cos(f.yaw) };
    const toFlash = { x: (g.x - f.pos.x) / (d || 1), z: (g.z - f.pos.z) / (d || 1) };
    const facingDot = facing.x * toFlash.x + facing.z * toFlash.z;
    const strength = Math.max(0.25, (facingDot + 1) / 2) * (1 - (d / FLASH.radius) * 0.5);
    const blindTime = FLASH.blindTime * strength;
    if (f.ai) {
      f.ai.blindUntil = state.time + blindTime;
      f.ai.target = null;
    } else if (f.isPlayer) {
      emit(state, 'playerFlashed', { strength });
    }
  }
}

// True when the segment between two points crosses any live smoke cloud.
export function blockedBySmoke(state, ax, ay, az, bx, by, bz) {
  for (const s of state.smoke) {
    // Closest point on the segment to the sphere center.
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((s.x - ax) * abx + (s.y - ay) * aby + (s.z - az) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
    if (Math.hypot(s.x - cx, s.y - cy, s.z - cz) < s.r) return true;
  }
  return false;
}
