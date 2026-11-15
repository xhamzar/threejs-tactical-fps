// DUSK STRIKE — hitscan combat and grenades. A shot is a ray: walls stop
// it, fighters are three spheres (head, chest, legs) — headshots pay double.
// Grenades are little ballistic bodies with a fuse; their blast hurts in a
// radius and rings every bot's ears.
import { WEAPONS, GRENADE } from './config.js';
import { applyDamage } from './player.js';
import { rayHitWorld } from './world.js';
import { emit } from './state.js';
import { tryFire } from './weapons.js';

// One fighter's trigger pull for this tick: fire, resolve, make noise.
// Emits 'shotFired' {fighter, shot, result} for tracers, sound and stats.
export function fireFighter(state, world, f, wantFire, dt, speed) {
  const shot = tryFire(state, f, wantFire, dt, speed);
  if (!shot) return;
  if (shot.dry) { emit(state, 'dryfire', { fighter: f }); return; }
  const result = resolveShot(state, world, f, shot);
  addNoise(state, f.pos.x, f.pos.z, 24);
  emit(state, 'shotFired', { fighter: f, shot, result });
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
  // Expire old noise.
  for (let i = state.noise.length - 1; i >= 0; i--) {
    if (state.noise[i].until < state.time) state.noise.splice(i, 1);
  }
}
