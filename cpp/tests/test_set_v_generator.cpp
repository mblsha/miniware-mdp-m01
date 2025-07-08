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

class SetVoltageGeneratorTest : public ::testing::Test {
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
int SetVoltageGeneratorTest::argc = 0;
char** SetVoltageGeneratorTest::argv = nullptr;
QCoreApplication* SetVoltageGeneratorTest::app = nullptr;

// Test basic PACK_SET_V generation
TEST_F(SetVoltageGeneratorTest, TestSetVoltagePacket) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create data for 3.3V (3300mV) and 500mA
    QByteArray data = createVoltageCurrentData(3300, 500);
    processor->slotComSendPack(processingData::PACK_SET_V, data, 2);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 10);  // 6 header + 4 data
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_V);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 10);    // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);     // Channel
        
        // Verify voltage (little endian)
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 3300);
        
        // Verify current (little endian)
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 500);
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_V);
        EXPECT_EQ(kpacket->size(), 10);
        
        // Cast to set_voltage_current type
        auto* vcPacket = static_cast<miniware_mdp_m01_t::set_voltage_current_t*>(kpacket->data());
        ASSERT_NE(vcPacket, nullptr);
        EXPECT_EQ(vcPacket->channel(), 2);
        EXPECT_EQ(vcPacket->voltage_raw(), 3300);
        EXPECT_EQ(vcPacket->current_raw(), 500);
        EXPECT_FLOAT_EQ(vcPacket->voltage(), 3.3f);  // 3300 / 1000.0
        EXPECT_FLOAT_EQ(vcPacket->current(), 0.5f);  // 500 / 1000.0
    }
}

// Test using slotSendVoltaToLower function
TEST_F(SetVoltageGeneratorTest, TestSendVoltaToLowerFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set values for channel 1
    processor->MDP[1].updatSetPutVoltage = 5000;  // 5V
    processor->MDP[1].updatSetPutCurrent = 1000;  // 1A
    processor->MDP[1].updatSetPutFlag = true;
    
    // Send voltage/current settings
    processor->slotSendVoltaToLower(1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    // Verify flag was cleared
    EXPECT_FALSE(processor->MDP[1].updatSetPutFlag);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 1);
        
        // Verify voltage (5000mV)
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 5000);
        
        // Verify current (1000mA)
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 1000);
    }
}

// Test various voltage/current combinations
TEST_F(SetVoltageGeneratorTest, TestVariousVoltageCurrent) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    struct TestCase {
        uint16_t voltage;
        uint16_t current;
        const char* description;
    };
    
    TestCase cases[] = {
        {0, 0, "Zero voltage and current"},
        {12000, 2000, "12V 2A"},
        {65535, 65535, "Maximum values"},
        {1000, 100, "1V 0.1A"},
        {3300, 750, "3.3V 0.75A"}
    };
    
    for (const auto& tc : cases) {
        QByteArray data = createVoltageCurrentData(tc.voltage, tc.current);
        processor->slotComSendPack(processingData::PACK_SET_V, data, 0);
    }
    
    EXPECT_EQ(sendSpy.count(), 5);
    
    // Verify last packet (3.3V 0.75A)
    if (sendSpy.count() >= 5) {
        QByteArray packet = sendSpy.at(4).at(0).toByteArray();
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(voltage, 3300);
        EXPECT_EQ(current, 750);
    }
}

// Test packet byte values and checksum
TEST_F(SetVoltageGeneratorTest, TestPacketBytesAndChecksum) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use values that create a specific checksum pattern
    QByteArray data = createVoltageCurrentData(0x1234, 0x5678);
    processor->slotComSendPack(processingData::PACK_SET_V, data, 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify data bytes
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0x34);  // Voltage low
        EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0x12);  // Voltage high
        EXPECT_EQ(static_cast<uint8_t>(packet[8]), 0x78);  // Current low
        EXPECT_EQ(static_cast<uint8_t>(packet[9]), 0x56);  // Current high
        
        // Verify checksum
        uint8_t expectedChecksum = 0x34 ^ 0x12 ^ 0x78 ^ 0x56;
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
    }
}

// Test all channels
TEST_F(SetVoltageGeneratorTest, TestAllChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set different values for each channel
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatSetPutVoltage = 1000 * (ch + 1);  // 1V, 2V, ..., 6V
        processor->MDP[ch].updatSetPutCurrent = 100 * (ch + 1);   // 0.1A, 0.2A, ..., 0.6A
        processor->slotSendVoltaToLower(ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QByteArray packet = sendSpy.at(ch).at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), ch);
        
        // Verify voltage
        uint16_t voltage = static_cast<uint8_t>(packet[6]) | (static_cast<uint8_t>(packet[7]) << 8);
        EXPECT_EQ(voltage, 1000 * (ch + 1));
        
        // Verify current
        uint16_t current = static_cast<uint8_t>(packet[8]) | (static_cast<uint8_t>(packet[9]) << 8);
        EXPECT_EQ(current, 100 * (ch + 1));
    }
}

// Test packet comparison
TEST_F(SetVoltageGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data = createVoltageCurrentData(2500, 300);
    processor->slotComSendPack(processingData::PACK_SET_V, data, 4);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_V, 4, data);
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test hex representation
TEST_F(SetVoltageGeneratorTest, TestHexRepresentation) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // 3.3V = 0x0CE4, 0.5A = 0x01F4
    QByteArray data = createVoltageCurrentData(3300, 500);
    processor->slotComSendPack(processingData::PACK_SET_V, data, 0);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        QString hexStr = packet.toHex();
        
        // Expected: 5a5a[type]0a00[checksum]e40cf401
        // where [type] is PACK_SET_V and [checksum] is calculated
        EXPECT_TRUE(hexStr.startsWith("5a5a"));
        EXPECT_TRUE(hexStr.endsWith("e40cf401"));  // Voltage and current in little endian
    }
}

// Test edge case values
TEST_F(SetVoltageGeneratorTest, TestEdgeCaseValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test with maximum channel number
    QByteArray data = createVoltageCurrentData(0xFFFF, 0xFFFF);
    processor->slotComSendPack(processingData::PACK_SET_V, data, 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
        
        // Verify max values
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(packet[8]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(packet[9]), 0xFF);
    }
}