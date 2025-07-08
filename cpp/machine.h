#ifndef MACHINE_H
#define MACHINE_H

#include <cstdint>
#include <QColor>

// Mock machine class based on usage in processingdata.cpp
class machine {
public:
    // Machine type enums
    enum machineTypeEnum {
        nodeType = 0,
        P905 = 1,
        P906 = 2,
        L1060 = 3
    };
    
    // Output mode enums
    enum outInModeEnum {
        OFF = 0,
        CC = 1,
        CV = 2,
        CR = 3,
        CP = 4,
        ON = 5
    };
    
    // Output state
    enum {
        OUTPUT_OFF = 0,
        OUTPUT_ON = 1
    };
    // Address and frequency
    uint8_t address[5];
    bool addressFlag;
    uint8_t upDatAddress[5];
    bool updatAddressFlag;
    uint16_t freq;
    uint16_t upDatFreq;
    bool addrEmpty;
    
    // Voltage and current values
    double outPutVoltage;
    double outPutCurrent;
    double outPutPower;
    double inPutVoltage;
    double inPutCurrent;
    double inPutPower;
    double setPutVoltage;
    double setPutCurrent;
    double setPutPower;
    
    // Update values
    uint16_t updatSetPutVoltage;
    uint16_t updatSetPutCurrent;
    bool updatSetPutFlag;
    
    // State flags
    bool outPutState;
    bool updatoutPutState;
    bool updatoutPutStateFlag;
    bool onLine;
    bool onLineUpdatFlag;
    bool lock;
    bool lockUpdatFlag;
    
    // Mode and type
    int outInMode;
    bool outInModeUpdatFlag;
    int machineType;
    bool machineTypeUpdatFlag;
    
    // Visual
    QColor color;
    bool colorUpdatFlag;
    
    // Other
    int NO;
    double temp;
    
    // Constructor
    machine() {
        // Initialize all values to safe defaults
        for(int i = 0; i < 5; i++) {
            address[i] = 0;
            upDatAddress[i] = 0;
        }
        addressFlag = false;
        updatAddressFlag = false;
        freq = 2400;
        upDatFreq = 2400;
        addrEmpty = true;
        
        outPutVoltage = 0.0;
        outPutCurrent = 0.0;
        outPutPower = 0.0;
        inPutVoltage = 0.0;
        inPutCurrent = 0.0;
        inPutPower = 0.0;
        setPutVoltage = 0.0;
        setPutCurrent = 0.0;
        setPutPower = 0.0;
        
        updatSetPutVoltage = 0;
        updatSetPutCurrent = 0;
        updatSetPutFlag = false;
        
        outPutState = false;
        updatoutPutState = false;
        updatoutPutStateFlag = false;
        onLine = false;
        onLineUpdatFlag = false;
        lock = false;
        lockUpdatFlag = false;
        
        outInMode = 0;
        outInModeUpdatFlag = false;
        machineType = 0;
        machineTypeUpdatFlag = false;
        
        color = QColor(0, 0, 0);
        colorUpdatFlag = false;
        
        NO = 0;
        temp = 0.0;
    }
};

#endif // MACHINE_H