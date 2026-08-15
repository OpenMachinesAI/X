/*
  Phone_Cloud_EDF_Stabilizer_V3

  Arduino Uno controller for:
    - 4 x 40 mm outer EDFs for pitch/roll stabilization
    - 1 x center EDF for main lift
    - no yaw vanes / no yaw actuator
    - phone orientation sent over USB serial
    - PC telemetry relayed by the phone over TurboWarp cloud variables

  Yaw behavior:
    Yaw is NOT actively controlled in this version. If yaw drifts more than
    50 degrees from the saved upright heading, the Uno automatically aborts
    and cuts all motors. The abort reason is included in telemetry.

  Serial commands from phone:
    HELLO
    ARM 4279
    DISARM
    STOP
    ATT <rollDeg> <pitchDeg> <yawDeg>
    SET THR <0..35>
    SET OUTERMAX <0..30>
    SET LEVEL <rollDeg> <pitchDeg> <yawDeg>
    SET LIMIT <tiltDeg> <yawDeg>
    SET PID ROLL <angleP> <rateP> <rateI> <rateD>
    SET PID PITCH <angleP> <rateP> <rateI> <rateD>
    SET MIX <rollSign:-1|1> <pitchSign:-1|1>
    CLEARABORT
    SAVE
    LOAD
*/

#include <Servo.h>
#include <EEPROM.h>
#include <math.h>

const uint8_t FRONT_PIN  = 5;
const uint8_t RIGHT_PIN  = 6;
const uint8_t REAR_PIN   = 9;
const uint8_t LEFT_PIN   = 10;
const uint8_t CENTER_PIN = 11;

const int ESC_MIN_US = 1000;
const int ESC_MAX_US = 2000;
const int MAX_CENTER_PERCENT = 35;
const int MAX_OUTER_PERCENT = 30;
const int MAX_CORRECTION_PERCENT = 12;
const uint32_t PHONE_TIMEOUT_MS = 170;
const uint32_t COMMAND_TIMEOUT_MS = 500;
const uint32_t TELEMETRY_PERIOD_MS = 50;
const uint32_t CONTROL_PERIOD_US = 5000;
const int ARM_CODE = 4279;

enum AbortCode {
  ABORT_NONE = 0,
  ABORT_OPERATOR_STOP = 1,
  ABORT_PHONE_TIMEOUT = 2,
  ABORT_COMMAND_TIMEOUT = 3,
  ABORT_TILT_LIMIT = 4,
  ABORT_YAW_LIMIT = 5
};

Servo escFront;
Servo escRight;
Servo escRear;
Servo escLeft;
Servo escCenter;

struct AxisConfig {
  float angleP;
  float rateP;
  float rateI;
  float rateD;
};

struct StoredConfig {
  uint32_t magic;
  AxisConfig roll;
  AxisConfig pitch;
  int16_t rollTrimCdeg;
  int16_t pitchTrimCdeg;
  int16_t yawTrimCdeg;
  int16_t maxTiltCdeg;
  int16_t maxYawCdeg;
  int8_t rollSign;
  int8_t pitchSign;
  uint8_t outerMaxPercent;
};

const uint32_t CONFIG_MAGIC = 0xEDFV3003UL;

StoredConfig cfg = {
  CONFIG_MAGIC,
  { 2.0f, 0.030f, 0.000f, 0.0010f },
  { 2.0f, 0.030f, 0.000f, 0.0010f },
  0,
  0,
  0,
  2500,  // max pitch/roll tilt = 25 deg
  5000,  // max yaw drift = 50 deg
  1,
  1,
  18
};

struct AxisState {
  float i;
  float lastRateError;
  float lastAngleDeg;
  float outputPercent;
};

AxisState rollPid = {0, 0, 0, 0};
AxisState pitchPid = {0, 0, 0, 0};

bool armed = false;
bool stopLatched = true;
bool phoneFresh = false;
uint8_t centerThrottlePercent = 0;
AbortCode abortCode = ABORT_NONE;

float phoneRollDeg = 0.0f;
float phonePitchDeg = 0.0f;
float phoneYawDeg = 0.0f;
float yawErrorDeg = 0.0f;

uint32_t lastPhoneMs = 0;
uint32_t lastCommandMs = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastControlUs = 0;
String inputLine;

float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

float wrap180(float deg) {
  while (deg > 180.0f) deg -= 360.0f;
  while (deg < -180.0f) deg += 360.0f;
  return deg;
}

int percentToUs(float percent) {
  percent = clampf(percent, 0.0f, 100.0f);
  return ESC_MIN_US + (int)((ESC_MAX_US - ESC_MIN_US) * (percent / 100.0f));
}

void writeAllMin() {
  escFront.writeMicroseconds(ESC_MIN_US);
  escRight.writeMicroseconds(ESC_MIN_US);
  escRear.writeMicroseconds(ESC_MIN_US);
  escLeft.writeMicroseconds(ESC_MIN_US);
  escCenter.writeMicroseconds(ESC_MIN_US);
}

void resetPid() {
  rollPid.i = 0;
  rollPid.lastRateError = 0;
  rollPid.lastAngleDeg = phoneRollDeg;
  rollPid.outputPercent = 0;
  pitchPid.i = 0;
  pitchPid.lastRateError = 0;
  pitchPid.lastAngleDeg = phonePitchDeg;
  pitchPid.outputPercent = 0;
}

void abortAndCut(AbortCode code) {
  abortCode = code;
  armed = false;
  stopLatched = true;
  centerThrottlePercent = 0;
  resetPid();
  writeAllMin();
  Serial.print(F("EVT abort code="));
  Serial.println((int)abortCode);
}

void disarmNoAbort() {
  armed = false;
  stopLatched = true;
  centerThrottlePercent = 0;
  resetPid();
  writeAllMin();
  Serial.println(F("EVT disarmed"));
}

void saveConfig() {
  cfg.magic = CONFIG_MAGIC;
  EEPROM.put(0, cfg);
  Serial.println(F("EVT config_saved"));
}

void loadConfig() {
  StoredConfig loaded;
  EEPROM.get(0, loaded);
  if (loaded.magic == CONFIG_MAGIC &&
      loaded.outerMaxPercent <= MAX_OUTER_PERCENT &&
      loaded.maxTiltCdeg > 0 &&
      loaded.maxYawCdeg > 0) {
    cfg = loaded;
    Serial.println(F("EVT config_loaded source=eeprom"));
  } else {
    Serial.println(F("EVT config_loaded source=defaults"));
  }
}

void printConfig() {
  Serial.print(F("CFG rollAngleP=")); Serial.print(cfg.roll.angleP, 4);
  Serial.print(F(" rollRateP=")); Serial.print(cfg.roll.rateP, 5);
  Serial.print(F(" rollRateI=")); Serial.print(cfg.roll.rateI, 5);
  Serial.print(F(" rollRateD=")); Serial.print(cfg.roll.rateD, 5);
  Serial.print(F(" pitchAngleP=")); Serial.print(cfg.pitch.angleP, 4);
  Serial.print(F(" pitchRateP=")); Serial.print(cfg.pitch.rateP, 5);
  Serial.print(F(" pitchRateI=")); Serial.print(cfg.pitch.rateI, 5);
  Serial.print(F(" pitchRateD=")); Serial.print(cfg.pitch.rateD, 5);
  Serial.print(F(" rollTrim=")); Serial.print(cfg.rollTrimCdeg / 100.0f, 2);
  Serial.print(F(" pitchTrim=")); Serial.print(cfg.pitchTrimCdeg / 100.0f, 2);
  Serial.print(F(" yawTrim=")); Serial.print(cfg.yawTrimCdeg / 100.0f, 2);
  Serial.print(F(" maxTilt=")); Serial.print(cfg.maxTiltCdeg / 100.0f, 1);
  Serial.print(F(" maxYaw=")); Serial.print(cfg.maxYawCdeg / 100.0f, 1);
  Serial.print(F(" rollSign=")); Serial.print(cfg.rollSign);
  Serial.print(F(" pitchSign=")); Serial.print(cfg.pitchSign);
  Serial.print(F(" outerMax=")); Serial.println(cfg.outerMaxPercent);
}

float runAxis(AxisConfig axis, AxisState &state, float angleDeg, float trimDeg, float dt) {
  float measuredRate = (angleDeg - state.lastAngleDeg) / dt;
  state.lastAngleDeg = angleDeg;

  float angleError = trimDeg - angleDeg;
  float desiredRateDps = clampf(axis.angleP * angleError, -80.0f, 80.0f);
  float rateError = desiredRateDps - measuredRate;

  state.i += rateError * axis.rateI * dt;
  state.i = clampf(state.i, -MAX_CORRECTION_PERCENT, MAX_CORRECTION_PERCENT);

  float d = (rateError - state.lastRateError) / dt;
  state.lastRateError = rateError;

  float out = axis.rateP * rateError + state.i + axis.rateD * d;
  state.outputPercent = clampf(out, -MAX_CORRECTION_PERCENT, MAX_CORRECTION_PERCENT);
  return state.outputPercent;
}

AbortCode attitudeAbortCode() {
  float maxTilt = cfg.maxTiltCdeg / 100.0f;
  float maxYaw = cfg.maxYawCdeg / 100.0f;
  yawErrorDeg = wrap180(phoneYawDeg - cfg.yawTrimCdeg / 100.0f);

  if (fabs(phoneRollDeg - cfg.rollTrimCdeg / 100.0f) > maxTilt) return ABORT_TILT_LIMIT;
  if (fabs(phonePitchDeg - cfg.pitchTrimCdeg / 100.0f) > maxTilt) return ABORT_TILT_LIMIT;
  if (fabs(yawErrorDeg) > maxYaw) return ABORT_YAW_LIMIT;
  return ABORT_NONE;
}

void applyMotorMix(float rollCorrection, float pitchCorrection) {
  float outerBase = armed ? clampf(centerThrottlePercent * 0.20f, 0.0f, cfg.outerMaxPercent) : 0.0f;
  float roll = cfg.rollSign * rollCorrection;
  float pitch = cfg.pitchSign * pitchCorrection;

  float front = clampf(outerBase + pitch, 0.0f, cfg.outerMaxPercent);
  float rear = clampf(outerBase - pitch, 0.0f, cfg.outerMaxPercent);
  float right = clampf(outerBase - roll, 0.0f, cfg.outerMaxPercent);
  float left = clampf(outerBase + roll, 0.0f, cfg.outerMaxPercent);
  float center = clampf(centerThrottlePercent, 0.0f, MAX_CENTER_PERCENT);

  escFront.writeMicroseconds(percentToUs(front));
  escRear.writeMicroseconds(percentToUs(rear));
  escRight.writeMicroseconds(percentToUs(right));
  escLeft.writeMicroseconds(percentToUs(left));
  escCenter.writeMicroseconds(percentToUs(center));
}

void controlStep() {
  uint32_t nowMs = millis();
  phoneFresh = (nowMs - lastPhoneMs) <= PHONE_TIMEOUT_MS;

  if (armed && (nowMs - lastCommandMs > COMMAND_TIMEOUT_MS)) {
    abortAndCut(ABORT_COMMAND_TIMEOUT);
    return;
  }
  if (armed && !phoneFresh) {
    abortAndCut(ABORT_PHONE_TIMEOUT);
    return;
  }
  if (armed) {
    AbortCode code = attitudeAbortCode();
    if (code != ABORT_NONE) {
      abortAndCut(code);
      return;
    }
  }
  if (!armed || stopLatched) {
    writeAllMin();
    return;
  }

  float dt = CONTROL_PERIOD_US / 1000000.0f;
  float rollTrimDeg = cfg.rollTrimCdeg / 100.0f;
  float pitchTrimDeg = cfg.pitchTrimCdeg / 100.0f;
  float rollOut = runAxis(cfg.roll, rollPid, phoneRollDeg, rollTrimDeg, dt);
  float pitchOut = runAxis(cfg.pitch, pitchPid, phonePitchDeg, pitchTrimDeg, dt);
  applyMotorMix(rollOut, pitchOut);
}

void sendTelemetry() {
  Serial.print(F("TEL ms=")); Serial.print(millis());
  Serial.print(F(" armed=")); Serial.print(armed ? 1 : 0);
  Serial.print(F(" stop=")); Serial.print(stopLatched ? 1 : 0);
  Serial.print(F(" abort=")); Serial.print((int)abortCode);
  Serial.print(F(" phone=")); Serial.print(phoneFresh ? 1 : 0);
  Serial.print(F(" roll=")); Serial.print(phoneRollDeg, 2);
  Serial.print(F(" pitch=")); Serial.print(phonePitchDeg, 2);
  Serial.print(F(" yaw=")); Serial.print(phoneYawDeg, 2);
  Serial.print(F(" yawErr=")); Serial.print(yawErrorDeg, 2);
  Serial.print(F(" ro=")); Serial.print(rollPid.outputPercent, 2);
  Serial.print(F(" po=")); Serial.print(pitchPid.outputPercent, 2);
  Serial.print(F(" thr=")); Serial.print(centerThrottlePercent);
  Serial.print(F(" outerMax=")); Serial.print(cfg.outerMaxPercent);
  Serial.print(F(" maxTilt=")); Serial.print(cfg.maxTiltCdeg / 100.0f, 1);
  Serial.print(F(" maxYaw=")); Serial.println(cfg.maxYawCdeg / 100.0f, 1);
}

char *nextToken(char *&p) {
  while (*p == ' ') p++;
  if (*p == '\0') return NULL;
  char *start = p;
  while (*p && *p != ' ') p++;
  if (*p) {
    *p = '\0';
    p++;
  }
  return start;
}

void markCommandAlive() {
  lastCommandMs = millis();
}

void handleCommand(char *line) {
  char *p = line;
  char *cmd = nextToken(p);
  if (!cmd) return;

  if (!strcmp(cmd, "HELLO")) {
    markCommandAlive();
    Serial.println(F("EVT hello v=3 phone_cloud_pitch_roll_only=1"));
    printConfig();
    return;
  }

  if (!strcmp(cmd, "ATT")) {
    char *r = nextToken(p);
    char *q = nextToken(p);
    char *y = nextToken(p);
    if (!r || !q || !y) {
      Serial.println(F("ERR att_needs_roll_pitch_yaw"));
      return;
    }
    phoneRollDeg = atof(r);
    phonePitchDeg = atof(q);
    phoneYawDeg = atof(y);
    yawErrorDeg = wrap180(phoneYawDeg - cfg.yawTrimCdeg / 100.0f);
    lastPhoneMs = millis();
    markCommandAlive();
    return;
  }

  if (!strcmp(cmd, "ARM")) {
    char *codeTok = nextToken(p);
    int code = codeTok ? atoi(codeTok) : 0;
    markCommandAlive();
    if (code != ARM_CODE) {
      Serial.println(F("ERR arm_bad_code"));
      return;
    }
    phoneFresh = (millis() - lastPhoneMs) <= PHONE_TIMEOUT_MS;
    if (!phoneFresh) {
      Serial.println(F("ERR arm_requires_phone_attitude"));
      return;
    }
    AbortCode attitudeCode = attitudeAbortCode();
    if (attitudeCode != ABORT_NONE) {
      Serial.println(F("ERR arm_attitude_limit"));
      return;
    }
    abortCode = ABORT_NONE;
    centerThrottlePercent = 0;
    stopLatched = false;
    armed = true;
    resetPid();
    Serial.println(F("EVT armed"));
    return;
  }

  if (!strcmp(cmd, "DISARM")) {
    markCommandAlive();
    disarmNoAbort();
    return;
  }

  if (!strcmp(cmd, "STOP")) {
    markCommandAlive();
    abortAndCut(ABORT_OPERATOR_STOP);
    return;
  }

  if (!strcmp(cmd, "CLEARABORT")) {
    markCommandAlive();
    if (!armed) abortCode = ABORT_NONE;
    Serial.println(F("EVT abort_cleared"));
    return;
  }

  if (!strcmp(cmd, "SAVE")) {
    markCommandAlive();
    saveConfig();
    return;
  }

  if (!strcmp(cmd, "LOAD")) {
    markCommandAlive();
    loadConfig();
    printConfig();
    return;
  }

  if (!strcmp(cmd, "SET")) {
    char *kind = nextToken(p);
    if (!kind) {
      Serial.println(F("ERR set_missing_kind"));
      return;
    }
    markCommandAlive();

    if (!strcmp(kind, "THR")) {
      char *v = nextToken(p);
      centerThrottlePercent = constrain(v ? atoi(v) : 0, 0, MAX_CENTER_PERCENT);
      Serial.println(F("EVT throttle_set"));
      return;
    }

    if (!strcmp(kind, "OUTERMAX")) {
      char *v = nextToken(p);
      cfg.outerMaxPercent = constrain(v ? atoi(v) : cfg.outerMaxPercent, 0, MAX_OUTER_PERCENT);
      Serial.println(F("EVT outermax_set"));
      return;
    }

    if (!strcmp(kind, "LEVEL")) {
      char *r = nextToken(p);
      char *q = nextToken(p);
      char *y = nextToken(p);
      cfg.rollTrimCdeg = (int16_t)(atof(r ? r : "0") * 100.0f);
      cfg.pitchTrimCdeg = (int16_t)(atof(q ? q : "0") * 100.0f);
      cfg.yawTrimCdeg = (int16_t)(atof(y ? y : "0") * 100.0f);
      resetPid();
      Serial.println(F("EVT level_set"));
      return;
    }

    if (!strcmp(kind, "LIMIT")) {
      char *t = nextToken(p);
      char *y = nextToken(p);
      cfg.maxTiltCdeg = (int16_t)(clampf(atof(t ? t : "25"), 5.0f, 60.0f) * 100.0f);
      cfg.maxYawCdeg = (int16_t)(clampf(atof(y ? y : "50"), 5.0f, 180.0f) * 100.0f);
      Serial.println(F("EVT limits_set"));
      return;
    }

    if (!strcmp(kind, "MIX")) {
      char *r = nextToken(p);
      char *q = nextToken(p);
      int rs = r ? atoi(r) : cfg.rollSign;
      int ps = q ? atoi(q) : cfg.pitchSign;
      cfg.rollSign = rs < 0 ? -1 : 1;
      cfg.pitchSign = ps < 0 ? -1 : 1;
      Serial.println(F("EVT mix_set"));
      return;
    }

    if (!strcmp(kind, "PID")) {
      char *axisTok = nextToken(p);
      char *a = nextToken(p);
      char *rp = nextToken(p);
      char *ri = nextToken(p);
      char *rd = nextToken(p);
      if (!axisTok || !a || !rp || !ri || !rd) {
        Serial.println(F("ERR pid_needs_axis_and_4_values"));
        return;
      }
      AxisConfig *axis = NULL;
      if (!strcmp(axisTok, "ROLL")) axis = &cfg.roll;
      if (!strcmp(axisTok, "PITCH")) axis = &cfg.pitch;
      if (!axis) {
        Serial.println(F("ERR pid_axis"));
        return;
      }
      axis->angleP = clampf(atof(a), 0.0f, 12.0f);
      axis->rateP = clampf(atof(rp), 0.0f, 0.300f);
      axis->rateI = clampf(atof(ri), 0.0f, 0.100f);
      axis->rateD = clampf(atof(rd), 0.0f, 0.020f);
      resetPid();
      Serial.println(F("EVT pid_set"));
      printConfig();
      return;
    }
  }

  Serial.print(F("ERR unknown_command "));
  Serial.println(cmd);
}

void readSerialCommands() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      inputLine.trim();
      if (inputLine.length() > 0) {
        char buf[112];
        inputLine.toCharArray(buf, sizeof(buf));
        handleCommand(buf);
      }
      inputLine = "";
    } else if (inputLine.length() < 111) {
      inputLine += c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  escFront.attach(FRONT_PIN);
  escRight.attach(RIGHT_PIN);
  escRear.attach(REAR_PIN);
  escLeft.attach(LEFT_PIN);
  escCenter.attach(CENTER_PIN);
  writeAllMin();
  loadConfig();
  lastCommandMs = millis();
  lastControlUs = micros();
  Serial.println(F("EVT booted v=3 four_40mm_pitch_roll_yaw_abort=1"));
}

void loop() {
  readSerialCommands();

  uint32_t nowUs = micros();
  if ((uint32_t)(nowUs - lastControlUs) >= CONTROL_PERIOD_US) {
    lastControlUs += CONTROL_PERIOD_US;
    controlStep();
  }

  uint32_t nowMs = millis();
  if (nowMs - lastTelemetryMs >= TELEMETRY_PERIOD_MS) {
    lastTelemetryMs = nowMs;
    sendTelemetry();
  }
}
