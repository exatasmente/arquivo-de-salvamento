// PlayerController: walk, look, run with stamina, crouch, collision against the scene's boxes,
// footsteps. The sanity effects on the camera (tremor, tilt, field of view) are applied here too.
const RADIUS = 0.3;
const EYE = 1.65, EYE_CROUCH = 1.05;

export function createPlayer(bus, { world }) {
  const THREE = world.r.THREE;
  const st = {
    x: 0, z: 0, yaw: 0, pitch: 0, eye: EYE, crouch: false, stamina: 1, tired: false,
    speed: 0, running: false, stride: 0, bob: 0, moving: false, carryHeavy: false, pushing: false, lift: 0, liftTo: 0, frozen: false,
  };
  const cols = world.colliders;

  function blocked(x, z) {
    const h = st.crouch ? 1.2 : 1.75;
    for (const c of cols) {
      if (c.enabled === false || c.min[1] > h - 0.1 || c.max[1] < 0.35) continue;
      if (x > c.min[0] - RADIUS && x < c.max[0] + RADIUS && z > c.min[2] - RADIUS && z < c.max[2] + RADIUS) return true;
    }
    return false;
  }
  /** If the player ended up inside a collider that switched on (a door closing, the cart set down, a ladder), move out along the axis of least penetration. */
  function unstick() {
    const h = st.crouch ? 1.2 : 1.75;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const c of cols) {
        if (c.enabled === false || c.min[1] > h - 0.1 || c.max[1] < 0.35) continue;
        const x0 = c.min[0] - RADIUS, x1 = c.max[0] + RADIUS, z0 = c.min[2] - RADIUS, z1 = c.max[2] + RADIUS;
        if (!(st.x > x0 && st.x < x1 && st.z > z0 && st.z < z1)) continue;
        const d = [[st.x - x0, -1, 0], [x1 - st.x, 1, 0], [st.z - z0, 0, -1], [z1 - st.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        st.x += d[1] * (d[0] + 0.02); st.z += d[2] * (d[0] + 0.02); moved = true;
      }
      if (!moved) break;
    }
  }
  function place(pos, yaw = 0) { st.x = pos.x; st.z = pos.z; st.yaw = yaw; st.pitch = 0; }

  function step(dt, intent) {
    unstick();
    if (st.frozen) { st.moving = false; st.speed = 0; return; }
    st.yaw += intent.look.yaw; st.pitch = Math.max(-1.35, Math.min(1.35, st.pitch + intent.look.pitch));
    let mx = intent.moveX, my = intent.moveY;
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    st.moving = Math.hypot(mx, my) > 0.05;
    const wantRun = intent.run && st.moving && !st.crouch && !st.tired && !st.carryHeavy && !st.pushing;
    st.running = wantRun && st.stamina > 0;
    if (st.running) { st.stamina = Math.max(0, st.stamina - dt * 0.2); if (st.stamina === 0) { st.tired = true; st.running = false; } }
    else { st.stamina = Math.min(1, st.stamina + dt * (st.moving ? 0.1 : 0.2)); if (st.tired && st.stamina > 0.3) st.tired = false; }
    const base = st.crouch ? 1.1 : st.running ? 3.6 : 2.1;
    const speed = base * (st.carryHeavy ? 0.7 : 1) * (st.pushing ? 0.82 : 1) * Math.hypot(mx, my) * (st.slow ?? 1);
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    // forward is -z at yaw 0; right is +x
    const vx = (mx * cy - my * sy) * speed, vz = (-mx * sy - my * cy) * speed;
    const nx = st.x + vx * dt, nz = st.z + vz * dt;
    if (!blocked(nx, st.z)) st.x = nx;
    if (!blocked(st.x, nz)) st.z = nz;
    st.x = Math.max(-70, Math.min(70, st.x)); st.z = Math.max(-60, Math.min(60, st.z));
    const moved = Math.hypot(vx, vz) * dt;
    st.speed = moved / dt || 0;
    st.stride += moved;
    const len = st.running ? 1.3 : st.crouch ? 0.8 : 0.95;
    if (st.stride >= len) {
      st.stride -= len;
      bus.emit('sfx', st.running ? 'passo_corrida' : 'passo', { gain: st.crouch ? 0.4 : 1 });
      bus.emit('noise', st.running ? 1 : st.crouch ? 0.15 : 0.5);
    }
    st.bob += moved * (st.running ? 6.5 : 5);
    st.lift += (st.liftTo - st.lift) * Math.min(1, dt * 6);   // standing on the ladder
    const target = (st.crouch ? EYE_CROUCH : EYE) + st.lift;
    st.eye += (target - st.eye) * Math.min(1, dt * 9);
  }
  function toggleCrouch() { st.crouch = !st.crouch; }

  /** Put the camera where the eyes are. fx: { shakeX, shakeY, roll, fov } from the sanity. */
  function apply(camera, t, fx = {}) {
    const bobY = st.moving ? Math.sin(st.bob) * (st.running ? 0.045 : 0.025) : Math.sin(t * 1.3) * 0.004;
    camera.position.set(st.x, st.eye + bobY, st.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch + (fx.shakeY || 0) - (fx.droop || 0), st.yaw + (fx.shakeX || 0), fx.roll || 0);
    const fov = (camera.baseFov || 64) + (fx.fov || 0);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  const eyePos = () => new THREE.Vector3(st.x, st.eye, st.z);
  const forward = () => new THREE.Vector3(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
  return { st, step, place, apply, toggleCrouch, eyePos, forward, blocked };
}
