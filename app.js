const massInput = document.getElementById("massInput");
const altitudeInput = document.getElementById("altitudeInput");
const speedInput = document.getElementById("speedInput");
const ascentCount = document.getElementById("ascentCount");
const descentCount = document.getElementById("descentCount");

const ascentCountLabel = document.getElementById("ascentCountLabel");
const descentCountLabel = document.getElementById("descentCountLabel");
const statAscent = document.getElementById("statAscent");
const statDescent = document.getElementById("statDescent");

const altitudeReadout = document.getElementById("altitudeReadout");
const speedReadout = document.getElementById("speedReadout");
const accelReadout = document.getElementById("accelReadout");
const timeReadout = document.getElementById("timeReadout");
const burnCue = document.getElementById("burnCue");
const burnReason = document.getElementById("burnReason");

const runBtn = document.getElementById("runBtn");
const resetBtn = document.getElementById("resetBtn");

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

const outerEngines = [...document.querySelectorAll(".engine.outer")];
const centerEngine = document.querySelector(".engine.center");

let state;
let timer = null;
let history = [];

/*
  IMPORTANT:
  These are intentionally fictionalized "simulation units".
  They are NOT real Estes C6 motor data and must not be used for a real rocket.
*/
const SIM = {
  gravity: 9.81,
  fakeCenterThrust: 34,   // fictional N-equivalent
  fakeBurnTime: 1.25,    // fictional seconds
  dragK: 0.010,
  dt: 0.05
};

function updateEngineLayout() {
  const a = Number(ascentCount.value);
  const d = Number(descentCount.value);

  ascentCountLabel.textContent = a;
  descentCountLabel.textContent = d;
  statAscent.textContent = `${a} outer`;
  statDescent.textContent = d ? "1 center" : "0 center";

  outerEngines.forEach((el, i) => {
    el.classList.toggle("ascent", i < a);
  });

  centerEngine.classList.toggle("descent", d === 1);
}

function resetSimulation() {
  if (timer) clearInterval(timer);

  state = {
    mass: Math.max(0.1, Number(massInput.value)),
    altitude: Math.max(0, Number(altitudeInput.value)),
    velocity: -Math.max(0, Number(speedInput.value)),
    acceleration: -SIM.gravity,
    time: 0,
    burnActive: false,
    burnElapsed: 0,
    landed: false
  };

  history = [{
    time: 0,
    altitude: state.altitude,
    velocity: state.velocity
  }];

  updateReadouts();
  drawChart();
}

function estimateBrakingCue() {
  /*
    Deliberately simplified "braking zone":
    estimate a stopping distance from fictional center-motor authority.

    This is a visualization heuristic, not a real burn-timing calculation.
  */
  const engines = Number(descentCount.value);
  if (engines === 0) {
    return {
      ready: false,
      distance: Infinity,
      text: "NO DESCENT ENGINE",
      reason: "The center descent engine is disabled in the simulation."
    };
  }

  const upwardAccel = (SIM.fakeCenterThrust * engines) / state.mass - SIM.gravity;
  if (upwardAccel <= 0) {
    return {
      ready: false,
      distance: Infinity,
      text: "INSUFFICIENT SIM THRUST",
      reason: "In this fictional model, the selected descent setup cannot produce net upward acceleration."
    };
  }

  const speed = Math.abs(state.velocity);
  const stopDistance = (speed * speed) / (2 * upwardAccel);
  const safetyBand = 1.35;
  const cueAltitude = stopDistance * safetyBand + 2;

  return {
    ready: state.altitude <= cueAltitude,
    distance: cueAltitude,
    text: state.altitude <= cueAltitude ? "SIM BURN ZONE" : "COAST",
    reason: `Fictional braking-zone threshold: about ${cueAltitude.toFixed(1)} m at the current simulated speed and mass.`
  };
}

function physicsStep() {
  if (state.landed) return;

  const cue = estimateBrakingCue();

  if (!state.burnActive && cue.ready && Number(descentCount.value) === 1) {
    state.burnActive = true;
    state.burnElapsed = 0;
  }

  let thrust = 0;
  if (state.burnActive && state.burnElapsed < SIM.fakeBurnTime) {
    thrust = SIM.fakeCenterThrust * Number(descentCount.value);
    state.burnElapsed += SIM.dt;
  }

  const drag = -SIM.dragK * state.velocity * Math.abs(state.velocity);
  const accel = (thrust + drag) / state.mass - SIM.gravity;

  state.acceleration = accel;
  state.velocity += accel * SIM.dt;
  state.altitude += state.velocity * SIM.dt;
  state.time += SIM.dt;

  if (state.altitude <= 0) {
    state.altitude = 0;
    state.landed = true;
    clearInterval(timer);
    timer = null;
  }

  history.push({
    time: state.time,
    altitude: state.altitude,
    velocity: state.velocity
  });

  if (history.length > 500) history.shift();

  updateReadouts();
  drawChart();
}

function updateReadouts() {
  const cue = estimateBrakingCue();

  altitudeReadout.textContent = `${state.altitude.toFixed(1)} m`;
  speedReadout.textContent = `${state.velocity.toFixed(1)} m/s`;
  accelReadout.textContent = `${state.acceleration.toFixed(1)} m/s²`;
  timeReadout.textContent = `${state.time.toFixed(1)} s`;

  if (state.landed) {
    const impact = Math.abs(state.velocity);
    burnCue.textContent = impact < 4 ? "SOFT-ish SIM LANDING" : "HARD SIM LANDING";
    burnReason.textContent = `Final fictional touchdown speed: ${impact.toFixed(1)} m/s.`;
  } else if (state.burnActive && state.burnElapsed < SIM.fakeBurnTime) {
    burnCue.textContent = "SIM BURN ACTIVE";
    burnReason.textContent = "The fictional center motor is currently applying braking thrust.";
  } else {
    burnCue.textContent = cue.text;
    burnReason.textContent = cue.reason;
  }
}

function runSimulation() {
  resetSimulation();
  timer = setInterval(physicsStep, SIM.dt * 1000);
}

function drawChart() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#09101e";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(148,163,184,.15)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = 20 + i * ((h - 40) / 5);
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

  if (history.length < 2) return;

  const maxT = Math.max(5, history[history.length - 1].time);
  const maxAlt = Math.max(
    10,
    Number(altitudeInput.value),
    ...history.map(p => p.altitude)
  );

  // altitude trace
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 3;
  ctx.beginPath();

  history.forEach((p, i) => {
    const x = 42 + (p.time / maxT) * (w - 62);
    const y = h - 24 - (p.altitude / maxAlt) * (h - 48);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // current point
  const p = history[history.length - 1];
  const px = 42 + (p.time / maxT) * (w - 62);
  const py = h - 24 - (p.altitude / maxAlt) * (h - 48);

  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px sans-serif";
  ctx.fillText("Altitude vs. simulated time", 16, 18);
}

ascentCount.addEventListener("input", updateEngineLayout);
descentCount.addEventListener("input", updateEngineLayout);
runBtn.addEventListener("click", runSimulation);
resetBtn.addEventListener("click", resetSimulation);

[massInput, altitudeInput, speedInput].forEach(el => {
  el.addEventListener("change", resetSimulation);
});

updateEngineLayout();
resetSimulation();
