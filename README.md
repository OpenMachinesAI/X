# V3 Phone + PC Cloud 5-EDF Stabilizer

This package is the corrected V3 architecture:

```text
Phone app
  reads phone roll / pitch / yaw
  sends attitude directly to Arduino Uno over USB serial
  sends telemetry to PC through TurboWarp cloud variables
  receives PC commands from TurboWarp and forwards them to the Uno

Arduino Uno
  controls 4 x 40 mm outer EDFs for pitch/roll stabilization
  controls 1 x center EDF for main lift
  has no yaw actuator output
  automatically aborts if yaw drifts too far

PC ground station
  shows telemetry from the phone/cloud link
  sends throttle, PID, arming, level, and STOP commands through cloud variables
```

This is not a full autopilot. It is a hover-stabilization test system using phone attitude data and Arduino motor output. Pitch and roll are actively stabilized with the four 40 mm EDFs. Yaw is only monitored. If yaw drifts more than 50 degrees from the saved heading, the Uno cuts all motors and reports the abort back to the phone and PC.

## Files

- `arduino/Phone_Cloud_EDF_Stabilizer_V3.ino` - Arduino Uno controller.
- `mobile_flight_app.html` - phone app for sensors, Uno serial, cloud telemetry, and command relay.
- `pc_ground_station.html` - PC ground station for telemetry, PID tuning, throttle, and STOP.
- `README.md` - this guide.

## Wiring

ESC signal pins:

```text
Front 40 mm EDF ESC signal -> D5
Right 40 mm EDF ESC signal -> D6
Rear 40 mm EDF ESC signal  -> D9
Left 40 mm EDF ESC signal  -> D10
Center EDF ESC signal      -> D11
All ESC signal grounds     -> Arduino GND
```

The phone connects to the Uno over USB serial where your phone/browser supports it.

Do not connect multiple ESC BEC red wires together unless your power system is intentionally designed for that. The Uno generally needs ESC signal and signal ground only, while motor power comes from the EDF battery systems.

## Control Behavior

Pitch and roll:

```text
Pitch correction -> front/rear 40 mm EDF throttle difference
Roll correction  -> left/right 40 mm EDF throttle difference
```

Yaw:

```text
No yaw vanes
No counter-rotating yaw mix
No active yaw correction
Yaw drift > 50 degrees -> automatic abort and motor shutdown
```

Default limits:

- Center EDF max: 35%
- Outer 40 mm EDF max: 30%
- Default outer max: 18%
- Pitch/roll correction cap: 12%
- Pitch/roll abort: 25 degrees
- Yaw abort: 50 degrees
- Phone attitude timeout: about 170 ms
- Command timeout: about 500 ms

## Setup

1. Upload `arduino/Phone_Cloud_EDF_Stabilizer_V3.ino` to the Uno.
2. Open `mobile_flight_app.html` on the phone.
3. Open `pc_ground_station.html` on the PC.
4. Use the same TurboWarp project ID in both pages.
5. On the phone, press `Enable Sensors`.
6. On the phone, press `Connect Uno`.
7. On both devices, press `Connect Cloud`.
8. With the drone physically level, press `Set Current Pose Upright`.
9. Start at 0% center throttle and verify pitch/roll signs on a restrained rig.

## Test Sequence

1. Clamp or restrain the vehicle.
2. Keep center throttle at 0%.
3. Verify the PC sees phone telemetry through the cloud.
4. Arm only after roll/pitch/yaw values look correct.
5. Tilt the rig past the pitch/roll limit and confirm the Uno aborts.
6. Reset, re-level, arm again.
7. Rotate yaw more than 50 degrees from the saved heading and confirm the Uno aborts.
8. Only after both abort tests work, raise center throttle in 1-2% steps.

## PID Tuning

Tune pitch/roll only.

- Sluggish but stable: raise Rate P a little, then Angle P.
- Slow return to upright: raise Angle P.
- Overshoot or rocking: lower Angle P or add a little Rate D.
- Fast buzz or oscillation: lower Rate P and/or Rate D.
- Persistent lean after P/D tuning: add tiny Rate I.
- Lazy recovery or biased output: reduce Rate I.

Yaw gains do not exist in this version because there is no yaw actuator.

## TurboWarp Cloud Variables

The cloud link is telemetry and PC command relay, not the fast motor-control loop. The phone sends attitude directly to the Uno over USB. The Uno makes the motor cutoff decisions locally.

The pages use numeric cloud variables, including:

```text
Telemetry:
seq
rollCdeg
pitchCdeg
yawCdeg
yawErrCdeg
armed
abort
phoneLive
thr
outerMax
rollOutC
pitchOutC

PC commands:
cmdStop
cmdArm
cmdClearAbort
cmdSetLevel
cmdThrottle
cmdOuterMax
cmdTiltLimit
cmdYawLimit
cmdLimitsSeq
cmdPidSeq
cmdRollAngleP
cmdRollRateP
cmdRollRateI
cmdRollRateD
cmdPitchAngleP
cmdPitchRateP
cmdPitchRateI
cmdPitchRateD
```

## Abort Codes

```text
0 None
1 Operator STOP
2 Phone attitude timeout
3 Command timeout
4 Pitch/roll tilt limit
5 Yaw drift over limit
```

## Reference Concepts

This small system borrows concepts from open flight-controller architecture without copying code:

- ArduPilot separates attitude control from motor mixing: [ArduPilot Copter Attitude Control](https://ardupilot.org/dev/docs/apmcopter-programming-attitude-control-2.html).
- PX4 describes cascaded control and control allocation: [PX4 Controller Diagrams](https://docs.px4.io/main/en/flight_stack/controller_diagrams), [PX4 Control Allocation](https://docs.px4.io/main/en/concept/control_allocation).
- Betaflight documents PID tuning behavior and failsafe thinking: [Betaflight PID Tuning Guide](https://betaflight.com/docs/wiki/guides/current/PID-Tuning-Guide), [Betaflight Failsafe](https://betaflight.com/docs/wiki/guides/current/Failsafe).
- Web Serial is used for the phone-to-Uno link where supported: [Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial), [MDN Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Serial).

## Before Any Untethered Attempt

Add a physical independent kill switch. Do not rely on a cloud STOP button or a browser tab as the only emergency stop. Confirm yaw abort, phone timeout abort, command timeout abort, and pitch/roll abort repeatedly on the restrained rig first.
