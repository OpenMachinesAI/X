#include <Servo.h>

// Tethered test-stand ESC receiver.
// Front / Right / Rear / Left on D5 / D6 / D9 / D10.

Servo escFront, escRight, escRear, escLeft;

const int PIN_FRONT=5, PIN_RIGHT=6, PIN_REAR=9, PIN_LEFT=10;
const int ESC_MIN_US=1000, ESC_MAX_US=2000;
const int MAX_THROTTLE=60;
const unsigned long COMMAND_TIMEOUT_MS=300;

int cmd[4]={0,0,0,0};
unsigned long lastCommandMs=0;

int cap(int x){return constrain(x,0,MAX_THROTTLE);}
int pulse(int x){return map(cap(x),0,100,ESC_MIN_US,ESC_MAX_US);}

void apply(){
  escFront.writeMicroseconds(pulse(cmd[0]));
  escRight.writeMicroseconds(pulse(cmd[1]));
  escRear.writeMicroseconds(pulse(cmd[2]));
  escLeft.writeMicroseconds(pulse(cmd[3]));
}
void stopAll(){for(int i=0;i<4;i++)cmd[i]=0;apply();}

void parse(String s){
  s.trim();
  if(s=="STOP"){stopAll();lastCommandMs=millis();Serial.println("ACK,STOP");return;}
  if(!s.startsWith("M,"))return;
  int p=2;
  for(int i=0;i<4;i++){
    int c=s.indexOf(',',p);
    String token=(i<3)?s.substring(p,c):s.substring(p);
    if(i<3&&c<0)return;
    cmd[i]=cap(token.toInt());
    if(i<3)p=c+1;
  }
  apply();lastCommandMs=millis();
  Serial.print("ACK");for(int i=0;i<4;i++){Serial.print(",");Serial.print(cmd[i]);}Serial.println();
}

void setup(){
  Serial.begin(115200);
  escFront.attach(PIN_FRONT,ESC_MIN_US,ESC_MAX_US);
  escRight.attach(PIN_RIGHT,ESC_MIN_US,ESC_MAX_US);
  escRear.attach(PIN_REAR,ESC_MIN_US,ESC_MAX_US);
  escLeft.attach(PIN_LEFT,ESC_MIN_US,ESC_MAX_US);
  stopAll();delay(4000);lastCommandMs=millis();Serial.println("READY");
}
void loop(){
  if(Serial.available())parse(Serial.readStringUntil('\n'));
  if(millis()-lastCommandMs>COMMAND_TIMEOUT_MS){
    if(cmd[0]||cmd[1]||cmd[2]||cmd[3]){stopAll();Serial.println("FAILSAFE,TIMEOUT");}
  }
}
