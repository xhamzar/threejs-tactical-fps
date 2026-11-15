// DUSK STRIKE — keyboard, mouse and pointer lock. The sim reads this, never
// the DOM: keys held, keys pressed this tick (a queue the sim drains), mouse
// deltas since last tick, and whether the pointer is locked.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // codes pressed since last drain
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.fireHeld = false;
    this.locked = false;
    this.onLockChange = null;
    this.onPauseKey = null; // Escape while locked (browser exits lock first)
    this._wheel = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Escape' && this.onPauseKey) this.onPauseKey();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.fireHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });
    document.addEventListener('wheel', (e) => { this._wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (!this.locked) document.body.requestPointerLock();
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  // Drain per-tick inputs; the sim calls this once per fixed step.
  drain() {
    const out = {
      pressed: this.pressed, dx: this.mouseDX, dy: this.mouseDY, wheel: this._wheel,
    };
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this._wheel = 0;
    return out;
  }

  held(code) { return this.keys.has(code); }
  axis() {
    // Forward/strafe in [-1, 1] from WASD + arrows.
    let f = 0, s = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) f += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) f -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) s += 1;
    if (this.held('KeyA') || this.held('ArrowLeft')) s -= 1;
    return { f, s };
  }
}
