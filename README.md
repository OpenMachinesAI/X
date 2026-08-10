# Rapier 3D Rocket Landing Simulator

This is a browser-based classroom simulation.

## Run it

Because the app uses ES modules, serve the folder with a small local web server rather than double-clicking the HTML file.

Python:
```bash
python -m http.server 8000
```

Then open:
```text
http://localhost:8000
```

No npm install is required. The browser loads:
- Three.js 0.185.1
- @dimforge/rapier3d-compat 0.20.0

from jsDelivr.

## Physics improvements

- Rapier 3D dynamic rigid body
- fixed 120 Hz physics timestep
- Earth gravity (9.80665 m/s²)
- continuous collision detection
- capsule collider
- custom mass/inertia updates as propellant changes
- quadratic aerodynamic drag using air-relative velocity
- optional crosswind
- motor forces applied at their physical mount points using Rapier `addForceAtPoint`
- 3D orientation and angular velocity
- automatic simulation-only landing prediction that accounts for current tilt
- ground collision handled by Rapier

## Motor reference values represented

The UI uses the previously established classroom C6-5 reference values:
- loaded mass: 24.1 g
- propellant mass: 12.2 g
- published duration: 1.60 s
- published peak thrust: 15.3 N
- NAR listed tested impulse: 6.93 N·s

The in-app thrust curve is a smooth educational approximation normalized to the listed tested impulse. It is not a sample-for-sample certification trace.

## Safety boundary

The automatic controller exists only inside this browser simulation.
There are no hardware, radio, serial, GPIO, deployment, or avionics interfaces.
