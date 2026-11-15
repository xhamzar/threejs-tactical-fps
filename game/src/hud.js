// DUSK STRIKE — the HUD. One update per frame, but the DOM is touched only
// when a value actually changed: health, ammo, timer, score, money, bomb
// state, killfeed, hitmarker, damage direction and the round banner.
import { WEAPONS, ROUND } from './config.js';
import { aliveOf } from './state.js';

function $(id) { return document.getElementById(id); }

export class HUD {
  constructor(state) {
    this.state = state;
    this.el = {};
    for (const id of ['hud', 'crosshair', 'hitmarker', 'damage-vignette', 'damage-dir',
      'score-guard', 'score-raiders', 'pips-guard', 'pips-raiders', 'timer', 'round-label',
      'bomb-status', 'bomb-text', 'killfeed', 'health-num', 'health-bar', 'armor-num',
      'money', 'weapon-name', 'ammo-mag', 'ammo-reserve', 'grenades',
      'interact', 'interact-text', 'buy-hint', 'round-banner', 'banner-title',
      'banner-sub', 'reload-hint', 'flash-overlay']) {
      this.el[id] = $(id);
    }
    this.bombBar = document.querySelector('#bomb-bar i');
    this.interactBar = document.querySelector('#interact-bar i');
    this.healthBar = document.querySelector('#health-bar i');
    this.cache = {};
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.dmgTimer = 0;
    this.flashLevel = 0; // 0..1 white-out from a flashbang
  }

  set(id, text) {
    if (this.cache[id] !== text) {
      this.cache[id] = text;
      this.el[id].textContent = text;
    }
  }

  showHud(on) { this.el.hud.hidden = !on; }

  update(dt, player, speed) {
    const s = this.state;
    // Health / armor / money
    this.set('health-num', String(Math.ceil(player.hp)));
    this.el['health-num'].classList.toggle('low', player.hp <= 30);
    const hpW = `${Math.max(0, player.hp)}%`;
    if (this.cache.hpW !== hpW) { this.cache.hpW = hpW; this.healthBar.style.width = hpW; }
    this.set('armor-num', String(Math.floor(player.armor)));
    this.set('money', `$${player.money}`);
    // Weapon + ammo
    const w = WEAPONS[player.current];
    const ammo = player.weapons[player.current];
    this.set('weapon-name', w ? w.name : '—');
    this.set('ammo-mag', ammo ? String(ammo.mag) : '0');
    this.set('ammo-reserve', ammo ? `/ ${ammo.reserve}` : '');
    this.el['ammo-mag'].classList.toggle('empty', !ammo || ammo.mag === 0);
    // Throwables: counts per type, the selected one in brackets.
    const th = player.throwables || { frag: 0, smoke: 0, flash: 0 };
    const sel = player.throwable || 'frag';
    const fmt = (kind, label) => `${sel === kind ? '[' : ''}${label} ${th[kind]}${sel === kind ? ']' : ''}`;
    const parts = [fmt('frag', 'Frag'), fmt('smoke', 'Smoke'), fmt('flash', 'Flash')];
    if (player.defuseKit) parts.push('DEFUSE KIT');
    this.set('grenades', parts.join(' · '));
    this.el['reload-hint'].hidden = player.reloading <= 0;
    // Score / timer
    this.set('score-guard', String(s.score.guard));
    this.set('score-raiders', String(s.score.raiders));
    this.set('round-label', `ROUND ${s.round}`);
    const t = s.roundPhase === 'buy' ? Math.ceil(s.buyLeft) : Math.ceil(Math.max(0, s.timeLeft));
    const label = s.roundPhase === 'buy' ? 'BUY' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.set('timer', label);
    this.el.timer.classList.toggle('low', s.roundPhase === 'live' && t <= 15);
    // Alive pips
    this.setPips('pips-guard', 'guard');
    this.setPips('pips-raiders', 'raiders');
    // Bomb
    const b = s.bomb;
    if (b.state === 'planted') {
      this.el['bomb-status'].hidden = false;
      this.set('bomb-text', `BOMB PLANTED — SITE ${b.site} — ${b.timer.toFixed(1)}s`);
      this.bombBar.style.width = `${(b.timer / ROUND.fuseTime) * 100}%`;
    } else if (b.state === 'carried') {
      this.el['bomb-status'].hidden = false;
      this.set('bomb-text', 'BOMB CARRIED BY RAIDERS');
      this.bombBar.style.width = '100%';
    } else {
      this.el['bomb-status'].hidden = true;
    }
    this.el['buy-hint'].hidden = s.roundPhase !== 'buy' || !!s.buyOpen;
    // Crosshair: gap grows with speed and bloom; hidden when toggled off.
    const gap = 5 + Math.min(14, speed * 1.6) + player.bloom * 10;
    this.el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    this.el.crosshair.style.display = s.settings.crosshair ? '' : 'none';
    // Timers
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el['round-banner'].hidden = true;
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('on', 'head');
    }
    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) {
        this.el['damage-vignette'].classList.remove('on');
        this.el['damage-dir'].style.opacity = 0;
      }
    }
    // Flashbang white-out fades over ~2.5 seconds.
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 0.4);
      this.el['flash-overlay'].style.opacity = this.flashLevel.toFixed(2);
    }
  }

  flash(strength) {
    this.flashLevel = Math.max(this.flashLevel, Math.min(1, strength));
    this.el['flash-overlay'].style.opacity = this.flashLevel.toFixed(2);
  }

  setPips(id, team) {
    const n = aliveOf(this.state, team);
    if (this.cache[id] === n) return;
    this.cache[id] = n;
    const el = this.el[id];
    el.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement('i');
      if (i < n) pip.className = `alive ${team === 'guard' ? 'guard' : 'raider'}`;
      el.appendChild(pip);
    }
  }

  banner(title, sub = '', seconds = 2.4) {
    this.set('banner-title', title);
    this.set('banner-sub', sub);
    this.el['round-banner'].hidden = false;
    this.bannerTimer = seconds;
  }

  hitmarker(head) {
    this.el.hitmarker.classList.add('on');
    this.el.hitmarker.classList.toggle('head', head);
    this.hitTimer = 0.14;
  }

  damageFrom(angleRad) {
    // angleRad: direction of the shooter relative to the player's facing.
    this.el['damage-vignette'].classList.add('on');
    const el = this.el['damage-dir'];
    el.style.transform = `rotate(${angleRad}rad)`;
    el.style.opacity = 1;
    this.dmgTimer = 0.5;
  }

  killfeed(killer, victim, weapon, head) {
    const div = document.createElement('div');
    const wname = weapon === 'grenade' ? 'Frag Grenade' : (WEAPONS[weapon]?.name || weapon);
    div.innerHTML = `<span class="k">${killer}</span> ${head ? '◉' : '→'} <span class="v">${victim}</span> · ${wname}`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 6000);
  }

  setInteract(text, progress) {
    if (!text) { this.el.interact.hidden = true; return; }
    this.el.interact.hidden = false;
    this.set('interact-text', text);
    this.interactBar.style.width = `${Math.round(progress * 100)}%`;
  }
}
