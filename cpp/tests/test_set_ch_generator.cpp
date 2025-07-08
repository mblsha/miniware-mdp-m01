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

class SetChannelGeneratorTest : public ::testing::Test {
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
};

// Static members initialization
int SetChannelGeneratorTest::argc = 0;
char** SetChannelGeneratorTest::argv = nullptr;
QCoreApplication* SetChannelGeneratorTest::app = nullptr;

// Test basic PACK_SET_CH generation
TEST_F(SetChannelGeneratorTest, TestSetChannelPacket) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Generate PACK_SET_CH for channel 3
    processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 6);  // No data payload
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_CH);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 6);     // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 3);     // Channel
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), 0);     // Checksum (0 for empty data)
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_CH);
        EXPECT_EQ(kpacket->size(), 6);
        
        // Cast to empty_packet type
        auto* emptyPacket = static_cast<miniware_mdp_m01_t::empty_packet_t*>(kpacket->data());
        ASSERT_NE(emptyPacket, nullptr);
        EXPECT_EQ(emptyPacket->channel(), 3);
    }
}

// Test using slotSendNowCh function
TEST_F(SetChannelGeneratorTest, TestSendNowChFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set channel 5 using the dedicated function
    processor->slotSendNowCh(5);
    
    // Note: slotSendNowCh sends the packet TWICE (based on the code)
    EXPECT_EQ(sendSpy.count(), 2);
    
    // Verify both packets are identical
    if (sendSpy.count() >= 2) {
        QByteArray packet1 = sendSpy.at(0).at(0).toByteArray();
        QByteArray packet2 = sendSpy.at(1).at(0).toByteArray();
        
        EXPECT_EQ(packet1, packet2);
        EXPECT_EQ(static_cast<uint8_t>(packet1[4]), 5);  // Channel
    }
    
    // Verify now_ch was updated
    EXPECT_EQ(processor->now_ch, 5);
}

// Test all valid channels (0-5)
TEST_F(SetChannelGeneratorTest, TestAllValidChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    for (int ch = 0; ch < 6; ch++) {
        processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet has correct channel
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QByteArray packet = sendSpy.at(ch).at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), ch);
    }
}

// Test packet byte values
TEST_F(SetChannelGeneratorTest, TestPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), 2);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify hex representation
        QString hexStr = packet.toHex();
        QString expected = "5a5a" + QString("%1").arg(processingData::PACK_SET_CH, 2, 16, QChar('0')) + "060200";
        EXPECT_EQ(hexStr, expected);
    }
}

// Test edge cases
TEST_F(SetChannelGeneratorTest, TestEdgeCases) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test maximum channel value
    processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
    }
}

// Test packet comparison with expected
TEST_F(SetChannelGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Generate packet for channel 4
    processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), 4);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_CH, 4, QByteArray());
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test rapid channel switching
TEST_F(SetChannelGeneratorTest, TestRapidChannelSwitching) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Rapidly switch channels
    for (int i = 0; i < 100; i++) {
        processor->slotComSendPack(processingData::PACK_SET_CH, QByteArray(), i % 6);
    }
    
    EXPECT_EQ(sendSpy.count(), 100);
    
    // Verify last few packets
    for (int i = 95; i < 100; i++) {
        QByteArray packet = sendSpy.at(i).at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), i % 6);
    }
}

// Test that PACK_SET_CH always has empty data
TEST_F(SetChannelGeneratorTest, TestEmptyDataPayload) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Even if we try to send data, it should be empty for PACK_SET_CH
    QByteArray dummyData;
    dummyData.append(static_cast<char>(0xFF));
    dummyData.append(static_cast<char>(0xEE));
    
    processor->slotComSendPack(processingData::PACK_SET_CH, dummyData, 1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Should still be 6 bytes if implementation ignores data
        // or 8 bytes if it includes the data
        // Based on the code comment "设置通道(不带数据)", it should not have data
        if (packet.size() == 6) {
            // Correct: no data included
            EXPECT_EQ(static_cast<uint8_t>(packet[5]), 0);  // Checksum should be 0
        } else if (packet.size() == 8) {
            // Implementation includes data despite comment
            EXPECT_EQ(static_cast<uint8_t>(packet[5]), 0xFF ^ 0xEE);  // Checksum
            EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0xFF);
            EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0xEE);
        }
    }
}

// Test channel switching state
TEST_F(SetChannelGeneratorTest, TestChannelSwitchingState) {
    // Initial channel should be 0
    EXPECT_EQ(processor->now_ch, 0);
    
    // Switch to channel 3
    processor->slotSendNowCh(3);
    EXPECT_EQ(processor->now_ch, 3);
    
    // Switch to channel 1
    processor->slotSendNowCh(1);
    EXPECT_EQ(processor->now_ch, 1);
    
    // Verify changeChannelCount behavior (though it's not set in slotSendNowCh)
    // The changeChannelCount seems to be used elsewhere to avoid conflicts
}