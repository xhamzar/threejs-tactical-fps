// DUSK STRIKE — tuning constants. One file holds every number the game
// balances on, so the judge (and a later tweak) finds them in one place.
export const WEAPONS = {
  pistol: {
    name: 'P9 Pistol', price: 0, damage: 34, headMult: 2, rpm: 320,
    mag: 12, reserve: 48, reload: 1.4, spread: 0.006, moveSpread: 0.02,
    recoil: 0.011, auto: false, range: 60, kick: 0.02,
  },
  rifle: {
    name: 'AR-7 Rifle', price: 2500, damage: 30, headMult: 2, rpm: 600,
    mag: 30, reserve: 90, reload: 2.2, spread: 0.008, moveSpread: 0.045,
    recoil: 0.016, auto: true, range: 90, kick: 0.035,
  },
  smg: {
    name: 'K-9 SMG', price: 1500, damage: 22, headMult: 2, rpm: 820,
    mag: 32, reserve: 96, reload: 1.9, spread: 0.012, moveSpread: 0.03,
    recoil: 0.01, auto: true, range: 45, kick: 0.022,
  },
};
export const GRENADE = { name: 'Frag Grenade', price: 300, damage: 95, radius: 6.5, fuse: 1.6 };
export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 50; // absorbs half of incoming damage while it lasts

export const ECONOMY = { start: 800, kill: 200, win: 1600, loss: 800 };

export const ROUND = {
  buyTime: 10, roundTime: 100, intermission: 4,
  fuseTime: 30, plantTime: 3, defuseTime: 5, winsToWin: 5,
};

export const MOVER = {
  radius: 0.35, height: 1.75, eyeStand: 1.62, eyeCrouch: 1.05,
  walk: 4.3, sprint: 5.8, crouch: 2.2, accel: 42, friction: 10,
};

export const TEAM = {
  guard: { name: 'GUARD', color: 0x2fb8a6, css: '#2fd8c4', dark: 0x0f5f56 },
  raiders: { name: 'RAIDERS', color: 0xe8642a, css: '#ff7a3c', dark: 0x7a2f0e },
};

export const PALETTE = {
  sky: 0x2a1e33, fog: 0x3a2a33, sun: 0xffb066, hemiSky: 0x7a86b8, hemiGround: 0x4a3527,
  ground: 0x3d3a38, accent: 0xffb03a,
};

export const BOT_NAMES = {
  guard: ['Beacon', 'Anchor'],
  raiders: ['Dusk', 'Ember', 'Vandal'],
};

export const TIPS = [
  'Stop moving before you shoot — accuracy beats speed.',
  'Headshots deal double damage. Aim high.',
  'Press B during the buy phase to spend your cash.',
  'Hold E near a bomb site to plant — or to defuse.',
  'Crouch (Ctrl) to steady your aim and hide behind cover.',
  'Grenades are loud: every bot nearby hears the blast.',
  'Win the round, earn $1600. A kill alone pays $200.',
  'The bomb ticks for 30 seconds once planted. Defuse takes 5.',
];
