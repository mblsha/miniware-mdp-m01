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

class SetIsOutputGeneratorTest : public ::testing::Test {
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
    
    // Helper to create output state data
    QByteArray createOutputStateData(bool isOn) {
        QByteArray data;
        data.append(static_cast<char>(isOn ? 1 : 0));
        return data;
    }
};

// Static members initialization
int SetIsOutputGeneratorTest::argc = 0;
char** SetIsOutputGeneratorTest::argv = nullptr;
QCoreApplication* SetIsOutputGeneratorTest::app = nullptr;

// Test basic PACK_SET_ISOUTPUT generation - ON state
TEST_F(SetIsOutputGeneratorTest, TestSetOutputOn) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create ON state data
    QByteArray data = createOutputStateData(true);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 2);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 7);  // 6 header + 1 data
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_ISOUTPUT);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 7);     // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);     // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), 1);     // Checksum (XOR of 1)
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 1);     // ON state
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_ISOUTPUT);
        EXPECT_EQ(kpacket->size(), 7);
        
        // Cast to set_isoutput type
        auto* outputPacket = static_cast<miniware_mdp_m01_t::set_isoutput_t*>(kpacket->data());
        ASSERT_NE(outputPacket, nullptr);
        EXPECT_EQ(outputPacket->channel(), 2);
        EXPECT_EQ(outputPacket->output_state(), 1);
        EXPECT_TRUE(outputPacket->is_output_on());
    }
}

// Test basic PACK_SET_ISOUTPUT generation - OFF state
TEST_F(SetIsOutputGeneratorTest, TestSetOutputOff) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create OFF state data
    QByteArray data = createOutputStateData(false);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 7);
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 3);     // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), 0);     // Checksum (XOR of 0)
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0);     // OFF state
    }
}

// Test using slotSendSetOutputState function
TEST_F(SetIsOutputGeneratorTest, TestSendSetOutputStateFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test channel 1 - ON state
    processor->MDP[1].updatoutPutState = true;
    processor->MDP[1].updatoutPutStateFlag = true;
    processor->slotSendSetOutputState(1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    // Verify flag was cleared
    EXPECT_FALSE(processor->MDP[1].updatoutPutStateFlag);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify channel and state
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 1);  // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 1);  // ON state
    }
    
    // Clear spy and test channel 4 - OFF state
    sendSpy.clear();
    processor->MDP[4].updatoutPutState = false;
    processor->MDP[4].updatoutPutStateFlag = true;
    processor->slotSendSetOutputState(4);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    // Verify flag was cleared
    EXPECT_FALSE(processor->MDP[4].updatoutPutStateFlag);
    
    if (sendSpy.count() >= 1) {
        QList<QVariant> arguments = sendSpy.at(0);
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify channel and state
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 4);  // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0);  // OFF state
    }
}

// Test all channels
TEST_F(SetIsOutputGeneratorTest, TestAllChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set alternating ON/OFF states for each channel
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatoutPutState = (ch % 2 == 0);  // Even channels ON, odd OFF
        processor->slotSendSetOutputState(ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QByteArray packet = sendSpy.at(ch).at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), ch);
        
        // Verify state matches expected pattern
        uint8_t expectedState = (ch % 2 == 0) ? 1 : 0;
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), expectedState);
        
        // Verify checksum
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedState);
    }
}

// Test packet byte values
TEST_F(SetIsOutputGeneratorTest, TestPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test with ON state
    QByteArray data = createOutputStateData(true);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 5);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify hex representation
        QString hexStr = packet.toHex();
        // Just verify the key parts
        EXPECT_TRUE(hexStr.startsWith("5a5a"));  // Headers
        EXPECT_EQ(packet.size(), 7);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 7);   // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 5);   // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), 1);   // Checksum
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 1);   // Data (ON)
    }
}

// Test packet comparison
TEST_F(SetIsOutputGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data = createOutputStateData(false);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 0);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_ISOUTPUT, 0, data);
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test rapid state toggling
TEST_F(SetIsOutputGeneratorTest, TestRapidStateToggling) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Rapidly toggle state for channel 2
    for (int i = 0; i < 20; i++) {
        QByteArray data = createOutputStateData(i % 2 == 0);
        processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 2);
    }
    
    EXPECT_EQ(sendSpy.count(), 20);
    
    // Verify last few packets alternate correctly
    for (int i = 16; i < 20; i++) {
        QByteArray packet = sendSpy.at(i).at(0).toByteArray();
        uint8_t expectedState = (i % 2 == 0) ? 1 : 0;
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), expectedState);
    }
}

// Test edge case with maximum channel
TEST_F(SetIsOutputGeneratorTest, TestMaxChannelValue) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data = createOutputStateData(true);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, data, 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 1);
    }
}

// Test output state patterns
TEST_F(SetIsOutputGeneratorTest, TestOutputStatePatterns) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test pattern: All OFF
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatoutPutState = false;
        processor->slotSendSetOutputState(ch);
    }
    
    // Test pattern: All ON
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatoutPutState = true;
        processor->slotSendSetOutputState(ch);
    }
    
    // Test pattern: First 3 ON, last 3 OFF
    for (int ch = 0; ch < 6; ch++) {
        processor->MDP[ch].updatoutPutState = (ch < 3);
        processor->slotSendSetOutputState(ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 18);  // 3 patterns × 6 channels
    
    // Verify last pattern
    for (int i = 12; i < 18; i++) {
        int ch = i - 12;
        QByteArray packet = sendSpy.at(i).at(0).toByteArray();
        uint8_t expectedState = (ch < 3) ? 1 : 0;
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), expectedState);
    }
}

// Test data size is always 1 byte
TEST_F(SetIsOutputGeneratorTest, TestDataSize) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test both states
    QByteArray dataOn = createOutputStateData(true);
    QByteArray dataOff = createOutputStateData(false);
    
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, dataOn, 0);
    processor->slotComSendPack(processingData::PACK_SET_ISOUTPUT, dataOff, 1);
    
    EXPECT_EQ(sendSpy.count(), 2);
    
    // Both packets should be exactly 7 bytes
    for (int i = 0; i < 2 && i < sendSpy.count(); i++) {
        QByteArray packet = sendSpy.at(i).at(0).toByteArray();
        EXPECT_EQ(packet.size(), 7);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 7);  // Size field
    }
}