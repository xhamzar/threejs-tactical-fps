// DUSK STRIKE — tracers, sparks and blasts. Everything is pooled and
// reused: no mesh, material or vector is allocated during play, so the hot
// loop never touches the garbage collector.
//
// v3 adds dust (sprint + landings), muzzle smoke, blood puffs, lingering
// smoke clouds, flash pops and scorch decals — all pooled, all capped.
import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 48;
const BOOMS = 3;
const DUST = 20;
const PUFFS = 12;
const BLOOD = 16;
const CLOUDS = 2;
const FLASHES = 2;
const SCORCHES = 3;

function softSprite(color, opacity) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: t, transparent: true, opacity, depthWrite: false });
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
    for (let i = 0; i < SPARKS; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.visible = false;
      scene.add(m);
      this.sparks.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.sparkIdx = 0;
    // Blood puffs: small red boxes, same motion as sparks.
    this.blood = [];
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f1d1d });
    for (let i = 0; i < BLOOD; i++) {
      const m = new THREE.Mesh(sparkGeo, bloodMat);
      m.visible = false;
      scene.add(m);
      this.blood.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.bloodIdx = 0;
    this.booms = [];
    for (let i = 0; i < BOOMS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      const light = new THREE.PointLight(0xff9040, 0, 22);
      scene.add(light);
      this.booms.push({ mesh, light, life: 0 });
    }
    this.boomIdx = 0;
    // Dust sprites: kicked up by sprinting feet and landings.
    this.dust = [];
    for (let i = 0; i < DUST; i++) {
      const s = new THREE.Sprite(softSprite('rgba(190,175,150,0.5)', 0));
      s.visible = false;
      scene.add(s);
      this.dust.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.dustIdx = 0;
    // Muzzle smoke: small grey puffs that rise and fade.
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(softSprite('rgba(160,160,165,0.4)', 0));
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1 });
    }
    this.puffIdx = 0;
    // Smoke clouds: 4 big soft spheres each, lingering ~12s.
    this.clouds = [];
    for (let i = 0; i < CLOUDS; i++) {
      const spheres = [];
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Sprite(softSprite('rgba(200,200,205,0.85)', 0));
        s.visible = false;
        scene.add(s);
        spheres.push({ s, ox: 0, oy: 0, oz: 0 });
      }
      this.clouds.push({ spheres, life: 0, max: 12 });
    }
    this.cloudIdx = 0;
    // Flash pops: white additive bursts for flashbangs.
    this.flashes = [];
    for (let i = 0; i < FLASHES; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      const light = new THREE.PointLight(0xffffff, 0, 30);
      scene.add(light);
      this.flashes.push({ mesh, light, life: 0 });
    }
    this.flashIdx = 0;
    // Scorch decals: dark circles left by explosions.
    this.scorches = [];
    const scorchGeo = new THREE.CircleGeometry(1.4, 20);
    for (let i = 0; i < SCORCHES; i++) {
      const m = new THREE.Mesh(scorchGeo,
        new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.scorches.push({ m, life: 0 });
    }
    this.scorchIdx = 0;
    // Reused temp vectors (never allocate in update).
    this._v = new THREE.Vector3();
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % TRACERS;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  sparksAt(pos, n = 6) {
    for (let k = 0; k < n; k++) {
      const s = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % SPARKS;
      s.m.position.set(pos.x, pos.y, pos.z);
      s.vx = (Math.random() - 0.5) * 4;
      s.vy = Math.random() * 3.5;
      s.vz = (Math.random() - 0.5) * 4;
      s.m.visible = true;
      s.life = 0.35 + Math.random() * 0.25;
    }
  }

  bloodAt(pos, n = 5) {
    for (let k = 0; k < n; k++) {
      const s = this.blood[this.bloodIdx];
      this.bloodIdx = (this.bloodIdx + 1) % BLOOD;
      s.m.position.set(pos.x, pos.y, pos.z);
      s.vx = (Math.random() - 0.5) * 2.5;
      s.vy = Math.random() * 2;
      s.vz = (Math.random() - 0.5) * 2.5;
      s.m.visible = true;
      s.life = 0.3 + Math.random() * 0.2;
    }
  }

  explosion(pos) {
    const b = this.booms[this.boomIdx];
    this.boomIdx = (this.boomIdx + 1) % BOOMS;
    b.mesh.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
    b.light.position.copy(b.mesh.position);
    b.mesh.visible = true;
    b.life = 0.55;
    this.sparksAt(pos, 14);
    this.dustAt({ x: pos.x, y: 0.2, z: pos.z }, 4, 1.4);
    const sc = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % SCORCHES;
    sc.m.position.set(pos.x, 0.03, pos.z);
    sc.m.visible = true;
    sc.life = 8;
  }

  dustAt(pos, n = 1, spread = 0.5) {
    for (let k = 0; k < n; k++) {
      const d = this.dust[this.dustIdx];
      this.dustIdx = (this.dustIdx + 1) % DUST;
      d.s.position.set(
        pos.x + (Math.random() - 0.5) * spread,
        0.15 + Math.random() * 0.2,
        pos.z + (Math.random() - 0.5) * spread,
      );
      d.vx = (Math.random() - 0.5) * 0.6;
      d.vy = 0.4 + Math.random() * 0.5;
      d.vz = (Math.random() - 0.5) * 0.6;
      d.s.visible = true;
      d.max = 0.7 + Math.random() * 0.4;
      d.life = d.max;
      d.s.scale.setScalar(0.3);
    }
  }

  muzzleSmoke(pos) {
    const p = this.puffs[this.puffIdx];
    this.puffIdx = (this.puffIdx + 1) % PUFFS;
    p.s.position.set(pos.x, pos.y, pos.z);
    p.s.visible = true;
    p.max = 0.6;
    p.life = p.max;
    p.s.scale.setScalar(0.18);
  }

  smokeCloud(pos) {
    const c = this.clouds[this.cloudIdx];
    this.cloudIdx = (this.cloudIdx + 1) % CLOUDS;
    for (const sp of c.spheres) {
      sp.ox = (Math.random() - 0.5) * 3.4;
      sp.oy = 0.7 + Math.random() * 1.6;
      sp.oz = (Math.random() - 0.5) * 3.4;
      sp.s.position.set(pos.x + sp.ox, pos.y + sp.oy, pos.z + sp.oz);
      sp.s.visible = true;
      sp.s.scale.setScalar(1.2);
    }
    c.life = c.max;
    c.x = pos.x; c.y = pos.y; c.z = pos.z;
  }

  flashAt(pos) {
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % FLASHES;
    f.mesh.position.set(pos.x, Math.max(0.8, pos.y), pos.z);
    f.light.position.copy(f.mesh.position);
    f.mesh.visible = true;
    f.life = 0.35;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = t.life / 0.07 * 0.85;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.vy -= 12 * dt;
      s.m.position.x += s.vx * dt;
      s.m.position.y += s.vy * dt;
      s.m.position.z += s.vz * dt;
      if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.vy = -s.vy * 0.4; }
    }
    for (const s of this.blood) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.vy -= 10 * dt;
      s.m.position.x += s.vx * dt;
      s.m.position.y += s.vy * dt;
      s.m.position.z += s.vz * dt;
      if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.vy = 0; s.vx = 0; s.vz = 0; }
    }
    for (const b of this.booms) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.mesh.visible = false; b.light.intensity = 0; continue; }
      const k = 1 - b.life / 0.55;
      b.mesh.scale.setScalar(0.5 + k * 5.5);
      b.mesh.material.opacity = (1 - k) * 0.8;
      b.light.intensity = (1 - k) * 60;
    }
    for (const d of this.dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.s.visible = false; continue; }
      const k = 1 - d.life / d.max;
      d.s.position.x += d.vx * dt;
      d.s.position.y += d.vy * dt;
      d.s.position.z += d.vz * dt;
      d.s.scale.setScalar(0.3 + k * 0.9);
      d.s.material.opacity = 0.5 * (1 - k);
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.y += dt * 0.5;
      p.s.scale.setScalar(0.18 + k * 0.5);
      p.s.material.opacity = 0.4 * (1 - k);
    }
    for (const c of this.clouds) {
      if (c.life <= 0) continue;
      c.life -= dt;
      const k = 1 - c.life / c.max;
      const fade = c.life < 2 ? c.life / 2 : 1;
      for (const sp of c.spheres) {
        if (c.life <= 0) { sp.s.visible = false; continue; }
        sp.s.scale.setScalar(1.2 + k * 2.4);
        sp.s.material.opacity = 0.85 * fade * (k < 0.08 ? k / 0.08 : 1);
        sp.s.position.y += dt * 0.06;
      }
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.mesh.visible = false; f.light.intensity = 0; continue; }
      const k = 1 - f.life / 0.35;
      f.mesh.scale.setScalar(0.5 + k * 7);
      f.mesh.material.opacity = (1 - k) * 0.9;
      f.light.intensity = (1 - k) * 90;
    }
    for (const sc of this.scorches) {
      if (sc.life <= 0) continue;
      sc.life -= dt;
      if (sc.life <= 0) { sc.m.visible = false; continue; }
      sc.m.material.opacity = Math.min(0.75, sc.life / 2 * 0.75);
    }
  }
}
