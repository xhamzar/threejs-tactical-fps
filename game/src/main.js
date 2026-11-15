// DUSK STRIKE — bootstrap and game loop. Loading stages into the menu,
// the menu orbits the harbor, Play starts a 3v3 match. The simulation runs
// at a fixed 60 Hz step, decoupled from rendering; the HUD, menus, sound
// and effects all hang off the event bus in state.js.
//
// ?shot=menu|combat|buy|bombsite stages a screenshot: it starts the game,
// places fighters and cameras, and sets window.__shotReady when staged.
import * as THREE from 'three';
import { WEAPONS, ROUND, ECONOMY, BOT_NAMES } from './config.js';
import { createState, on, playerOf } from './state.js';
import { makeTextures } from './textures.js';
import { SoundBank } from './audio.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { createFighter, updatePlayer, eyePos, giveWeapon } from './player.js';
import { startReload, updateReload, switchWeapon, throwGrenade, cycleThrowable, buildViewModel, updateViewModel } from './weapons.js';
import { fireFighter, updateGrenades } from './combat.js';
import { Effects } from './effects.js';
import { createBotAI, updateBot, buildBotMesh } from './bots.js';
import { startMatch, updateRounds, buyItem, onKill } from './rounds.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // menu | combat | buy | bombsite | null
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const state = createState();
const input = new Input();
const sounds = new SoundBank(state.settings);
let renderer, scene, camera, world, hud, menus, effects, viewModel;
let bombMesh, bombLight;
let orbitT = 0;
let shotDone = false;
// Camera feel state: head bob, strafe lean, sprint FOV, crouch dip.
let bobPhase = 0, prevCrouch = false, crouchDip = 0, fovCur = 75;
let stepAcc = 0, lastLookDX = 0, lastLookDY = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function init() {
  menus = new Menus(state, {
    onPlay: () => playGame(),
    onResume: () => resumeGame(),
    onRestart: () => { startMatch(state); menus.show('none'); hud.showHud(true); lockPointer(); },
    onMenu: () => toMenu(),
    onBuy: (id) => {
      const p = playerOf(state);
      if (buyItem(state, p, id)) { sounds.buy(); menus.renderBuy(p, state.buyLeft); }
      else sounds.denied();
    },
    onSettings: () => { sounds.setVolume(); applyQuality(); },
  });
  menus.show('loading');

  menus.setProgress(0.1, 'Painting textures…');
  await sleep(120);
  const textures = makeTextures();
  menus.setProgress(0.35, 'Building Pier 7…');
  await sleep(120);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  applyQuality();

  world = buildWorld(scene, textures, state.settings.quality);
  state._world = world;
  menus.setProgress(0.6, 'Recruiting bots…');
  await sleep(120);

  createFighters();
  effects = new Effects(scene);
  viewModel = buildViewModel(camera);
  hud = new HUD(state);
  wireEvents();
  menus.setProgress(0.85, 'Warming up audio…');
  await sleep(150);
  buildBombMesh();
  menus.setProgress(1, 'Ready');
  await sleep(250);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  input.onLockChange = (locked) => {
    // Losing the lock pauses the game — unless a menu is open, because the
    // buy menu unlocks the pointer on purpose (Escape exits lock first, so
    // the pause key still reaches this handler with no menu open).
    if (!locked && state.phase === 'playing' && !SHOT && menus.current === 'none') pauseGame();
    if (locked && state.phase === 'paused') {
      state.phase = 'playing';
      menus.show('none');
      hud.showHud(true);
    }
  };

  window.__gameReady = true;
  // Debug hook for automated playtests: a read-only snapshot of the match.
  window.__dusk = {
    state: () => ({
      phase: state.phase, roundPhase: state.roundPhase, round: state.round,
      score: { ...state.score }, timeLeft: +state.timeLeft.toFixed(1),
      bomb: state.bomb.state, bombSite: state.bomb.site, menu: menus.current,
      buyLeft: +state.buyLeft.toFixed(1), stats: { ...state.stats },
      pointerLocked: !!document.pointerLockElement,
      smoke: state.smoke.length,
      drawCalls: renderer ? renderer.info.render.calls : 0,
      triangles: renderer ? renderer.info.render.triangles : 0,
      throwables: (() => { const p = playerOf(state); return { ...p.throwables, selected: p.throwable, kit: p.defuseKit }; })(),
      fighters: state.fighters.map((f) => ({
        name: f.name, team: f.team, alive: f.alive, hp: Math.round(f.hp),
        x: +f.pos.x.toFixed(1), z: +f.pos.z.toFixed(1),
        ai: f.ai ? f.ai.state : 'player', money: f.money || 0,
        mag: f.weapons[f.current].mag, reserve: f.weapons[f.current].reserve,
        kills: f.kills, deaths: f.deaths,
        tgt: f.ai && f.ai.target ? f.ai.target.name : null,
        react: f.ai ? +f.ai.reaction.toFixed(2) : null,
        burst: f.ai ? +f.ai.burst.toFixed(2) : null,
        bPause: f.ai ? +f.ai.burstPause.toFixed(2) : null,
        cd: +f.cooldown.toFixed(2),
        path: f.ai ? `${f.ai.pathIdx}/${f.ai.path.join(',')}` : null,
        vel: `${f.vel.x.toFixed(1)},${f.vel.z.toFixed(1)}`,
        yaw: +f.yaw.toFixed(2),
      })),
    }),
    errors: () => window.__errors,
  };
  if (SHOT) stageShot();
  else { state.phase = 'menu'; menus.show('menu'); }
  requestAnimationFrame(loop);
}

function applyQuality() {
  if (!renderer) return;
  const high = state.settings.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 2 : 1.25));
  renderer.shadowMap.enabled = high;
  if (world) {
    world.group.traverse((o) => { if (o.isDirectionalLight) o.castShadow = high; });
  }
}

function createFighters() {
  const player = createFighter({ team: 'guard', name: 'You', isPlayer: true });
  player._spawnIdx = 0;
  player.money = ECONOMY.start;
  state.fighters.push(player);
  BOT_NAMES.guard.forEach((name, i) => {
    const b = createFighter({ team: 'guard', name });
    b._spawnIdx = i + 1;
    b.ai = createBotAI('defender', i === 0 ? 'A' : 'B');
    b.mesh = buildBotMesh('guard');
    scene.add(b.mesh);
    state.fighters.push(b);
  });
  BOT_NAMES.raiders.forEach((name, i) => {
    const b = createFighter({ team: 'raiders', name });
    b._spawnIdx = i;
    b.ai = createBotAI(i === 0 ? 'carrier' : 'attacker', 'A');
    b.mesh = buildBotMesh('raiders');
    scene.add(b.mesh);
    state.fighters.push(b);
  });
}

function buildBombMesh() {
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5, metalness: 0.5 }),
  );
  bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  bombLight.position.set(0.16, 0.15, 0);
  bombMesh.add(body, bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// ---- Flow ----
function lockPointer() {
  try {
    const p = document.body.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* headless or denied: the game still runs */ }
}

function playGame() {
  sounds.ensure();
  sounds.click();
  startMatch(state);
  state.phase = 'playing';
  menus.show('none');
  hud.showHud(true);
  lockPointer();
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  menus.show('pause');
  input.fireHeld = false;
}

function resumeGame() {
  sounds.click();
  lockPointer();
  // The lock-change handler flips phase back to playing.
  if (!input.locked) { state.phase = 'playing'; menus.show('none'); hud.showHud(true); }
}

function toMenu() {
  state.phase = 'menu';
  menus.show('menu');
  hud.showHud(false);
  input.unlock();
}

function openBuy() {
  if (state.roundPhase !== 'buy' || state.phase !== 'playing') return;
  state.buyOpen = true;
  menus.renderBuy(playerOf(state), state.buyLeft);
  menus.show('buy');
  input.unlock();
  input.fireHeld = false;
}

function closeBuy() {
  if (menus.current !== 'buy') return;
  state.buyOpen = false;
  menus.show('none');
  lockPointer();
}

// ---- Events: HUD, sound and effects react; gameplay stays pure. ----
function wireEvents() {
  on(state, 'roundStart', ({ round }) => {
    if (menus.current === 'roundend') menus.show('none');
    hud.banner(`ROUND ${round}`, 'Defend Sites A and B');
  });
  on(state, 'roundLive', () => hud.banner('GO!', '', 0.9));
  on(state, 'roundEnd', ({ winner, reason }) => {
    const p = playerOf(state);
    if (winner === p.team) sounds.roundWin(); else sounds.roundLose();
    setTimeout(() => { if (state.phase === 'playing') menus.showRoundEnd(state.roundResult, state.score); }, 900);
  });
  on(state, 'matchEnd', ({ winner }) => {
    input.unlock();
    hud.showHud(false);
    menus.showMatchEnd(winner, state.stats, state.score);
  });
  on(state, 'bombPlanted', ({ site }) => {
    hud.banner(`BOMB PLANTED — SITE ${site}`, 'Defuse it before the fuse runs out!', 3);
    sounds.plant();
  });
  on(state, 'bombTick', () => sounds.beep());
  on(state, 'bombPickup', () => {});
  on(state, 'hit', ({ shooter, victim, head, died }) => {
    const p = playerOf(state);
    if (shooter === p) {
      state.stats.hits++;
      if (head) state.stats.headshots++;
      hud.hitmarker(head);
      sounds.hitmarker(head);
    }
    if (victim === p) {
      const dx = shooter.pos.x - p.pos.x, dz = shooter.pos.z - p.pos.z;
      const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
      hud.damageFrom(ang);
    }
  });
  on(state, 'kill', ({ shooter, victim, weapon, head }) => {
    onKill(state, shooter, victim);
    hud.killfeed(shooter ? shooter.name : '—', victim.name, weapon, head);
    if (victim === playerOf(state)) hud.banner('YOU WERE ELIMINATED', 'Back next round', 2.2);
  });
  on(state, 'shotFired', ({ fighter, shot, result }) => {
    const p = playerOf(state);
    const dist = Math.hypot(fighter.pos.x - p.pos.x, fighter.pos.z - p.pos.z);
    sounds.shot(shot.weapon, fighter !== p && dist > 12);
    if (fighter === p) state.stats.shots++;
    effects.tracer({ x: shot.ox, y: shot.oy, z: shot.oz }, result.end);
    effects.muzzleSmoke({ x: shot.ox, y: shot.oy, z: shot.oz });
    if (result.hit) { effects.bloodAt(result.end, 5); effects.sparksAt(result.end, 4); }
    else if (result.wall) effects.sparksAt(result.end, 4);
  });
  on(state, 'dryfire', ({ fighter }) => { if (fighter.isPlayer) sounds.dryFire(); });
  on(state, 'explosion', ({ x, y, z }) => {
    effects.explosion({ x, y, z });
    sounds.explosion();
  });
  on(state, 'smoke', ({ x, y, z }) => {
    effects.smokeCloud({ x, y, z });
    sounds.smokeHiss();
  });
  on(state, 'flash', ({ x, y, z }) => {
    effects.flashAt({ x, y, z });
    sounds.flashRing();
  });
  on(state, 'playerFlashed', ({ strength }) => hud.flash(strength));
}

// ---- Screenshot staging (?shot=...) ----
function stageShot() {
  state.phase = 'playing';
  hud.showHud(true);
  startMatch(state);
  const p = playerOf(state);
  const bots = state.fighters.filter((f) => f.ai);
  const raiders = bots.filter((f) => f.team === 'raiders');
  const guards = bots.filter((f) => f.team === 'guard');
  if (SHOT === 'menu') {
    state.phase = 'menu';
    hud.showHud(false);
    menus.show('menu');
    syncOnce();
    return;
  }
  menus.show('none');
  if (SHOT === 'buy') {
    state.buyLeft = 8;
    p.money = 4000; // stage with a full wallet so every new item shows priced
    openBuy();
    syncOnce();
    return;
  }
  // combat + bombsite: jump straight into the live round.
  state.roundPhase = 'live';
  state.timeLeft = 85;
  for (const f of bots) { f.ai.state = 'move'; f.ai.path = []; }
  if (SHOT === 'combat') {
    giveWeapon(p, 'shotgun');
    p.pos.set(-5.5, 0, 2.5); p.yaw = -Math.PI / 2; p.pitch = 0;
    raiders[0].pos.set(2, 0, 0); raiders[0].yaw = Math.PI / 2;
    raiders[1].pos.set(7, 0, -3); raiders[1].yaw = Math.PI / 2;
    raiders[2].pos.set(10, 0, 4); raiders[2].yaw = Math.PI / 2;
    guards[0].pos.set(-2, 0, 5.5); guards[0].yaw = -Math.PI / 2;
    for (const r of raiders) { r.ai.target = p; r.ai.state = 'engage'; r.ai.reaction = 2.5; }
  } else if (SHOT === 'bombsite') {
    state.bomb = { state: 'planted', site: 'A', carrier: null, x: -17.5, z: -14.5, timer: 25, planter: raiders[0] };
    p.pos.set(-14.5, 0, -11); p.yaw = 0.71; p.pitch = -0.08;
    raiders[0].pos.set(-16.5, 0, -15.5); raiders[0].yaw = -2.72;
    guards[0].pos.set(-17.5, 0, -12.2); guards[0].yaw = 0.71;
  }
  syncOnce();
}

// One sync pass for screenshot staging: with the sim frozen, the camera,
// meshes and HUD would otherwise never reflect the staged state. The 3s
// HUD tick also expires the ROUND banner so it never covers the frame.
function syncOnce() {
  syncMeshes(0);
  syncBomb();
  syncCamera(0);
  hud.update(3, playerOf(state), 0);
}

// ---- Fixed-step simulation ----
function sim(dt) {
  state.time += dt;
  world.update(dt, state.time);
  updateRounds(state, world, dt);
  if (state.phase === 'matchEnd') return;
  const p = playerOf(state);
  const tick = input.drain();
  const frozen = state.roundPhase === 'end';

  // Player
  let speed = 0;
  if (state.phase === 'playing' && p.alive && !frozen) {
    speed = updatePlayer(p, input, tick, dt, world, state.settings.sensitivity);
    lastLookDX = tick.dx; lastLookDY = tick.dy;
    // Footsteps + sprint dust, paced by distance travelled.
    if (speed > 2.5) {
      stepAcc += speed * dt;
      if (stepAcc > 2.4) {
        stepAcc = 0;
        sounds.step();
        if (p.sprinting) effects.dustAt({ x: p.pos.x, y: 0, z: p.pos.z }, 1);
      }
    }
    if (tick.pressed.has('KeyR')) { if (startReload(state, p)) sounds.reload(); }
    if (tick.pressed.has('Digit1')) switchWeapon(state, p, 'pistol');
    if (tick.pressed.has('Digit2')) switchWeapon(state, p, 'rifle');
    if (tick.pressed.has('Digit3')) switchWeapon(state, p, 'smg');
    if (tick.pressed.has('Digit4')) switchWeapon(state, p, 'shotgun');
    if (tick.pressed.has('Digit5')) switchWeapon(state, p, 'dmr');
    if (tick.pressed.has('KeyQ') || tick.wheel !== 0) {
      const owned = Object.keys(p.weapons);
      const i = owned.indexOf(p.current);
      switchWeapon(state, p, owned[(i + 1) % owned.length]);
    }
    if (tick.pressed.has('KeyT')) cycleThrowable(p);
    if (tick.pressed.has('KeyG')) {
      const g = throwGrenade(state, p);
      if (g) {
        const colors = { frag: 0x2a2a22, smoke: 0x3a4a3a, flash: 0x9a9a92 };
        g.mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 8, 8),
          new THREE.MeshStandardMaterial({ color: colors[g.kind] ?? 0x2a2a22, roughness: 0.6, metalness: 0.4 }),
        );
        g.mesh.position.set(g.x, g.y, g.z);
        scene.add(g.mesh);
      }
    }
    if (tick.pressed.has('KeyB')) {
      if (menus.current === 'buy') closeBuy();
      else openBuy();
    }
    // Interact: hold E near the planted bomb to defuse.
    p.interactKind = null;
    if (input.held('KeyE') && state.bomb.state === 'planted') {
      const s = world.sites[state.bomb.site];
      if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + 0.5) p.interactKind = 'defuse';
    }
    const firing = input.fireHeld && menus.current !== 'buy';
    fireFighter(state, world, p, firing, dt, speed);
    updateReload(state, p, dt);
    p.bloom = Math.max(0, p.bloom - dt * 1.4);
  } else if (state.phase === 'playing' && !p.alive) {
    input.drain();
  }
  if (tick.pressed.has('Escape') && menus.current === 'buy') closeBuy();
  if (state.roundPhase !== 'buy' && menus.current === 'buy') closeBuy();

  // Bots
  if (state.phase === 'playing' && !frozen) {
    for (const f of state.fighters) if (f.ai) updateBot(state, world, f, dt);
  }
  updateGrenades(state, world, dt);
  effects.update(dt);
  syncMeshes(dt);
  syncBomb();
  syncCamera(dt);
  hud.update(dt, p, speed);
  updateInteractPrompt(p);
}

function updateInteractPrompt(p) {
  if (state.bomb.state === 'planted' && p.alive) {
    const s = world.sites[state.bomb.site];
    if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + 1.5) {
      hud.setInteract('Hold E to defuse the bomb', p.interact);
      return;
    }
  }
  hud.setInteract(null, 0);
}

function syncCamera(dt) {
  const p = playerOf(state);
  if (state.phase === 'menu' || state.phase === 'loading') {
    orbitT += dt * 0.07;
    camera.position.set(Math.cos(orbitT) * 27, 15, Math.sin(orbitT) * 27);
    camera.lookAt(0, 0, 0);
    return;
  }
  const eye = eyePos(p);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  // Head bob: two steps per cycle, stronger when sprinting, softer crouched.
  if (speed > 0.5 && p.alive) bobPhase += dt * (4 + speed * 1.4);
  const speedK = Math.min(1, speed / 5.5);
  const bobAmp = speedK * (p.crouching ? 0.008 : 0.02);
  const bobY = Math.sin(bobPhase * 2) * bobAmp;
  // Crouch dip: a small extra drop the moment you duck.
  if (p.crouching && !prevCrouch) crouchDip = 0.09;
  prevCrouch = p.crouching;
  crouchDip = Math.max(0, crouchDip - dt * 0.35);
  camera.position.set(eye.x, p.alive ? eye.y + bobY - crouchDip : 0.6, eye.z);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  // Strafe lean + bob roll: the camera tilts into sideways movement.
  const strafeVel = p.vel.x * Math.cos(p.yaw) - p.vel.z * Math.sin(p.yaw);
  const lean = Math.max(-0.02, Math.min(0.02, -strafeVel * 0.004));
  camera.rotation.z = lean + Math.sin(bobPhase) * 0.003 * speedK;
  // Sprint FOV kick: a touch wider while sprinting, eased back after.
  const fovTarget = p.sprinting && speed > 4.5 ? 79 : 75;
  fovCur += (fovTarget - fovCur) * Math.min(1, dt * 6);
  if (Math.abs(camera.fov - fovCur) > 0.05) {
    camera.fov = fovCur;
    camera.updateProjectionMatrix();
  }
  updateViewModel(viewModel, p, dt, speed, input.fireHeld, lastLookDX, lastLookDY);
}

function syncMeshes(dt) {
  for (const f of state.fighters) {
    if (!f.mesh) continue;
    f.mesh.position.copy(f.pos);
    if (f.alive) {
      f.mesh.rotation.set(0, f.yaw, 0);
      f.mesh.scale.y = f.crouching ? 0.78 : 1;
      f._deathT = 0;
      // Walk cycle: legs swing with speed, torso leans into the run.
      const u = f.mesh.userData;
      if (u && u.legL) {
        const speed = Math.hypot(f.vel.x, f.vel.z);
        if (speed > 0.5) {
          u.walkPhase += dt * (4 + speed * 1.2);
          const swing = Math.sin(u.walkPhase) * 0.5 * Math.min(1, speed / 4);
          u.legL.rotation.x = swing;
          u.legR.rotation.x = -swing;
          u.torso.rotation.x = Math.min(1, speed / 5) * 0.08;
        } else {
          u.legL.rotation.x *= 0.8;
          u.legR.rotation.x *= 0.8;
          u.torso.rotation.x *= 0.8;
        }
      }
    } else {
      // Fall over and stay down until the next round.
      f._deathT = Math.min(1, (f._deathT || 0) + dt * 3);
      f.mesh.rotation.x = -Math.PI / 2 * f._deathT;
      f.mesh.position.y = 0.15 * f._deathT;
    }
  }
}

function syncBomb() {
  const b = state.bomb;
  if (!bombMesh) return;
  if (b.state === 'carried' && b.carrier) {
    bombMesh.visible = true;
    bombMesh.position.set(b.carrier.pos.x, 1.35, b.carrier.pos.z);
    bombLight.material.color.setHex(0xff2222);
  } else if (b.state === 'dropped' || b.state === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(b.x, 0.14, b.z);
    const blink = b.state === 'planted' ? (Math.sin(state.time * 6) > 0 ? 0xff2222 : 0x441111) : 0xff2222;
    bombLight.material.color.setHex(blink);
  } else {
    bombMesh.visible = false;
  }
}

// ---- Main loop: fixed steps, then one render. ----
let last = performance.now();
let acc = 0;
let shotFrames = 0;
// Main loop: fixed-step simulation (60 Hz) decoupled from rendering.
// The sim advances in STEP-sized chunks; rendering just draws the latest
// state, so game speed never depends on frame rate.
function loop(now) {
  requestAnimationFrame(loop);
  const frame = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = state.phase === 'playing' || state.phase === 'paused';
  if (state.phase === 'menu' || state.phase === 'loading') {
    orbitT += frame * 0.07;
    camera.position.set(Math.cos(orbitT) * 27, 15, Math.sin(orbitT) * 27);
    camera.lookAt(0, 0, 0);
    world.update(frame, state.time);
    renderer.render(scene, camera);
  } else if (running) {
    acc += frame;
    let n = 0;
    // Screenshot mode freezes the sim: the staged frame never changes.
    while (acc >= STEP && n < 5) {
      if (!SHOT && state.phase === 'playing') sim(STEP);
      acc -= STEP;
      n++;
    }
    if (state.phase === 'paused') hud.update(frame, playerOf(state), 0);
    renderer.render(scene, camera);
  } else if (state.phase === 'matchEnd') {
    renderer.render(scene, camera);
  }
  // Screenshot readiness: staged + a few rendered frames.
  if (SHOT && !shotDone) {
    shotFrames++;
    if (shotFrames > 15) {
      shotDone = true;
      window.__shotReady = true;
      document.body.dataset.shotReady = '1';
    }
  }
}

init().catch((e) => {
  window.__errors.push(String(e?.message || e));
  console.error(e);
});
