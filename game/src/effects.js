// DUSK STRIKE — tracers, sparks and blasts. Everything is pooled and
// reused: no mesh, material or vector is allocated during play, so the hot
// loop never touches the garbage collector.
import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 40;
const BOOMS = 3;

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

  explosion(pos) {
    const b = this.booms[this.boomIdx];
    this.boomIdx = (this.boomIdx + 1) % BOOMS;
    b.mesh.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
    b.light.position.copy(b.mesh.position);
    b.mesh.visible = true;
    b.life = 0.55;
    this.sparksAt(pos, 14);
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
    for (const b of this.booms) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.mesh.visible = false; b.light.intensity = 0; continue; }
      const k = 1 - b.life / 0.55;
      b.mesh.scale.setScalar(0.5 + k * 5.5);
      b.mesh.material.opacity = (1 - k) * 0.8;
      b.light.intensity = (1 - k) * 60;
    }
  }
}
