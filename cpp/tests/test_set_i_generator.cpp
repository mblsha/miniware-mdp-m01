#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include <sstream>
#include "../processingdata.h"
#include "miniware_mdp_m01.h"
#include <kaitai/kaitaistream.h>

class SetCurrentGeneratorTest : public ::testing::Test {
protected:
    static int argc;
    static char** argv;
    static QCoreApplication* app;
    
    processingData* processor = nullptr;
    
    static void SetUpTestCase() {
        if (!QCoreApplication::instance()) {
            argc = 1;
            argv = new char*[1];
            argv[0] = strdup("test_app");
            app = new QCoreApplication(argc, argv);
        }
    }
    
    static void TearDownTestCase() {
        if (app) {
            delete app;
            app = nullptr;
            free(argv[0]);
            delete[] argv;
        }
    }
    
    void SetUp() override {
        processor = new processingData();
    }
    
    void TearDown() override {
        delete processor;
    }
    
    // Helper to parse QByteArray with Kaitai
    std::unique_ptr<miniware_mdp_m01_t> parseWithKaitai(const QByteArray& data) {
        std::string dataStr(data.constData(), data.size());
        std::istringstream iss(dataStr);
        auto ks = std::make_unique<kaitai::kstream>(&iss);
        return std::make_unique<miniware_mdp_m01_t>(ks.get());
    }
    
    // Helper to manually create expected packet for comparison
    QByteArray createExpectedPacket(uint8_t type, uint8_t channel, const QByteArray& data) {
        QByteArray packet;
        packet.resize(processingData::PACK_HEAD_MAX);
        
        packet[processingData::PACK_HEAD_INDEX0] = 0x5A;
        packet[processingData::PACK_HEAD_INDEX1] = 0x5A;
        packet[processingData::PACK_TYPE_INDEX] = type;
        packet[processingData::PACK_CH_INDEX] = channel;
        
        // Append data
        packet.append(data);
        
        // Set size
        packet[processingData::PACK_SIZE_INDEX] = packet.size();
        
        // Calculate checksum
        uint8_t checksum = 0;
        for (int i = 0; i < data.size(); i++) {
            checksum ^= static_cast<uint8_t>(data[i]);
        }
        packet[processingData::PACK_CHECK] = checksum;
        
        return packet;
    }
    
    // Helper to create voltage/current data
    QByteArray createVoltageCurrentData(uint16_t voltage_mv, uint16_t current_ma) {
        QByteArray data;
        // Voltage - little endian
        data.append(static_cast<char>(voltage_mv & 0xFF));
        data.append(static_cast<char>((voltage_mv >> 8) & 0xFF));
        // Current - little endian
        data.append(static_cast<char>(current_ma & 0xFF));
        data.append(static_cast<char>((current_ma >> 8) & 0xFF));
        return data;
    }
};

// Static members initialization
int SetCurrentGeneratorTest::argc = 0;
char** SetCurrentGeneratorTest::argv = nullptr;
QCoreApplication* SetCurrentGeneratorTest::app = nullptr;

// Test basic PACK_SET_I generation
TEST_F(SetCurrentGeneratorTest, TestSetCurrentPacket) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create data for 5V (5000mV) and 1A (1000mA)
    QByteArray data = createVoltageCurrentData(5000, 1000);
    processor->slotComSendPack(processingData::PACK_SET_I, data, 1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 10);  // 6 header + 4 data
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_I);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 10);    // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 1);     // Channel
        
        // Verify voltage (little endian)
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 5000);
        
        // Verify current (little endian)
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 1000);
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_I);
        EXPECT_EQ(kpacket->size(), 10);
        
        // Cast to set_voltage_current type (same as SET_V)
        auto* vcPacket = static_cast<miniware_mdp_m01_t::set_voltage_current_t*>(kpacket->data());
        ASSERT_NE(vcPacket, nullptr);
        EXPECT_EQ(vcPacket->channel(), 1);
        EXPECT_EQ(vcPacket->voltage_raw(), 5000);
        EXPECT_EQ(vcPacket->current_raw(), 1000);
        EXPECT_FLOAT_EQ(vcPacket->voltage(), 5.0f);  // 5000 / 1000.0
        EXPECT_FLOAT_EQ(vcPacket->current(), 1.0f);  // 1000 / 1000.0
    }
}

// Test using slotSendElectToLower function
TEST_F(SetCurrentGeneratorTest, TestSendElectToLowerFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set values for channel 2
    processor->MDP[2].updatSetPutVoltage = 12000;  // 12V
    processor->MDP[2].updatSetPutCurrent = 2500;   // 2.5A
    processor->MDP[2].updatSetPutFlag = true;
    
    // Send current settings (which actually sends both voltage and current)
    processor->slotSendElectToLower(2);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    // Verify flag was cleared
    EXPECT_FALSE(processor->MDP[2].updatSetPutFlag);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);
        
        // Verify voltage (12000mV)
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 12000);
        
        // Verify current (2500mA)
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 2500);
    }
}

// Test various current values
TEST_F(SetCurrentGeneratorTest, TestVariousCurrentValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    struct TestCase {
        uint16_t voltage;
        uint16_t current;
        const char* description;
    };
    
    TestCase cases[] = {
        {1000, 50, "1V 50mA - Low current"},
        {3300, 2000, "3.3V 2A - Medium current"},
        {5000, 5000, "5V 5A - High current"},
        {24000, 10000, "24V 10A - Very high current"},
        {48000, 100, "48V 100mA - High voltage, low current"}
    };
    
    for (const auto& tc : cases) {
        QByteArray data = createVoltageCurrentData(tc.voltage, tc.current);
        processor->slotComSendPack(processingData::PACK_SET_I, data, 0);
    }
    
    EXPECT_EQ(sendSpy.count(), 5);
    
    // Verify the high current packet (5V 5A)
    if (sendSpy.count() >= 3) {
        QByteArray packet = sendSpy.at(2).at(0).toByteArray();
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(voltage, 5000);
        EXPECT_EQ(current, 5000);
    }
}

// Test packet byte values and checksum
TEST_F(SetCurrentGeneratorTest, TestPacketBytesAndChecksum) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use values that create a specific checksum pattern
    QByteArray data = createVoltageCurrentData(0xABCD, 0xEF12);
    processor->slotComSendPack(processingData::PACK_SET_I, data, 4);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify data bytes
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0xCD);  // Voltage low
        EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0xAB);  // Voltage high
        EXPECT_EQ(static_cast<uint8_t>(packet[8]), 0x12);  // Current low
        EXPECT_EQ(static_cast<uint8_t>(packet[9]), 0xEF);  // Current high
        
        // Verify checksum
        uint8_t expectedChecksum = 0xCD ^ 0xAB ^ 0x12 ^ 0xEF;
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
    }
}

// Test all channels
TEST_F(SetCurrentGeneratorTest, TestAllChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set different current values for each channel
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatSetPutVoltage = 3300;           // Keep voltage constant at 3.3V
        processor->MDP[ch].updatSetPutCurrent = 500 * (ch + 1); // 0.5A, 1A, 1.5A, 2A, 2.5A, 3A
        processor->slotSendElectToLower(ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QByteArray packet = sendSpy.at(ch).at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), ch);
        
        // Verify voltage (should be constant)
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 3300);
        
        // Verify current (should increase)
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 500 * (ch + 1));
    }
}

// Test packet comparison
TEST_F(SetCurrentGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data = createVoltageCurrentData(9000, 1500);
    processor->slotComSendPack(processingData::PACK_SET_I, data, 5);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_I, 5, data);
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test hex representation for current-focused values
TEST_F(SetCurrentGeneratorTest, TestHexRepresentation) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // 3.3V = 0x0CE4, 3A = 0x0BB8
    QByteArray data = createVoltageCurrentData(3300, 3000);
    processor->slotComSendPack(processingData::PACK_SET_I, data, 0);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        QString hexStr = packet.toHex();
        
        // Expected: 5a5a[type]0a00[checksum]e40cb80b
        // where [type] is PACK_SET_I and [checksum] is calculated
        EXPECT_TRUE(hexStr.startsWith("5a5a"));
        EXPECT_TRUE(hexStr.endsWith("e40cb80b"));  // Voltage and current in little endian
    }
}

// Test edge case values
TEST_F(SetCurrentGeneratorTest, TestEdgeCaseValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test zero current
    QByteArray data1 = createVoltageCurrentData(5000, 0);
    processor->slotComSendPack(processingData::PACK_SET_I, data1, 1);
    
    // Test maximum current
    QByteArray data2 = createVoltageCurrentData(5000, 0xFFFF);
    processor->slotComSendPack(processingData::PACK_SET_I, data2, 2);
    
    EXPECT_EQ(sendSpy.count(), 2);
    
    // Verify zero current packet
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.at(0).at(0).toByteArray();
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 0);
    }
    
    // Verify max current packet
    if (sendSpy.count() > 1) {
        QByteArray packet = sendSpy.at(1).at(0).toByteArray();
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 0xFFFF);
    }
}

// Test that PACK_SET_I and PACK_SET_V have same data format
TEST_F(SetCurrentGeneratorTest, TestSameFormatAsSetV) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data = createVoltageCurrentData(4000, 800);
    
    // Send same data with PACK_SET_I
    processor->slotComSendPack(processingData::PACK_SET_I, data, 3);
    
    // Send same data with PACK_SET_V
    processor->slotComSendPack(processingData::PACK_SET_V, data, 3);
    
    EXPECT_EQ(sendSpy.count(), 2);
    
    if (sendSpy.count() >= 2) {
        QByteArray packetI = sendSpy.at(0).at(0).toByteArray();
        QByteArray packetV = sendSpy.at(1).at(0).toByteArray();
        
        // Both packets should have same size
        EXPECT_EQ(packetI.size(), packetV.size());
        
        // Data portion should be identical (bytes 6-9)
        for (int i = 6; i < 10; i++) {
            EXPECT_EQ(packetI[i], packetV[i]);
        }
        
        // Only packet type should differ
        EXPECT_NE(static_cast<uint8_t>(packetI[2]), static_cast<uint8_t>(packetV[2]));
    }
}