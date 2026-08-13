EDF TEST DASHBOARD V2

Files
-----
mobile_flight_test_v2.html
  Phone-side IMU, local PD loop, Web Serial, telemetry, and a LOCAL gate
  which must be armed before remote ground-control throttle commands are accepted.

ground_control_v2.html
  Large desktop dashboard:
  - Artificial horizon
  - 30-second pitch/roll history
  - Current and max attitude/rate
  - RMS attitude statistic
  - Telemetry rate and heartbeat age
  - Four EDF telemetry bars
  - Four manual remote throttle sliders
  - SEND THROTTLE button
  - Large remote STOP button

arduino_esc_receiver.ino
  Local ESC interface with a 300 ms serial timeout and 60% throttle ceiling.

IMPORTANT CONTROL ARCHITECTURE
------------------------------
TurboWarp is NOT in the fast stabilization loop.
Remote commands go:
  PC GCS -> TurboWarp -> phone -> local serial heartbeat -> Arduino -> ESC

The phone must be locally armed before remote throttle commands are accepted.
A cloud disconnect while remote mode is active sends the phone back to SAFE.

The Arduino remains the final local failsafe and stops motors if the phone's
serial heartbeat disappears for 300 ms.

PROTOCOL NOTE
-------------
Client -> TurboWarp messages are one JSON object per WebSocket text frame.
Server -> client may contain multiple JSON set messages separated by newline.

TurboWarp cloud variables are numeric-only and transient.

Set the SAME project ID in both HTML files. The default is:
  example.com/edf-test-rig-v2

TETHERED TEST STAND ONLY
------------------------
This release is designed for a restrained test stand. Do not treat cloud
remote STOP as an emergency-stop system; maintain a local hardware power
disconnect / ESC disarm method appropriate for your test rig.
