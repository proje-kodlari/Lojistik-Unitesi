#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "HX711.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <RTClib.h>

// --- BLE UUID'leri ---
#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e" // Giden Veri
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e" // Gelen Komut (YENİ)

// --- PINLER ---
#define ONE_WIRE_BUS 4 
#define SS_PIN  5
#define RST_PIN 15
#define LOADCELL_DOUT_PIN 32 
#define LOADCELL_SCK_PIN 33  
#define HEATER_PIN 26 // YENİ: IRLZ44N Mosfet'in Gate Pini

// --- NESNELER ---
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
HX711 scale;
MFRC522 mfrc522(SS_PIN, RST_PIN);
RTC_DS3231 rtc;

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool heaterState = false; // Isıtıcının fiziksel durumu

// --- YENİ: SİTEDEN GELEN KOMUTLARI DİNLEME CALLBACK'İ ---
class MyRxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue().c_str();
      if (rxValue.length() > 0) {
        if (rxValue == "H_ON") {
          heaterState = true;
          digitalWrite(HEATER_PIN, HIGH); // Isıtıcıyı Aç
          Serial.println("Komut Geldi: Isitici ACIK");
        } 
        else if (rxValue == "H_OFF") {
          heaterState = false;
          digitalWrite(HEATER_PIN, LOW); // Isıtıcıyı Kapat
          Serial.println("Komut Geldi: Isitici KAPALI");
        }
      }
    }
};

// --- BAĞLANTI DURUMU CALLBACK'İ ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; Serial.println("Cihaz Baglandi!"); };
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; pServer->getAdvertising()->start(); }
};

void setup() {
  Serial.begin(115200);

  // Isıtıcı Pini Ayarı
  pinMode(HEATER_PIN, OUTPUT);
  digitalWrite(HEATER_PIN, LOW); // Başlangıçta kapalı

  // SPI ve RFID
  SPI.begin(); 
  mfrc522.PCD_Init(); 

  // Sensörler
  sensors.begin();
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(); 
  scale.tare();

  // DS3231
  Wire.begin(21, 22);
  if (rtc.begin() && rtc.lostPower()) {
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // BLE Başlatma
  BLEDevice::init("ESP32_IoT_Sistemi");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  // TX (Veri Gönderme) Kanalı
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  pTxCharacteristic->addDescriptor(new BLE2902());
  
  // RX (Veri Alma) Kanalı YENİ!
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                                           CHARACTERISTIC_UUID_RX,
                                           BLECharacteristic::PROPERTY_WRITE
                                         );
  pRxCharacteristic->setCallbacks(new MyRxCallbacks()); // Dinleyiciyi bağla

  pService->start();
  pServer->getAdvertising()->start();
}

void loop() {
  if (deviceConnected) {
    StaticJsonDocument<300> doc;
    bool dataToSend = false;

    // A. RFID
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
      String uidString = "";
      for (byte i = 0; i < mfrc522.uid.size; i++) {
        uidString += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
        uidString += String(mfrc522.uid.uidByte[i], HEX);
        if (i < mfrc522.uid.size - 1) uidString += ":";
      }
      uidString.toUpperCase();
      doc["r"] = uidString; 
      doc["ts"] = rtc.now().unixtime(); 
      dataToSend = true;
      mfrc522.PICC_HaltA();
      mfrc522.PCD_StopCrypto1();
    }

    // B. RUTİN SENSÖR VERİSİ
    static unsigned long lastTime = 0;
    if (millis() - lastTime > 2000) { 
      sensors.requestTemperatures();
      float tempC = sensors.getTempCByIndex(0);
      float weight = scale.is_ready() ? scale.get_units(5) : 0;
      
      doc["w"] = weight;
      doc["t"] = tempC;
      doc["h"] = heaterState ? 1 : 0; // YENİ: Sitede görmek için ısıtıcının fiziksel durumu
      doc["ts"] = rtc.now().unixtime(); 
      
      dataToSend = true;
      lastTime = millis();
    }

    // C. GÖNDERİM
    if (dataToSend) {
      char jsonString[200];
      serializeJson(doc, jsonString);
      pTxCharacteristic->setValue(jsonString);
      pTxCharacteristic->notify();
    }
  }
  delay(10);
}