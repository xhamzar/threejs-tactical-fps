// DUSK STRIKE — rounds, money and the bomb. A round is buy (10s) then live
// (100s): it ends by elimination, detonation, defusal or the clock. Winners
// take $1600, losers $800, kills pay $200 on the spot. First to 5 wins.
import { ROUND, ECONOMY, WEAPONS, GRENADE, SMOKE, FLASH, DEFUSE_KIT, ARMOR_PRICE, ARMOR_VALUE } from './config.js';
import { emit, aliveOf } from './state.js';
import { giveWeapon } from './player.js';

export function startMatch(state) {
  state.score.guard = 0;
  state.score.raiders = 0;
  state.round = 1;
  state.stats = { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, roundsWon: 0 };
  state.matchWinner = null;
  for (const f of state.fighters) {
    f.money = ECONOMY.start;
    f.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
    f.current = 'pistol';
    f.throwables = { frag: 0, smoke: 0, flash: 0 };
    f.throwable = 'frag';
    f.defuseKit = false;
    f.kills = 0; f.deaths = 0;
  }
  startRound(state);
}

export function startRound(state) {
  state.roundPhase = 'buy';
  state.buyLeft = ROUND.buyTime;
  state.timeLeft = ROUND.roundTime;
  state.roundResult = null;
  state.grenades.length = 0;
  state.noise.length = 0;
  state.smoke.length = 0;
  const site = Math.random() < 0.5 ? 'A' : 'B';
  const world = state._world;
  for (const f of state.fighters) {
    const spawns = world.spawns[f.team];
    const [sx, sz] = spawns[f._spawnIdx % spawns.length];
    f.pos.set(sx, 0, sz);
    f.vel.set(0, 0, 0);
    f.vy = 0; f.grounded = true; f.landDip = 0;
    f.yaw = f.team === 'guard' ? -Math.PI / 2 : Math.PI / 2;
    f.pitch = 0;
    f.alive = true;
    f.hp = 100;
    f.interact = 0; f.interactKind = null;
    f.reloading = 0; f.bloom = 0; f.cooldown = 0; f.sprayIdx = 0;
    if (f._diedLastRound) {
      // Death costs your kit: back to the pistol.
      f.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
      f.current = 'pistol';
      f.throwables = { frag: 0, smoke: 0, flash: 0 };
      f.throwable = 'frag';
      f.defuseKit = false;
      f.armor = 0;
    }
    f._diedLastRound = false;
    if (f.mesh) {
      f.mesh.visible = true;
      f.mesh.rotation.set(0, f.yaw, 0);
      f.mesh.position.copy(f.pos);
    }
    if (f.ai) {
      f.ai.state = 'buy';
      f.ai.target = null;
      f.ai.path = [];
      f.ai.blindUntil = 0;
      if (f.team === 'raiders') {
        f.ai.site = site;
        // Bots arm up as the match goes on.
        if (state.round >= 2 && !f.weapons.rifle) giveWeapon(f, 'rifle');
        if (state.round >= 3 && f.ai.role === 'attacker' && f.id % 2 === 0 && !f.weapons.shotgun) giveWeapon(f, 'shotgun');
        if (state.round >= 3 && f.ai.role === 'attacker' && f.throwables.frag === 0) f.throwables.frag = 1;
      } else {
        // Guards pick up a marksman rifle and a defuse kit later on.
        if (state.round >= 4 && f.ai.site === 'A' && !f.weapons.dmr) giveWeapon(f, 'dmr');
        if (state.round >= 3) f.defuseKit = true;
      }
    }
  }
  // The carrier bot holds the bomb.
  const carrier = state.fighters.find((f) => f.ai?.role === 'carrier');
  state.bomb = { state: 'carried', site: null, carrier, x: 0, z: 0, timer: 0, planter: null };
  emit(state, 'roundStart', { round: state.round, site });
}

function endRound(state, winner, reason) {
  if (state.roundPhase === 'end') return;
  state.roundPhase = 'end';
  state.score[winner]++;
  state.roundResult = { winner, reason };
  state._endTimer = ROUND.intermission;
  for (const f of state.fighters) {
    if (!f.alive) f._diedLastRound = true;
    if (f.isPlayer) {
      f.money += f.team === winner ? ECONOMY.win : ECONOMY.loss;
      if (f.team === winner) state.stats.roundsWon++;
    }
  }
  emit(state, 'roundEnd', { winner, reason });
}

export function buyItem(state, f, item) {
  if (state.roundPhase !== 'buy') return false;
  if (item === 'armor') {
    if (f.money < ARMOR_PRICE || f.armor >= ARMOR_VALUE) return false;
    f.money -= ARMOR_PRICE;
    f.armor = ARMOR_VALUE;
    return true;
  }
  if (item === 'defusekit') {
    if (f.team !== 'guard' || f.defuseKit || f.money < DEFUSE_KIT.price) return false;
    f.money -= DEFUSE_KIT.price;
    f.defuseKit = true;
    return true;
  }
  const throwable = { grenade: ['frag', GRENADE.price], smoke: ['smoke', SMOKE.price], flash: ['flash', FLASH.price] }[item];
  if (throwable) {
    const [kind, price] = throwable;
    const total = f.throwables.frag + f.throwables.smoke + f.throwables.flash;
    if (f.money < price || total >= 3 || f.throwables[kind] >= 2) return false;
    f.money -= price;
    f.throwables[kind] += 1;
    f.throwable = kind;
    return true;
  }
  const w = WEAPONS[item];
  if (!w || f.money < w.price || f.weapons[item]) return false;
  f.money -= w.price;
  giveWeapon(f, item);
  return true;
}

export function updateRounds(state, world, dt) {
  const bomb = state.bomb;
  if (state.roundPhase === 'buy') {
    state.buyLeft -= dt;
    if (state.buyLeft <= 0) {
      state.roundPhase = 'live';
      state.buyLeft = 0;
      emit(state, 'roundLive', {});
    }
    return;
  }
  if (state.roundPhase === 'end') {
    state._endTimer -= dt;
    if (state._endTimer > 0) return;
    if (state.score.guard >= ROUND.winsToWin || state.score.raiders >= ROUND.winsToWin) {
      state.matchWinner = state.score.guard >= ROUND.winsToWin ? 'guard' : 'raiders';
      state.phase = 'matchEnd';
      emit(state, 'matchEnd', { winner: state.matchWinner });
    } else {
      state.round++;
      startRound(state);
    }
    return;
  }
  // Live round.
  if (bomb.state !== 'planted') state.timeLeft -= dt;

  // Dropped bomb: a live raider walking over it picks it up.
  if (bomb.state === 'carried' && bomb.carrier && !bomb.carrier.alive) {
    bomb.state = 'dropped';
    bomb.x = bomb.carrier.pos.x; bomb.z = bomb.carrier.pos.z;
    bomb.carrier = null;
  }
  if (bomb.state === 'dropped') {
    for (const f of state.fighters) {
      if (f.team === 'raiders' && f.alive && Math.hypot(f.pos.x - bomb.x, f.pos.z - bomb.z) < 1.3) {
        bomb.state = 'carried';
        bomb.carrier = f;
        if (f.ai) { f.ai.role = 'carrier'; f.ai.state = 'move'; f.ai.path = []; }
        emit(state, 'bombPickup', { fighter: f });
        break;
      }
    }
  }

  // Plant / defuse progress for whoever is working on it.
  for (const f of state.fighters) {
    if (!f.alive || !f.interactKind) { if (f) f.interact = 0; continue; }
    if (f.interactKind === 'plant' && bomb.state === 'carried' && bomb.carrier === f) {
      const s = world.sites[f.ai?.site || 'A'];
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) < s.r) {
        f.interact += dt / ROUND.plantTime;
        if (f.interact >= 1) {
          bomb.state = 'planted';
          bomb.site = f.ai.site;
          bomb.x = f.pos.x; bomb.z = f.pos.z;
          bomb.timer = ROUND.fuseTime;
          bomb.planter = f;
          f.interact = 0; f.interactKind = null;
          f.money += ECONOMY.plant; // planting pays, win or lose
          emit(state, 'bombPlanted', { site: bomb.site });
        }
      } else f.interact = 0;
    } else if (f.interactKind === 'defuse' && bomb.state === 'planted' && f.team === 'guard') {
      const s = world.sites[bomb.site];
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) < s.r + 0.5) {
        const defuseTime = ROUND.defuseTime * (f.defuseKit ? DEFUSE_KIT.timeMult : 1);
        f.interact += dt / defuseTime;
        if (f.interact >= 1) {
          f.interact = 0; f.interactKind = null;
          f.money += ECONOMY.defuse; // defusing pays
          endRound(state, 'guard', 'Bomb defused');
          return;
        }
      } else f.interact = 0;
    } else f.interact = 0;
  }

  // Fuse countdown.
  if (bomb.state === 'planted') {
    const prev = Math.ceil(bomb.timer);
    bomb.timer -= dt;
    if (Math.ceil(bomb.timer) !== prev) emit(state, 'bombTick', { timer: bomb.timer });
    if (bomb.timer <= 0) {
      emit(state, 'explosion', { x: bomb.x, y: 0.5, z: bomb.z, owner: bomb.planter, big: true });
      endRound(state, 'raiders', 'Bomb detonated');
      return;
    }
  }

  // Elimination / time.
  const guards = aliveOf(state, 'guard');
  const raiders = aliveOf(state, 'raiders');
  if (guards === 0 && bomb.state !== 'planted') endRound(state, 'raiders', 'GUARD team eliminated');
  else if (guards === 0 && bomb.state === 'planted') { /* fuse decides */ }
  else if (raiders === 0 && bomb.state !== 'planted') endRound(state, 'guard', 'RAIDERS team eliminated');
  else if (raiders === 0 && bomb.state === 'planted') { /* defuse or fuse decides */ }
  else if (state.timeLeft <= 0 && bomb.state !== 'planted') endRound(state, 'guard', 'Time expired — site held');
}

export function onKill(state, killer, victim) {
  if (killer?.isPlayer) {
    killer.money += ECONOMY.kill;
    state.stats.kills++;
  }
  if (victim?.isPlayer) state.stats.deaths++;
  if (killer) killer.kills++;
  if (victim) victim.deaths++;
  if (victim) victim.interact = 0, victim.interactKind = null;
}
