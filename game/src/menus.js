// DUSK STRIKE — screens: loading, main menu, how to play, settings, pause,
// buy menu, round end, match end. One show() switches screens; the buy
// grid is rendered from the weapon config so prices never drift from code.
import { WEAPONS, GRENADE, ARMOR_PRICE, TIPS } from './config.js';
import { saveSettings } from './state.js';

function $(id) { return document.getElementById(id); }

const SCREENS = ['loading', 'menu', 'howto', 'settings', 'pause', 'buy', 'roundend', 'matchend'];

const BUY_ITEMS = [
  { id: 'rifle', name: 'AR-7 Rifle', desc: 'High damage, heavy recoil. The workhorse.', price: WEAPONS.rifle.price },
  { id: 'smg', name: 'K-9 SMG', desc: 'Very fast fire rate, best up close.', price: WEAPONS.smg.price },
  { id: 'grenade', name: 'Frag Grenade', desc: 'Area damage. Loud — bots hear it.', price: GRENADE.price },
  { id: 'armor', name: 'Kevlar Armor', desc: 'Absorbs half of incoming damage.', price: ARMOR_PRICE },
];

export class Menus {
  constructor(state, cb) {
    this.state = state;
    this.cb = cb; // {onPlay,onResume,onRestart,onMenu,onBuy,onQuality,backFrom}
    this.current = 'loading';
    this.tipIdx = 0;
    this.tipTimer = null;
    $('btn-play').onclick = () => { cb.onPlay(); };
    $('btn-howto').onclick = () => this.show('howto');
    $('btn-howto-back').onclick = () => this.show(this.cb.backFrom || 'menu');
    $('btn-settings').onclick = () => { this.cb.backFrom = 'menu'; this.show('settings'); };
    $('btn-settings-back').onclick = () => this.show(this.cb.backFrom || 'menu');
    $('btn-resume').onclick = () => cb.onResume();
    $('btn-restart').onclick = () => cb.onRestart();
    $('btn-menu').onclick = () => cb.onMenu();
    $('btn-pause-settings').onclick = () => { this.cb.backFrom = 'pause'; this.show('settings'); };
    $('btn-again').onclick = () => cb.onRestart();
    $('btn-matchend-menu').onclick = () => cb.onMenu();
    this.bindSettings();
  }

  show(name) {
    this.current = name;
    for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
    if (name === 'loading') this.startTips();
    else this.stopTips();
  }

  // --- Loading screen ---
  setProgress(pct, status) {
    document.querySelector('#load-bar i').style.width = `${Math.round(pct * 100)}%`;
    $('load-status').textContent = status;
  }

  startTips() {
    this.tipIdx = Math.floor(Math.random() * TIPS.length);
    $('load-tip').textContent = `Tip: ${TIPS[this.tipIdx]}`;
    this.stopTips();
    this.tipTimer = setInterval(() => {
      this.tipIdx = (this.tipIdx + 1) % TIPS.length;
      $('load-tip').textContent = `Tip: ${TIPS[this.tipIdx]}`;
    }, 2600);
  }

  stopTips() {
    if (this.tipTimer) { clearInterval(this.tipTimer); this.tipTimer = null; }
  }

  // --- Settings ---
  bindSettings() {
    const s = this.state.settings;
    const sens = $('set-sens'), master = $('set-master'), sfx = $('set-sfx');
    const quality = $('set-quality'), cross = $('set-crosshair');
    sens.value = s.sensitivity; master.value = s.master; sfx.value = s.sfx;
    quality.value = s.quality; cross.checked = s.crosshair;
    const refresh = () => {
      $('set-sens-v').textContent = `${Number(sens.value).toFixed(1)}x`;
      $('set-master-v').textContent = `${Math.round(master.value * 100)}%`;
      $('set-sfx-v').textContent = `${Math.round(sfx.value * 100)}%`;
    };
    refresh();
    const save = () => {
      s.sensitivity = Number(sens.value);
      s.master = Number(master.value);
      s.sfx = Number(sfx.value);
      s.quality = quality.value;
      s.crosshair = cross.checked;
      saveSettings(s);
      refresh();
      if (this.cb.onSettings) this.cb.onSettings();
    };
    for (const el of [sens, master, sfx, quality, cross]) el.addEventListener('input', save);
  }

  // --- Buy menu ---
  renderBuy(player, buyLeft) {
    $('buy-money').textContent = `$${player.money}`;
    $('buy-time').textContent = String(Math.ceil(Math.max(0, buyLeft)));
    const grid = $('buy-grid');
    grid.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const owned = item.id === 'armor' ? player.armor > 0 : item.id === 'grenade' ? player.grenades >= 2 : !!player.weapons[item.id];
      const afford = player.money >= item.price;
      const div = document.createElement('div');
      div.className = `buy-item${owned ? ' owned' : ''}${!owned && !afford ? ' disabled' : ''}`;
      div.innerHTML = `<div class="name">${item.name}</div><div class="desc">${item.desc}</div><div class="price">${owned ? 'OWNED' : `$${item.price}`}</div>`;
      if (!owned && afford) div.onclick = () => this.cb.onBuy(item.id);
      grid.appendChild(div);
    }
  }

  // --- Round / match end ---
  showRoundEnd(result, score) {
    const title = $('roundend-title');
    title.textContent = result.winner === 'guard' ? 'GUARD WINS THE ROUND' : 'RAIDERS WIN THE ROUND';
    title.className = `big-title ${result.winner === 'guard' ? 'win' : 'lose'}`;
    $('roundend-reason').textContent = result.reason;
    $('roundend-score').textContent = `GUARD ${score.guard} — ${score.raiders} RAIDERS`;
    this.show('roundend');
  }

  showMatchEnd(winner, stats, score) {
    const title = $('matchend-title');
    const won = winner === 'guard';
    title.textContent = won ? 'VICTORY' : 'DEFEAT';
    title.className = `big-title ${won ? 'win' : 'lose'}`;
    $('matchend-score').textContent = `Final score — GUARD ${score.guard} : ${score.raiders} RAIDERS`;
    const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const rows = [
      ['Eliminations', stats.kills],
      ['Deaths', stats.deaths],
      ['Accuracy', `${acc}%`],
      ['Headshots', stats.headshots],
      ['Rounds won', stats.roundsWon],
    ];
    $('matchend-stats').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    this.show('matchend');
  }
}
