#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include "../processingdata.h"

class Err240PacketTest : public ::testing::Test {
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
    
    // Helper function to create a valid packet with checksum
    QByteArray createPacket(uint8_t type, uint8_t channel, const QByteArray& data) {
        QByteArray packet;
        packet.append(static_cast<char>(0x5A));  // Header 1
        packet.append(static_cast<char>(0x5A));  // Header 2
        packet.append(static_cast<char>(type));  // Packet type
        packet.append(static_cast<char>(6 + data.size()));  // Size
        packet.append(static_cast<char>(channel));  // Channel
        
        // Calculate checksum
        uint8_t checksum = 0;
        for (int i = 0; i < data.size(); i++) {
            checksum ^= static_cast<uint8_t>(data[i]);
        }
        packet.append(static_cast<char>(checksum));  // Checksum
        packet.append(data);  // Actual data
        
        return packet;
    }
    
    // Helper to create error 240 data (empty)
    QByteArray createErr240Data() {
        // PACK_ERR_240 has no data payload
        return QByteArray();
    }
};

// Static members initialization
int Err240PacketTest::argc = 0;
char** Err240PacketTest::argv = nullptr;
QCoreApplication* Err240PacketTest::app = nullptr;

// Test basic PACK_ERR_240 parsing
TEST_F(Err240PacketTest, TestErr240Packet) {
    // Create signal spy to monitor error 240 signal
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    // Create error 240 packet with no data
    QByteArray data = createErr240Data();
    QByteArray packet = createPacket(processingData::PACK_ERR_240, 0, data);
    
    // Verify packet size (6 header + 0 data = 6 bytes)
    EXPECT_EQ(packet.size(), 6);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify signal was emitted
    EXPECT_EQ(errorSpy.count(), 1);
}

// Test multiple error packets
TEST_F(Err240PacketTest, TestMultipleErr240Packets) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    // Send 5 error packets
    for (int i = 0; i < 5; i++) {
        QByteArray data = createErr240Data();
        QByteArray packet = createPacket(processingData::PACK_ERR_240, 0, data);
        processor->slotDisposeRawPack(packet);
    }
    
    // Should have 5 signals
    EXPECT_EQ(errorSpy.count(), 5);
}

// Test error packet with different channels
TEST_F(Err240PacketTest, TestErr240DifferentChannels) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    // Error 240 should work regardless of channel
    for (int ch = 0; ch < 6; ch++) {
        QByteArray data = createErr240Data();
        QByteArray packet = createPacket(processingData::PACK_ERR_240, ch, data);
        processor->slotDisposeRawPack(packet);
    }
    
    // Should have one signal per channel
    EXPECT_EQ(errorSpy.count(), 6);
}

// Test invalid checksum handling
TEST_F(Err240PacketTest, TestInvalidChecksum) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    QByteArray data = createErr240Data();
    QByteArray packet = createPacket(processingData::PACK_ERR_240, 0, data);
    
    // Corrupt the checksum
    packet[5] = packet[5] ^ 0xFF;
    
    // Process the packet - should be rejected
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should have error message
    EXPECT_NE(output.find("pack_error"), std::string::npos);
    
    // Signal should not be emitted
    EXPECT_EQ(errorSpy.count(), 0);
}

// Test packet structure
TEST_F(Err240PacketTest, TestPacketStructure) {
    QByteArray data = createErr240Data();
    QByteArray packet = createPacket(processingData::PACK_ERR_240, 2, data);
    
    // Verify packet structure
    EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
    EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
    EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_ERR_240);  // Type
    EXPECT_EQ(static_cast<uint8_t>(packet[3]), 6);     // Size (6 + 0)
    EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);     // Channel
    EXPECT_EQ(static_cast<uint8_t>(packet[5]), 0);     // Checksum (0 for empty data)
}

// Test error 240 mixed with other packet types
TEST_F(Err240PacketTest, TestMixedPacketTypes) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    
    // Send error packet
    QByteArray errData = createErr240Data();
    QByteArray errPacket = createPacket(processingData::PACK_ERR_240, 0, errData);
    processor->slotDisposeRawPack(errPacket);
    
    // Send channel update packet
    QByteArray chData;
    chData.append(static_cast<char>(3));
    QByteArray chPacket = createPacket(processingData::PACK_UPDAT_CH, 0, chData);
    processor->slotDisposeRawPack(chPacket);
    
    // Send another error packet
    processor->slotDisposeRawPack(errPacket);
    
    // Verify signals
    EXPECT_EQ(errorSpy.count(), 2);  // Two error packets
    EXPECT_EQ(channelSpy.count(), 1); // One channel update
}

// Test data generation (should be empty)
TEST_F(Err240PacketTest, TestDataGeneration) {
    QByteArray data = createErr240Data();
    
    // Error 240 packet has no data
    EXPECT_EQ(data.size(), 0);
    EXPECT_TRUE(data.isEmpty());
}

// Test error packet handling at boundaries
TEST_F(Err240PacketTest, TestBoundaryConditions) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    // Test with maximum channel number (255)
    QByteArray data = createErr240Data();
    QByteArray packet = createPacket(processingData::PACK_ERR_240, 255, data);
    processor->slotDisposeRawPack(packet);
    
    // Should still emit signal
    EXPECT_EQ(errorSpy.count(), 1);
}

// Test rapid error packet reception
TEST_F(Err240PacketTest, TestRapidErrorPackets) {
    QSignalSpy errorSpy(processor, &processingData::signalErr240ToUi);
    
    // Send 100 error packets rapidly
    for (int i = 0; i < 100; i++) {
        QByteArray data = createErr240Data();
        QByteArray packet = createPacket(processingData::PACK_ERR_240, i % 6, data);
        processor->slotDisposeRawPack(packet);
    }
    
    // All packets should be processed
    EXPECT_EQ(errorSpy.count(), 100);
}