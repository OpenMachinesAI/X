
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm";

await RAPIER.init();

const FIXED_DT = 1 / 120;
const G = 9.80665;
const AIR_DENSITY = 1.225;

const MOTOR = {
  loadedMass: 0.0241,
  propellantMass: 0.0122,
  burnDuration: 1.60,
  peakThrust: 15.30,
  testedImpulse: 6.93
};

// Educational curve normalized to the NAR-listed tested impulse.
// This is intentionally not a downloadable certification thrust trace.
const rawCurve = [
  [0.00,0.0],[0.04,8.0],[0.08,15.3],[0.16,11.5],[0.25,8.0],
  [0.40,5.4],[0.70,4.4],[1.00,4.0],[1.30,3.3],[1.52,1.8],[1.60,0.0]
];

function integrateCurve(curve) {
  let total = 0;
  for (let i = 1; i < curve.length; i++) {
    const [t0, f0] = curve[i - 1];
    const [t1, f1] = curve[i];
    total += (t1 - t0) * (f0 + f1) * 0.5;
  }
  return total;
}
const curveScale = MOTOR.testedImpulse / integrateCurve(rawCurve);
const thrustCurve = rawCurve.map(([t, f]) => [t, f * curveScale]);

function motorThrust(t) {
  if (t < 0 || t > MOTOR.burnDuration) return 0;
  for (let i = 1; i < thrustCurve.length; i++) {
    const [t0, f0] = thrustCurve[i - 1];
    const [t1, f1] = thrustCurve[i];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return f0 + (f1 - f0) * u;
    }
  }
  return 0;
}

function propellantRemaining(t) {
  return MOTOR.propellantMass * (1 - Math.min(1, Math.max(0, t / MOTOR.burnDuration)));
}

const els = Object.fromEntries([
  "dryMass","rocketLength","rocketDiameter","cd","wind","landingMode","ascentCount","ascentLabel",
  "descentAltitude","descentSpeed","tilt","reserve","reserveLabel","landingBtn","ascentBtn","resetBtn",
  "altitude","verticalVelocity","speed","acceleration","attitude","angularSpeed","mass","thrust","prediction",
  "burnState","touchdown","simTime","phase","engineSummary","layoutTitle","layoutText","scene","plot"
].map(id => [id, document.getElementById(id)]));

// ---------- Three.js ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1a2c, 60, 230);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 600);
camera.position.set(7, 4.2, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
els.scene.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xaed6ff, 0x293019, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(8, 18, 10);
sun.castShadow = true;
scene.add(sun);

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshStandardMaterial({ color: 0x233522, roughness: 1 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const grid = new THREE.GridHelper(120, 60, 0x4c6881, 0x263c50);
grid.position.y = 0.006;
scene.add(grid);

const rocketGroup = new THREE.Group();
scene.add(rocketGroup);

let bodyMesh, noseMesh, fins = [], flameMeshes = [];

function rebuildRocketVisual() {
  while (rocketGroup.children.length) rocketGroup.remove(rocketGroup.children[0]);
  fins = [];
  flameMeshes = [];

  const length = +els.rocketLength.value;
  const radius = +els.rocketDiameter.value / 2;

  const material = new THREE.MeshStandardMaterial({ color: 0xe4edf7, metalness: 0.18, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5f7890, metalness: 0.2, roughness: 0.65 });

  bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length * 0.80, 24), material);
  bodyMesh.position.y = 0;
  bodyMesh.castShadow = true;
  rocketGroup.add(bodyMesh);

  noseMesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length * 0.20, 24), material);
  noseMesh.position.y = length * 0.50;
  noseMesh.castShadow = true;
  rocketGroup.add(noseMesh);

  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.12, length * 0.19, radius * 1.55), dark);
    fin.position.y = -length * 0.34;
    fin.rotation.y = i * Math.PI / 2;
    fin.castShadow = true;
    rocketGroup.add(fin);
    fins.push(fin);
  }

  // Engine bells.
  const mounts = allEngineMounts();
  mounts.forEach(m => {
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.11, radius * 0.17, length * 0.055, 10),
      new THREE.MeshStandardMaterial({ color: 0x394654, metalness: 0.75, roughness: 0.35 })
    );
    bell.position.set(m.x, -length * 0.43, m.z);
    rocketGroup.add(bell);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.12, length * 0.18, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa13a, transparent: true, opacity: 0.88 })
    );
    flame.rotation.x = Math.PI;
    flame.position.set(m.x, -length * 0.55, m.z);
    flame.visible = false;
    rocketGroup.add(flame);
    flameMeshes.push({ mesh: flame, id: m.id });
  });
}

function resizeRenderer() {
  const r = els.scene.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resizeRenderer);

// ---------- Rapier ----------
let world, rigidBody, collider;
let simMode = "idle";
let phase = "READY";
let simTime = 0;
let accumulator = 0;
let lastFrame = performance.now() / 1000;
let burnStarted = false;
let burnStart = 0;
let touchdownSpeed = null;
let currentThrust = 0;
let currentMass = 0;
let lastVerticalVelocity = 0;
let measuredAcceleration = 0;
let history = [];
let lastPlan = null;

function allEngineMounts() {
  const radius = +els.rocketDiameter.value * 0.29;
  const mounts = [{ id: "C", x: 0, z: 0, center: true }];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    mounts.push({
      id: String(i + 1),
      x: Math.cos(a) * radius,
      z: Math.sin(a) * radius,
      outerIndex: i
    });
  }
  return mounts;
}

function landingMountIds() {
  return +els.landingMode.value === 1 ? ["C"] : ["C", "3", "7"];
}

// Balanced subsets, preferred over simply taking adjacent engines.
const balancedOuterOrders = {
  1: [1],
  2: [1,5],
  3: [1,4,7],
  4: [1,3,5,7],
  5: [1,3,4,6,8],
  6: [1,2,4,5,6,8],
  7: [1,2,3,4,5,6,7],
  8: [1,2,3,4,5,6,7,8]
};

function availableOuterIds() {
  const reserved = new Set(landingMountIds().filter(x => x !== "C"));
  return Array.from({length:8}, (_,i)=>String(i+1)).filter(id => !reserved.has(id));
}

function ascentMountIds() {
  const available = new Set(availableOuterIds());
  const count = +els.ascentCount.value;
  const desired = balancedOuterOrders[count] || balancedOuterOrders[8];
  const selected = desired.map(String).filter(id => available.has(id));

  // Fill any missing selections from available positions.
  for (const id of available) {
    if (selected.length >= count) break;
    if (!selected.includes(id)) selected.push(id);
  }
  return selected.slice(0, count);
}

function dryInertia(mass) {
  const L = +els.rocketLength.value;
  const r = +els.rocketDiameter.value / 2;
  return {
    x: mass * (3 * r * r + L * L) / 12,
    y: 0.5 * mass * r * r,
    z: mass * (3 * r * r + L * L) / 12
  };
}

function setBodyMass(mass) {
  if (!rigidBody) return;
  const I = dryInertia(mass);
  rigidBody.setAdditionalMassProperties(
    mass,
    { x: 0, y: 0, z: 0 },
    I,
    { x: 0, y: 0, z: 0, w: 1 },
    true
  );
}

function makeWorld(startAltitude = 0, downwardSpeed = 0, tiltDeg = 0) {
  world = new RAPIER.World({ x: 0, y: -G, z: 0 });
  world.timestep = FIXED_DT;

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.06, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(75, 0.05, 75).setFriction(0.8).setRestitution(0.02),
    groundBody
  );

  const length = +els.rocketLength.value;
  const radius = +els.rocketDiameter.value / 2;

  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, startAltitude + length * 0.5, 0)
    .setLinearDamping(0.0)
    .setAngularDamping(0.12)
    .setCcdEnabled(true);

  rigidBody = world.createRigidBody(desc);
  collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(length * 0.38, radius)
      .setDensity(0)
      .setFriction(0.75)
      .setRestitution(0.02),
    rigidBody
  );

  const tilt = THREE.MathUtils.degToRad(tiltDeg);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt));
  rigidBody.setRotation({ x:q.x, y:q.y, z:q.z, w:q.w }, true);
  rigidBody.setLinvel({ x: 0, y: -Math.abs(downwardSpeed), z: 0 }, true);

  currentMass = +els.dryMass.value;
  setBodyMass(currentMass);
  lastVerticalVelocity = rigidBody.linvel().y;
}

function rotateLocalVector(v, rot) {
  return new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(
    new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
  );
}

function worldPointFromLocal(local, pos, rot) {
  const p = rotateLocalVector(local, rot);
  p.add(new THREE.Vector3(pos.x, pos.y, pos.z));
  return p;
}

function aerodynamicForce() {
  const v = rigidBody.linvel();
  const wind = +els.wind.value;
  const airVel = new THREE.Vector3(v.x - wind, v.y, v.z);
  const speed = airVel.length();
  if (speed < 0.001) return new THREE.Vector3();

  const area = Math.PI * Math.pow(+els.rocketDiameter.value / 2, 2);
  const magnitude = 0.5 * AIR_DENSITY * +els.cd.value * area * speed * speed;
  return airVel.normalize().multiplyScalar(-magnitude);
}

function activeMotorIds(localBurnTime) {
  if (localBurnTime < 0 || localBurnTime > MOTOR.burnDuration) return [];
  if (simMode === "ascent") return ascentMountIds();
  if (simMode === "landing" && burnStarted) return landingMountIds();
  return [];
}

function applyMotorForces(localBurnTime) {
  const ids = new Set(activeMotorIds(localBurnTime));
  const perMotor = motorThrust(localBurnTime);
  currentThrust = perMotor * ids.size;

  if (!ids.size || perMotor <= 0) return;

  const pos = rigidBody.translation();
  const rot = rigidBody.rotation();
  const axis = rotateLocalVector({x:0,y:1,z:0}, rot).normalize();
  const length = +els.rocketLength.value;

  for (const mount of allEngineMounts()) {
    if (!ids.has(mount.id)) continue;
    const localPoint = { x: mount.x, y: -length * 0.42, z: mount.z };
    const point = worldPointFromLocal(localPoint, pos, rot);
    const force = axis.clone().multiplyScalar(perMotor);
    rigidBody.addForceAtPoint(
      { x: force.x, y: force.y, z: force.z },
      { x: point.x, y: point.y, z: point.z },
      true
    );
  }
}

function updateMass(localBurnTime, motorCount) {
  const dry = +els.dryMass.value;
  const casing = MOTOR.loadedMass - MOTOR.propellantMass;
  const burning = localBurnTime >= 0 && localBurnTime <= MOTOR.burnDuration;
  const propEach = burning ? propellantRemaining(localBurnTime) : 0;
  currentMass = dry + motorCount * (casing + propEach);
  setBodyMass(currentMass);
}

// ---------- simulation-only predictive landing controller ----------
function predictTouchdown(delay) {
  const p = rigidBody.translation();
  const v = rigidBody.linvel();
  const rot = rigidBody.rotation();
  const axis = rotateLocalVector({x:0,y:1,z:0}, rot).normalize();
  const verticalThrustFraction = Math.max(0.05, axis.y);

  let y = Math.max(0, p.y - +els.rocketLength.value * 0.5);
  let vy = v.y;
  let xSpeed = Math.hypot(v.x - +els.wind.value, v.z);
  let t = 0;
  let burnT = -1;
  const dt = 0.01;
  const count = +els.landingMode.value;
  const dry = +els.dryMass.value;
  const area = Math.PI * Math.pow(+els.rocketDiameter.value / 2, 2);
  const cd = +els.cd.value;

  for (let i = 0; i < 12000; i++) {
    if (y <= 0) return { speed: Math.abs(vy), time: t, feasible: true };

    if (burnT < 0 && t >= delay) burnT = 0;

    const burning = burnT >= 0 && burnT <= MOTOR.burnDuration;
    const thrust = burning ? motorThrust(burnT) * count * verticalThrustFraction : 0;
    const propEach = burning ? propellantRemaining(burnT) : 0;
    const mass = dry + count * ((MOTOR.loadedMass - MOTOR.propellantMass) + propEach);

    const airSpeed = Math.hypot(vy, xSpeed);
    const dragMag = 0.5 * AIR_DENSITY * cd * area * airSpeed * airSpeed;
    const dragY = airSpeed > 0.001 ? -dragMag * (vy / airSpeed) : 0;

    const ay = (thrust + dragY) / mass - G;
    vy += ay * dt;
    y += vy * dt;
    t += dt;
    if (burnT >= 0) burnT += dt;

    if (t > 30 || y > p.y + 100) return { speed: Infinity, time: t, feasible: false };
  }
  return { speed: Infinity, time: Infinity, feasible: false };
}

function chooseLandingPlan() {
  if (!rigidBody || simMode !== "landing" || burnStarted) return null;
  const p = rigidBody.translation();
  const v = rigidBody.linvel();
  const altitude = p.y - +els.rocketLength.value * 0.5;
  if (altitude <= 0 || v.y >= 0) return null;

  const ballisticTTG = altitude / Math.max(0.25, Math.abs(v.y));
  const maxDelay = Math.min(10, Math.max(0, ballisticTTG));
  let best = { delay: 0, speed: Infinity, score: Infinity };

  for (let delay = 0; delay <= maxDelay; delay += 0.04) {
    const r = predictTouchdown(delay);
    if (!r.feasible || !Number.isFinite(r.speed)) continue;
    const score = r.speed * r.speed - delay * 0.015;
    if (score < best.score) best = { delay, speed: r.speed, score };
  }

  const lo = Math.max(0, best.delay - 0.05);
  const hi = Math.min(maxDelay, best.delay + 0.05);
  for (let delay = lo; delay <= hi; delay += 0.005) {
    const r = predictTouchdown(delay);
    if (!r.feasible || !Number.isFinite(r.speed)) continue;
    const score = r.speed * r.speed - delay * 0.015;
    if (score < best.score) best = { delay, speed: r.speed, score };
  }

  return best;
}

function maybeStartLandingBurn() {
  if (burnStarted || simMode !== "landing") return;
  lastPlan = chooseLandingPlan();
  if (!lastPlan || !Number.isFinite(lastPlan.delay)) return;

  const reserve = +els.reserve.value;
  const adjustedDelay = lastPlan.delay / reserve;
  if (adjustedDelay <= FIXED_DT * 2.5) {
    burnStarted = true;
    burnStart = simTime;
    phase = "LANDING BURN";
  }
}

// ---------- UI / setup ----------
function configureEngineLayout() {
  const landing = +els.landingMode.value;
  const available = availableOuterIds();
  els.ascentCount.max = String(available.length);
  if (+els.ascentCount.value > available.length) els.ascentCount.value = String(available.length);

  els.ascentLabel.textContent = `${els.ascentCount.value} of ${available.length} available`;
  els.reserveLabel.textContent = `${(+els.reserve.value).toFixed(2)}×`;

  document.querySelectorAll(".motor.outer").forEach((m, i) => {
    m.className = `motor outer m${i}`;
  });
  document.querySelector(".motor.center").className = "motor center landing";

  const landingIds = new Set(landingMountIds());
  const ascentIds = new Set(ascentMountIds());

  document.querySelectorAll(".motor.outer").forEach((m, i) => {
    const id = String(i + 1);
    if (landingIds.has(id)) m.classList.add("landing");
    else if (ascentIds.has(id)) m.classList.add("ascent");
  });

  els.engineSummary.textContent = `${landing} landing motor${landing===1?"":"s"} • ${ascentMountIds().length} ascent motors selected`;
  els.layoutTitle.textContent = landing === 1
    ? "Center-only landing configuration"
    : "Balanced three-motor landing configuration";
  els.layoutText.textContent = landing === 1
    ? "The center motor creates thrust through the vehicle axis; all eight outer positions remain available."
    : "The center plus an opposite outer pair are reserved for landing, so their off-axis moments cancel in the ideal symmetric case.";

  rebuildRocketVisual();
}

function resetSimulation() {
  simMode = "idle";
  phase = "READY";
  simTime = 0;
  accumulator = 0;
  burnStarted = false;
  burnStart = 0;
  touchdownSpeed = null;
  currentThrust = 0;
  lastPlan = null;
  history = [];

  makeWorld(0, 0, 0);
  updateVisualFromPhysics();
  updateTelemetry();
  drawPlot();
}

function startLanding() {
  simMode = "landing";
  phase = "FREE FALL";
  simTime = 0;
  accumulator = 0;
  burnStarted = false;
  burnStart = 0;
  touchdownSpeed = null;
  history = [];
  lastPlan = null;

  makeWorld(+els.descentAltitude.value, +els.descentSpeed.value, +els.tilt.value);
  updateVisualFromPhysics();
  updateTelemetry();
}

function startAscent() {
  simMode = "ascent";
  phase = "ASCENT BURN";
  simTime = 0;
  accumulator = 0;
  burnStarted = true;
  burnStart = 0;
  touchdownSpeed = null;
  history = [];
  lastPlan = null;

  makeWorld(0.01, 0, 0);
  updateVisualFromPhysics();
  updateTelemetry();
}

function physicsStep() {
  if (!rigidBody || simMode === "idle") return;

  rigidBody.resetForces(true);
  rigidBody.resetTorques(true);

  let localBurnTime = -1;
  let motorCount = 0;

  if (simMode === "landing") {
    maybeStartLandingBurn();
    motorCount = landingMountIds().length;
    if (burnStarted) localBurnTime = simTime - burnStart;
  } else if (simMode === "ascent") {
    motorCount = ascentMountIds().length;
    localBurnTime = simTime;
    if (localBurnTime > MOTOR.burnDuration) phase = "COAST";
  }

  updateMass(localBurnTime, motorCount);

  const drag = aerodynamicForce();
  rigidBody.addForce({ x: drag.x, y: drag.y, z: drag.z }, true);
  applyMotorForces(localBurnTime);

  world.step();
  simTime += FIXED_DT;

  const v = rigidBody.linvel();
  measuredAcceleration = (v.y - lastVerticalVelocity) / FIXED_DT;
  lastVerticalVelocity = v.y;

  const pos = rigidBody.translation();
  const altitude = pos.y - +els.rocketLength.value * 0.5;

  history.push({ t: simTime, altitude: Math.max(0, altitude), vy: v.y, thrust: currentThrust });
  if (history.length > 3000) history.shift();

  if (altitude <= 0.008 && simTime > 0.08 && v.y <= 0.2) {
    touchdownSpeed = Math.hypot(v.x, v.y, v.z);
    phase = touchdownSpeed < 2.5 ? "SOFT TOUCHDOWN" : "HARD TOUCHDOWN";
    simMode = "idle";
    currentThrust = 0;
  }
}

function updateVisualFromPhysics() {
  if (!rigidBody) return;
  const p = rigidBody.translation();
  const q = rigidBody.rotation();
  rocketGroup.position.set(p.x, p.y, p.z);
  rocketGroup.quaternion.set(q.x, q.y, q.z, q.w);

  const activeIds = new Set(
    simMode === "ascent"
      ? activeMotorIds(simTime)
      : (burnStarted ? activeMotorIds(simTime - burnStart) : [])
  );

  for (const f of flameMeshes) {
    f.mesh.visible = activeIds.has(f.id) && currentThrust > 0;
    if (f.mesh.visible) {
      const s = 0.65 + Math.min(1.4, currentThrust / Math.max(1, activeIds.size * 6));
      f.mesh.scale.y = s;
    }
  }

  // Camera follows the rocket but eases toward the ground during landing.
  const alt = Math.max(0, p.y);
  const targetY = simMode === "landing" ? Math.max(2.2, alt) : Math.max(2.2, alt);
  const desired = new THREE.Vector3(p.x + 5.5, targetY + 1.5, p.z + 10);
  camera.position.lerp(desired, 0.035);
  camera.lookAt(p.x, Math.max(0.5, p.y), p.z);
}

function tiltDegrees() {
  if (!rigidBody) return 0;
  const q = rigidBody.rotation();
  const axis = rotateLocalVector({x:0,y:1,z:0}, q).normalize();
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(axis.y, -1, 1)));
}

function updateTelemetry() {
  if (!rigidBody) return;
  const p = rigidBody.translation();
  const v = rigidBody.linvel();
  const w = rigidBody.angvel();
  const altitude = Math.max(0, p.y - +els.rocketLength.value * 0.5);

  els.altitude.textContent = `${altitude.toFixed(2)} m`;
  els.verticalVelocity.textContent = `${v.y.toFixed(2)} m/s`;
  els.speed.textContent = `${Math.hypot(v.x,v.y,v.z).toFixed(2)} m/s`;
  els.acceleration.textContent = `${measuredAcceleration.toFixed(2)} m/s²`;
  els.attitude.textContent = `${tiltDegrees().toFixed(2)}°`;
  els.angularSpeed.textContent = `${Math.hypot(w.x,w.y,w.z).toFixed(3)} rad/s`;
  els.mass.textContent = `${currentMass.toFixed(3)} kg`;
  els.thrust.textContent = `${currentThrust.toFixed(2)} N`;
  els.burnState.textContent = burnStarted && simMode !== "ascent" ? "FIRED" : (simMode==="landing" ? "ARMED" : "—");
  els.touchdown.textContent = touchdownSpeed == null ? "—" : `${touchdownSpeed.toFixed(2)} m/s`;
  els.simTime.textContent = `${simTime.toFixed(2)} s`;
  els.phase.textContent = phase;

  if (simMode === "landing" && !burnStarted && lastPlan && Number.isFinite(lastPlan.delay)) {
    els.prediction.textContent = `${lastPlan.delay.toFixed(2)} s → ${lastPlan.speed.toFixed(2)} m/s`;
  } else {
    els.prediction.textContent = "—";
  }
}

function drawPlot() {
  const canvas = els.plot;
  const c = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  c.clearRect(0,0,w,h);
  c.fillStyle = "#07111c";
  c.fillRect(0,0,w,h);

  c.strokeStyle = "#21374c";
  c.lineWidth = 1;
  for (let i=0;i<5;i++) {
    const y=28+i*(h-52)/4;
    c.beginPath(); c.moveTo(44,y); c.lineTo(w-14,y); c.stroke();
  }

  if (history.length < 2) return;
  const maxT = Math.max(2, history.at(-1).t);
  const maxAlt = Math.max(10, ...history.map(x=>x.altitude));

  c.strokeStyle = "#67b7ff";
  c.lineWidth = 3;
  c.beginPath();
  history.forEach((p,i)=>{
    const x=44+p.t/maxT*(w-64);
    const y=h-22-p.altitude/maxAlt*(h-48);
    if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
  });
  c.stroke();

  c.fillStyle="#8da1b7";
  c.font="12px sans-serif";
  c.fillText("Altitude vs. Rapier simulation time",12,17);
}

function frame(ts) {
  const now = ts / 1000;
  const frameDt = Math.min(0.05, Math.max(0, now - lastFrame));
  lastFrame = now;

  if (simMode !== "idle") {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 10) {
      physicsStep();
      accumulator -= FIXED_DT;
      steps++;
    }
  }

  updateVisualFromPhysics();
  updateTelemetry();
  drawPlot();
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}

// UI bindings
els.landingMode.addEventListener("change", configureEngineLayout);
els.ascentCount.addEventListener("input", configureEngineLayout);
els.reserve.addEventListener("input", configureEngineLayout);
["rocketLength","rocketDiameter"].forEach(id => els[id].addEventListener("change", () => {
  configureEngineLayout();
  resetSimulation();
}));
els.landingBtn.addEventListener("click", startLanding);
els.ascentBtn.addEventListener("click", startAscent);
els.resetBtn.addEventListener("click", resetSimulation);

configureEngineLayout();
resizeRenderer();
resetSimulation();
requestAnimationFrame(ts => {
  lastFrame = ts/1000;
  requestAnimationFrame(frame);
});
