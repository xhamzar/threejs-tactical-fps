// DUSK STRIKE — fighters and movement. A fighter is a cylinder (radius,
// height) walking the map: acceleration toward the wish direction, friction
// when idle, axis-separated AABB collision so sliding along walls feels
// right. Bots reuse moveFighter; only the player reads Input.
import * as THREE from 'three';
import { MOVER, WEAPONS } from './config.js';

let nextId = 1;

export function createFighter({ team, name, isPlayer = false, x = 0, z = 0, yaw = 0 }) {
  return {
    id: nextId++, name, team, isPlayer,
    alive: true, hp: 100, armor: 0,
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw, pitch: 0,
    crouching: false, eyeHeight: MOVER.eyeStand,
    weapons: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    current: 'pistol', grenades: 0,
    cooldown: 0, reloading: 0, reloadWeapon: null, bloom: 0,
    money: 0, kills: 0, deaths: 0,
    mesh: null, // set by the mesh builder in main.js
    // bot-only fields, ignored for the player
    ai: null,
    // interact progress (plant/defuse), 0..1
    interact: 0, interactKind: null,
    flash: 0, // muzzle flash timer for the view model / bot gun
  };
}

export function eyePos(f) {
  return { x: f.pos.x, y: f.pos.y + f.eyeHeight, z: f.pos.z };
}

// Move a fighter's feet position with collision. vel is feet/sec.
export function moveFighter(f, dt, world) {
  const r = MOVER.radius;
  // X axis, then Z axis: sliding along a wall keeps the other component.
  f.pos.x += f.vel.x * dt;
  resolveAxis(f, world, r, true);
  f.pos.z += f.vel.z * dt;
  resolveAxis(f, world, r, false);
  // Map bounds
  f.pos.x = Math.max(world.bounds.minX + r, Math.min(world.bounds.maxX - r, f.pos.x));
  f.pos.z = Math.max(world.bounds.minZ + r, Math.min(world.bounds.maxZ - r, f.pos.z));
}

function resolveAxis(f, world, r, isX) {
  for (const b of world.colliders) {
    if (b.maxY < 0.4) continue; // low trim never blocks a fighter
    // Strict separation: a fighter resting exactly on a face (pushed out by
    // the other axis this same tick) is NOT overlapping. With an inclusive
    // test the second axis shoves the fighter back and wedges it in the
    // corner forever — bots used to stall on container corners this way.
    if (f.pos.x + r <= b.minX || f.pos.x - r >= b.maxX) continue;
    if (f.pos.z + r <= b.minZ || f.pos.z - r >= b.maxZ) continue;
    if (isX) {
      if (f.vel.x > 0) f.pos.x = b.minX - r; else if (f.vel.x < 0) f.pos.x = b.maxX + r;
      f.vel.x = 0;
    } else {
      if (f.vel.z > 0) f.pos.z = b.minZ - r; else if (f.vel.z < 0) f.pos.z = b.maxZ + r;
      f.vel.z = 0;
    }
  }
}

// Accelerate toward a wish velocity (feet/sec): fast approach when moving,
// friction decay when idle. Exponential, so it is frame-rate independent.
export function accelerate(f, wishX, wishZ, dt) {
  const rate = (wishX !== 0 || wishZ !== 0) ? 10 : MOVER.friction;
  const k = 1 - Math.exp(-rate * dt);
  f.vel.x += (wishX - f.vel.x) * k;
  f.vel.z += (wishZ - f.vel.z) * k;
}

// The player's per-tick update: look, move, crouch. Returns speed (for spread).
export function updatePlayer(f, input, tick, dt, world, sensitivity) {
  f.yaw -= tick.dx * 0.0022 * sensitivity;
  f.pitch = Math.max(-1.5, Math.min(1.5, f.pitch - tick.dy * 0.0022 * sensitivity));
  f.crouching = input.held('ControlLeft') || input.held('ControlRight') || input.held('KeyC');
  const targetEye = f.crouching ? MOVER.eyeCrouch : MOVER.eyeStand;
  f.eyeHeight += (targetEye - f.eyeHeight) * Math.min(1, dt * 12);

  const { f: fwd, s: str } = input.axis();
  const sprint = input.held('ShiftLeft') && !f.crouching && fwd > 0;
  const speed = f.crouching ? MOVER.crouch : sprint ? MOVER.sprint : MOVER.walk;
  const sin = Math.sin(f.yaw), cos = Math.cos(f.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  const wishX = (-sin * fwd + cos * str) * speed;
  const wishZ = (-cos * fwd - sin * str) * speed;
  accelerate(f, fwd || str ? wishX : 0, fwd || str ? wishZ : 0, dt);
  moveFighter(f, dt, world);
  return Math.hypot(f.vel.x, f.vel.z);
}

// Damage with armor absorbing half; returns true when the fighter died.
export function applyDamage(f, dmg) {
  let rest = dmg;
  if (f.armor > 0) {
    const absorbed = Math.min(f.armor, rest * 0.5);
    f.armor -= absorbed;
    rest -= absorbed;
  }
  f.hp -= rest;
  if (f.hp <= 0) { f.hp = 0; f.alive = false; return true; }
  return false;
}

export function giveWeapon(f, id) {
  const w = WEAPONS[id];
  f.weapons[id] = { mag: w.mag, reserve: w.reserve };
  f.current = id;
}
