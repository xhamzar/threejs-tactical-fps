// DUSK STRIKE — every texture is painted on a canvas at load: no image
// files, no network, nothing to download. A seeded random keeps the look
// identical every run (the same rust streaks, the same worn paint).
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function speckle(ctx, size, rand, n, colors, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = aMin + rand() * (aMax - aMin);
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx, size, rand, n, color, vertical) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    const x = rand() * size, y = rand() * size;
    if (vertical) ctx.fillRect(x, y, 1 + rand() * 2, 20 + rand() * 90);
    else ctx.fillRect(x, y, 20 + rand() * 90, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
}

// Corrugated shipping container in one colour, ribs running down.
function containerTexture(base, rib, seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 16) {
    ctx.fillStyle = rib; ctx.fillRect(x, 0, 7, size);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 7, 0, 2, size);
  }
  streaks(ctx, size, rand, 26, '#1c1410', true);
  speckle(ctx, size, rand, 500, ['#000000', '#ffffff', '#3a2418'], 0.03, 0.1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, size, 6); ctx.fillRect(0, size - 6, size, 6);
  return tex(c);
}

function concreteTexture(seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#8d8880'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rand, 2600, ['#6f6a63', '#a39d94', '#7d7871'], 0.08, 0.25);
  streaks(ctx, size, rand, 14, '#5c564e', true);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return tex(c);
}

function groundTexture(seed) {
  const size = 512, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4a4440'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rand, 9000, ['#38332f', '#5b534c', '#2e2a27'], 0.1, 0.3);
  // expansion joints + faded painted lines
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(size, i * 128); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,176,58,0.35)'; ctx.lineWidth = 5; ctx.setLineDash([26, 18]);
  ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(size, 64); ctx.stroke();
  ctx.setLineDash([]);
  return tex(c);
}

function woodTexture(seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 32) {
    ctx.fillStyle = rand() > 0.5 ? '#85653c' : '#6f4f2c'; ctx.fillRect(0, y, size, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y + 30, size, 2);
  }
  streaks(ctx, size, rand, 40, '#4a3319', false);
  return tex(c);
}

function hazardTexture() {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#d8a018'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#17171a';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, size); ctx.lineTo(i * 32 + 32, 0);
    ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 16, size);
    ctx.closePath(); ctx.fill();
  }
  return tex(c);
}

function signTexture(letter, color) {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(6, 6, size - 12, size - 12);
  ctx.fillStyle = color; ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 4);
  return tex(c);
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeTextures() {
  return {
    concrete: concreteTexture(11),
    ground: groundTexture(23),
    wood: woodTexture(37),
    hazard: hazardTexture(),
    containerOrange: containerTexture('#b4551f', '#8f3f14', 41),
    containerTeal: containerTexture('#1f6f6a', '#15524e', 53),
    containerRust: containerTexture('#7a4a2e', '#5c341f', 67),
    containerBlue: containerTexture('#2e4a72', '#20344f', 71),
    signA: signTexture('A', '#ffb03a'),
    signB: signTexture('B', '#2fd8c4'),
  };
}
