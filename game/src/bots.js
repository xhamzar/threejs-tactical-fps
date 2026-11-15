// DUSK STRIKE — bot brains. A bot is a small state machine over the
// waypoint graph: it walks lanes, holds positions, plants and defuses, and
// fights what it sees or hears. Aim is human, not perfect: a reaction
// delay, a wandering error that shrinks while the bot stands still, and
// bursts instead of a laser.
import * as THREE from 'three';
import { TEAM, MOVER } from './config.js';
import { eyePos, accelerate, moveFighter } from './player.js';
import { hasLineOfSight, nearestWaypoint, findPath } from './world.js';
import { fireFighter } from './combat.js';
import { startReload, updateReload } from './weapons.js';

const FOV_COS = Math.cos(1.05); // ~60 degrees half-angle
const SEE_DIST = 32; // beyond this a bot keeps moving instead of staring
const ENGAGE_ADVANCE = 16; // closer than this, strafe; farther, push in

export function createBotAI(role, site) {
  return {
    role, // 'carrier' | 'attacker' | 'defender'
    site, // 'A' | 'B' — the site this bot plays around
    state: 'buy',
    path: [], pathIdx: 0,
    target: null, lastSeen: null, lastSeenAt: -99,
    reaction: 0, burst: 0.4, burstPause: 0,
    aimErr: 0.06, aimYaw: 0, aimPitch: 0,
    strafeDir: 1, strafeAt: 0, crouchDuel: false,
    holdYaw: 0, scanDir: 1,
    heard: null,
  };
}

// Where this bot wants to go right now (a waypoint index).
function objectiveWaypoint(state, world, f) {
  const ai = f.ai;
  if (f.team === 'raiders') {
    if (state.bomb.state === 'planted') return ai.site === 'A' ? 20 : 25;
    if (ai.role === 'carrier') return ai.site === 'A' ? 20 : 25;
    // Attackers take the long way round to the same site.
    if (ai.site === 'A') return f.id % 2 ? 9 : 21;
    return f.id % 2 ? 18 : 24;
  }
  // Guards: one holds each site, drifting toward mid when the bomb is up.
  if (state.bomb.state === 'planted') return state.bomb.site === 'A' ? 20 : 25;
  return ai.site === 'A' ? 21 : 24;
}

function repath(state, world, f) {
  const ai = f.ai;
  const from = nearestWaypoint(world, f.pos.x, f.pos.z);
  const to = objectiveWaypoint(state, world, f);
  ai.path = findPath(world, from, to);
  ai.pathIdx = 0;
}

function canSee(world, f, enemy) {
  const eye = eyePos(f);
  const dx = enemy.pos.x - eye.x, dz = enemy.pos.z - eye.z;
  const dist = Math.hypot(dx, dz);
  if (dist > SEE_DIST) return false;
  const facing = { x: -Math.sin(f.yaw), z: -Math.cos(f.yaw) };
  if ((facing.x * dx + facing.z * dz) / (dist || 1) < FOV_COS) return false;
  return hasLineOfSight(world, eye.x, eye.y, eye.z, enemy.pos.x, enemy.pos.y + 1.1, enemy.pos.z);
}

function pickTarget(state, world, f) {
  let best = null, bd = Infinity;
  for (const e of state.fighters) {
    if (e.team === f.team || !e.alive) continue;
    const d = (e.pos.x - f.pos.x) ** 2 + (e.pos.z - f.pos.z) ** 2;
    if (d < bd && canSee(world, f, e)) { bd = d; best = e; }
  }
  // Stick to the current target unless the new one is clearly closer —
  // otherwise the bot flip-flops between two enemies and never fires.
  if (best && f.ai.target && best !== f.ai.target) {
    const cur = f.ai.target;
    if (cur.alive && canSee(world, f, cur)) {
      const cd = (cur.pos.x - f.pos.x) ** 2 + (cur.pos.z - f.pos.z) ** 2;
      if (bd > cd * 0.72) return cur; // new target must be ~15% closer
    }
  }
  return best;
}

function faceToward(f, tx, ty, tz, dt, rate) {
  const wantYaw = Math.atan2(-(tx - f.pos.x), -(tz - f.pos.z));
  let dy = wantYaw - f.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  f.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
  const dx = tx - f.pos.x, dz = tz - f.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wantPitch = Math.atan2(ty - (f.pos.y + f.eyeHeight), dist);
  f.pitch += Math.max(-rate * dt, Math.min(rate * dt, wantPitch - f.pitch));
  return Math.abs(dy);
}

export function updateBot(state, world, f, dt) {
  const ai = f.ai;
  if (!f.alive || !ai) return;
  updateReload(state, f, dt);
  f.bloom = Math.max(0, f.bloom - dt * 1.4);

  // --- Perception ---
  const seen = pickTarget(state, world, f);
  if (seen) {
    if (ai.target !== seen) ai.reaction = 0.35 + Math.random() * 0.3;
    ai.target = seen;
    ai.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    ai.lastSeenAt = state.time;
  } else if (ai.target && state.time - ai.lastSeenAt > 2.5) {
    ai.target = null;
  }
  if (!ai.target) {
    for (const n of state.noise) {
      const d = Math.hypot(n.x - f.pos.x, n.z - f.pos.z);
      if (d < n.radius) { ai.heard = { x: n.x, z: n.z }; break; }
    }
  }

  // --- States ---
  if (state.roundPhase === 'buy') { ai.state = 'buy'; }
  else if (ai.state === 'buy') { ai.state = 'move'; repath(state, world, f); }

  // Plant / defuse take over when the bot is in place.
  const bomb = state.bomb;
  if (state.roundPhase === 'live') {
    if (f.team === 'raiders' && ai.role === 'carrier' && bomb.state === 'carried' && bomb.carrier === f) {
      const s = world.sites[ai.site];
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) < s.r) ai.state = 'plant';
      else if (ai.state === 'plant') ai.state = 'move';
    }
    if (f.team === 'guard' && bomb.state === 'planted') {
      const s = world.sites[bomb.site];
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) < s.r + 0.5) ai.state = 'defuse';
      else if (ai.state === 'defuse') ai.state = 'move';
    }
  }
  if (ai.target && ai.state !== 'plant' && ai.state !== 'defuse') ai.state = 'engage';
  else if (!ai.target && ai.state === 'engage') {
    ai.state = 'move';
    if (ai.lastSeen) { ai.path = [nearestWaypoint(world, ai.lastSeen.x, ai.lastSeen.z)]; ai.pathIdx = 0; }
    else repath(state, world, f);
  }

  // --- Act ---
  let speed = 0;
  if (ai.state === 'buy' || ai.state === 'plant' || ai.state === 'defuse') {
    accelerate(f, 0, 0, dt);
    if (ai.state === 'plant' || ai.state === 'defuse') {
      // Stand still and work: rounds.js advances the interact timer.
      f.interactKind = ai.state;
    }
  } else if (ai.state === 'engage' && ai.target) {
    const t = ai.target;
    ai.reaction -= dt;
    // Strafe sideways, flipping direction every second or so.
    if (state.time > ai.strafeAt) {
      ai.strafeDir *= -1;
      ai.strafeAt = state.time + 0.7 + Math.random() * 0.8;
      ai.crouchDuel = Math.random() < 0.5;
    }
    const ang = faceToward(f, t.pos.x, t.pos.y + 1.1, t.pos.z, dt, 5);
    const wantFire = ai.reaction <= 0 && ang < 0.12;
    // Fire in bursts with pauses: burst counts down while firing, then
    // burstPause counts down while holding fire. (An earlier version reset
    // the pause inside the else branch, which deadlocked the gun forever.)
    if (wantFire) {
      if (ai.burstPause > 0) {
        ai.burstPause -= dt;
      } else {
        const moving = Math.hypot(f.vel.x, f.vel.z);
        fireFighter(state, world, f, true, dt, moving);
        ai.burst -= dt;
        if (ai.burst <= 0) {
          ai.burst = 0.35 + Math.random() * 0.3;
          ai.burstPause = 0.25 + Math.random() * 0.3;
        }
      }
    }
    // Far away the pistol is a peashooter: push in while firing so the
    // fight actually resolves instead of two bots strafing at 40 meters.
    const distToTarget = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
    f.crouching = distToTarget > 14 && ai.crouchDuel;
    if (distToTarget > ENGAGE_ADVANCE) {
      const sp = MOVER.walk * 0.9;
      accelerate(f, -Math.sin(f.yaw) * sp, -Math.cos(f.yaw) * sp, dt);
    } else {
      const strafe = ai.strafeDir * MOVER.walk * 0.45;
      const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
      accelerate(f, cy * strafe, -sy * strafe, dt);
    }
    speed = Math.hypot(f.vel.x, f.vel.z);
    if (f.weapons[f.current]?.mag === 0) startReload(state, f);
  } else {
    // Move along the waypoint path.
    if (ai.heard && ai.state === 'move' && !ai.target) {
      // Investigate the noise — via the waypoint graph, not a beeline,
      // so the bot routes around containers instead of into them.
      const to = nearestWaypoint(world, ai.heard.x, ai.heard.z);
      ai.path = findPath(world, nearestWaypoint(world, f.pos.x, f.pos.z), to);
      ai.pathIdx = 0;
      ai.heard = null;
    }
    if (ai.pathIdx >= ai.path.length) {
      // Guards hold only when they actually reached their objective. A path
      // that ends anywhere else (noise investigation, last-seen chase, or a
      // bomb planted after the path was set) means repath to the objective —
      // otherwise a guard that heard one shot would hold that spot forever.
      const obj = objectiveWaypoint(state, world, f);
      const arrived = ai.path.length > 0 && ai.path[ai.path.length - 1] === obj;
      if (f.team === 'guard' && state.roundPhase === 'live' && arrived) {
        ai.state = 'hold';
        ai.holdYaw = f.yaw;
      } else {
        repath(state, world, f);
        if (ai.state === 'hold') ai.state = 'move';
      }
    }
    if (ai.state === 'hold') {
      // Scan the area slowly, watching the approach.
      f.yaw += Math.sin(state.time * 0.5 + f.id) * 0.25 * dt;
      accelerate(f, 0, 0, dt);
    } else if (ai.pathIdx < ai.path.length) {
      const wp = world.waypoints[ai.path[ai.pathIdx]];
      const dx = wp.x - f.pos.x, dz = wp.z - f.pos.z;
      if (Math.hypot(dx, dz) < 0.9) ai.pathIdx++;
      else {
        faceToward(f, wp.x, f.pos.y + f.eyeHeight, wp.z, dt, 4.5);
        const sp = MOVER.walk * 0.95;
        accelerate(f, -Math.sin(f.yaw) * sp, -Math.cos(f.yaw) * sp, dt);
        speed = Math.hypot(f.vel.x, f.vel.z);
      }
    }
  }
  moveFighter(f, dt, world);
  f.eyeHeight += ((f.crouching ? MOVER.eyeCrouch : MOVER.eyeStand) - f.eyeHeight) * Math.min(1, dt * 12);

  // Reload when the mag runs dry out of combat.
  if (!ai.target && f.weapons[f.current]?.mag === 0) startReload(state, f);
}

// ---- Bot bodies: simple humanoids, team-coloured vest and helmet. ----
export function buildBotMesh(team) {
  const t = TEAM[team];
  const g = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), vest);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), dark);
  helmet.position.y = 1.78;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), dark);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), dark);
  gun.position.set(0.22, 1.22, -0.32);
  g.add(torso, head, helmet, legL, legR, gun);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
