// DUSK STRIKE — weapons: fire, spread, recoil, reload, switching, and the
// first-person view model. Spread grows with movement and with sustained
// fire (bloom), so stopping to aim pays; recoil kicks the shooter's pitch.
import * as THREE from 'three';
import { WEAPONS, GRENADE, SMOKE, FLASH } from './config.js';
import { eyePos } from './player.js';

function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

const FUSES = { frag: GRENADE.fuse, smoke: SMOKE.fuse, flash: FLASH.fuse };

// One trigger pull. Returns a shot {ox,oy,oz,dx,dy,dz,weapon} or null.
export function tryFire(state, f, wantFire, dt, speed) {
  const w = WEAPONS[f.current];
  if (!w || f.reloading > 0 || !f.alive) return null;
  f.cooldown -= dt;
  if (!wantFire || f.cooldown > 0) return null;
  const ammo = f.weapons[f.current];
  if (!ammo || ammo.mag <= 0) {
    f.cooldown = 0.25;
    if (f.isPlayer) startReload(state, f);
    return { dry: true, weapon: f.current };
  }
  f.cooldown = 60 / w.rpm;
  ammo.mag -= 1;
  f.bloom = Math.min(1, f.bloom + (f.current === 'rifle' ? 0.14 : f.current === 'shotgun' ? 0.35 : 0.09));
  // Spread: base + movement + bloom; crouching steadies the shot.
  const move = Math.min(1, speed / 5.5);
  let spread = w.spread + w.moveSpread * move + w.recoil * f.bloom * 2.2;
  if (f.crouching) spread *= 0.6;
  const eye = eyePos(f);
  const cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  const dir = new THREE.Vector3(-sy * cp, sp, -cy * cp);
  // Random cone around the aim direction.
  const right = new THREE.Vector3(-cy, 0, sy);
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  dir.addScaledVector(right, gauss() * spread).addScaledVector(up, gauss() * spread).normalize();
  // Recoil: pitch kick (player feels it; bots carry it as bloom only).
  if (f.isPlayer) {
    f.pitch = Math.min(1.5, f.pitch + w.recoil * (0.7 + Math.random() * 0.6));
    f.yaw += gauss() * w.recoil * 0.3;
  }
  f.flash = 0.045;
  const shot = { ox: eye.x, oy: eye.y, oz: eye.z, dx: dir.x, dy: dir.y, dz: dir.z, weapon: f.current };
  if (w.pellets) shot.pellets = w.pellets; // combat resolves one ray per pellet
  return shot;
}

export function startReload(state, f) {
  const w = WEAPONS[f.current];
  const ammo = f.weapons[f.current];
  if (!w || !ammo || f.reloading > 0 || ammo.reserve <= 0 || ammo.mag >= w.mag) return false;
  f.reloading = w.reload;
  f.reloadWeapon = f.current;
  return true;
}

export function updateReload(state, f, dt) {
  if (f.reloading <= 0) return;
  f.reloading -= dt;
  if (f.reloading > 0) return;
  const w = WEAPONS[f.reloadWeapon];
  const ammo = f.weapons[f.reloadWeapon];
  if (w && ammo) {
    const need = w.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }
  f.reloadWeapon = null;
}

export function switchWeapon(state, f, id) {
  if (!f.weapons[id] || f.current === id) return false;
  f.current = id;
  f.reloading = 0;
  f.reloadWeapon = null;
  f.cooldown = Math.max(f.cooldown, 0.15);
  return true;
}

export function throwGrenade(state, f) {
  const kind = f.throwable || 'frag';
  if (!f.throwables || f.throwables[kind] <= 0 || !f.alive) return null;
  f.throwables[kind] -= 1;
  const eye = eyePos(f);
  const cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  const g = {
    kind,
    x: eye.x, y: eye.y, z: eye.z,
    vx: -sy * cp * 13 + f.vel.x * 0.4,
    vy: sp * 13 + 3.5,
    vz: -cy * cp * 13 + f.vel.z * 0.4,
    fuse: FUSES[kind] ?? GRENADE.fuse, owner: f, mesh: null,
  };
  state.grenades.push(g);
  return g;
}

// Cycle the selected throwable to the next type the fighter actually owns.
export function cycleThrowable(f) {
  const order = ['frag', 'smoke', 'flash'];
  const cur = order.indexOf(f.throwable || 'frag');
  for (let i = 1; i <= order.length; i++) {
    const next = order[(cur + i) % order.length];
    if (f.throwables && f.throwables[next] > 0) { f.throwable = next; return next; }
  }
  return f.throwable;
}

// ---- First-person view model: a simple gun of boxes, bottom-right. ----
// Each weapon gets its own silhouette: the shotgun is thick and short, the
// DMR long with a scope tube. Parts are hidden/shown per weapon — no
// rebuild, no allocation during play.
export function buildViewModel(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.5, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.38);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), grip);
  handle.position.set(0, -0.13, 0.12);
  handle.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), dark);
  sight.position.set(0, 0.09, -0.1);
  // DMR scope tube (hidden unless the marksman rifle is out).
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), dark);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.11, -0.08);
  scope.visible = false;
  // Shotgun pump grip (hidden unless the shotgun is out).
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), grip);
  pump.position.set(0, -0.05, -0.32);
  pump.visible = false;
  group.add(body, barrel, handle, sight, scope, pump);
  group.position.set(0.28, -0.26, -0.5);
  // Muzzle flash: additive sprite + light at the barrel tip.
  const flashMat = new THREE.SpriteMaterial({ color: 0xffc46a, transparent: true, opacity: 0, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.3);
  flash.position.set(0, 0.03, -0.55);
  group.add(flash);
  const light = new THREE.PointLight(0xffb066, 0, 7);
  light.position.set(0, 0, -0.5);
  group.add(light);
  camera.add(group);
  return { group, flashMat, light, kick: 0, bobT: 0, barrel, scope, pump, swayX: 0, swayY: 0, weapon: null };
}

export function updateViewModel(vm, f, dt, speed, firing, lookDX = 0, lookDY = 0) {
  // Per-weapon silhouette, applied only when the weapon changes.
  if (vm.weapon !== f.current) {
    vm.weapon = f.current;
    const isShotgun = f.current === 'shotgun';
    const isDmr = f.current === 'dmr';
    vm.scope.visible = isDmr;
    vm.pump.visible = isShotgun;
    vm.barrel.scale.set(isShotgun ? 1.6 : 1, 1, isDmr ? 1.7 : isShotgun ? 0.8 : 1);
    vm.barrel.position.z = isDmr ? -0.48 : isShotgun ? -0.3 : -0.38;
  }
  // Walk bob: faster steps when sprinting, softer when crouched.
  const bobRate = 2 + speed * 1.6;
  vm.bobT += dt * bobRate;
  const bobAmp = Math.min(1, speed / 5) * (f.crouching ? 0.004 : 0.008);
  // Look sway: the gun lags a hair behind fast mouse flicks, then settles.
  vm.swayX += ((-lookDX * 0.00035) - vm.swayX) * Math.min(1, dt * 10);
  vm.swayY += ((lookDY * 0.00035) - vm.swayY) * Math.min(1, dt * 10);
  vm.group.position.y = -0.26 + Math.sin(vm.bobT * 2) * bobAmp + vm.swayY - (f.landDip || 0) * 0.6;
  vm.group.position.x = 0.28 + Math.cos(vm.bobT) * bobAmp * 0.6 + vm.swayX;
  const sv = f.vel.x * Math.cos(f.yaw) - f.vel.z * Math.sin(f.yaw); // strafe tilt
  vm.group.rotation.z = vm.swayX * 0.35 - sv * 0.004;
  const w = WEAPONS[f.current];
  if (firing) vm.kick = (w ? w.kick : 0.03) * 1.8;
  vm.kick = Math.max(0, vm.kick - dt * 0.5);
  vm.group.position.z = -0.5 + vm.kick + (f.reloading > 0 ? 0.12 : 0);
  vm.group.rotation.x = vm.kick * 1.5 + (f.reloading > 0 ? 0.5 : 0);
  const on = f.flash > 0;
  vm.flashMat.opacity = on ? 0.95 : 0;
  vm.light.intensity = on ? 2.5 : 0;
  if (f.flash > 0) f.flash -= dt;
}
