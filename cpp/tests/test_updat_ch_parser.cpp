#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include "../processingdata.h"

class UpdateChannelTest : public ::testing::Test {
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
    
    // Helper to create update channel data
    QByteArray createUpdateChannelData(uint8_t targetChannel) {
        QByteArray data;
        data.append(static_cast<char>(targetChannel));
        return data;
    }
};

// Static members initialization
int UpdateChannelTest::argc = 0;
char** UpdateChannelTest::argv = nullptr;
QCoreApplication* UpdateChannelTest::app = nullptr;

// Test basic PACK_UPDAT_CH parsing
TEST_F(UpdateChannelTest, TestUpdateChannelPacket) {
    // Create signal spy to monitor channel update signal
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    
    // Test updating to channel 3
    QByteArray data = createUpdateChannelData(3);
    QByteArray packet = createPacket(processingData::PACK_UPDAT_CH, 0, data);
    
    // Verify packet size (6 header + 1 data = 7 bytes)
    EXPECT_EQ(packet.size(), 7);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify signal was emitted with correct channel
    EXPECT_EQ(channelSpy.count(), 1);
    if (channelSpy.count() > 0) {
        QList<QVariant> arguments = channelSpy.takeFirst();
        EXPECT_EQ(arguments.at(0).toInt(), 3);
    }
}

// Test updating to all valid channels
TEST_F(UpdateChannelTest, TestAllChannels) {
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    
    // Test channels 0-5
    for (int ch = 0; ch < 6; ch++) {
        QByteArray data = createUpdateChannelData(ch);
        QByteArray packet = createPacket(processingData::PACK_UPDAT_CH, 0, data);
        
        processor->slotDisposeRawPack(packet);
        
        // Verify signal was emitted
        EXPECT_EQ(channelSpy.count(), ch + 1);
        
        if (channelSpy.count() > ch) {
            QList<QVariant> arguments = channelSpy.at(ch);
            EXPECT_EQ(arguments.at(0).toInt(), ch);
        }
    }
}

// Test invalid checksum handling
TEST_F(UpdateChannelTest, TestInvalidChecksum) {
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    
    QByteArray data = createUpdateChannelData(2);
    QByteArray packet = createPacket(processingData::PACK_UPDAT_CH, 0, data);
    
    // Corrupt the checksum
    packet[5] = packet[5] ^ 0xFF;
    
    // Process the packet - should be rejected
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should have error message
    EXPECT_NE(output.find("pack_error"), std::string::npos);
    
    // Signal should not be emitted
    EXPECT_EQ(channelSpy.count(), 0);
}

// Test data generation
TEST_F(UpdateChannelTest, TestDataGeneration) {
    // Test channel 0
    QByteArray data0 = createUpdateChannelData(0);
    EXPECT_EQ(data0.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(data0[0]), 0);
    
    // Test channel 5
    QByteArray data5 = createUpdateChannelData(5);
    EXPECT_EQ(data5.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(data5[0]), 5);
    
    // Test out-of-range channel (should still work, validation is elsewhere)
    QByteArray data255 = createUpdateChannelData(255);
    EXPECT_EQ(data255.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(data255[0]), 255);
}

// Test multiple update packets in sequence
TEST_F(UpdateChannelTest, TestSequentialUpdates) {
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    
    // Send updates: 0 -> 3 -> 1 -> 5
    int sequence[] = {0, 3, 1, 5};
    
    for (int i = 0; i < 4; i++) {
        QByteArray data = createUpdateChannelData(sequence[i]);
        QByteArray packet = createPacket(processingData::PACK_UPDAT_CH, 0, data);
        processor->slotDisposeRawPack(packet);
    }
    
    // Should have 4 signals
    EXPECT_EQ(channelSpy.count(), 4);
    
    // Verify each signal had correct channel
    for (int i = 0; i < 4 && i < channelSpy.count(); i++) {
        QList<QVariant> arguments = channelSpy.at(i);
        EXPECT_EQ(arguments.at(0).toInt(), sequence[i]);
    }
}

// Test packet structure
TEST_F(UpdateChannelTest, TestPacketStructure) {
    QByteArray data = createUpdateChannelData(4);
    QByteArray packet = createPacket(processingData::PACK_UPDAT_CH, 2, data);
    
    // Verify packet structure
    EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
    EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
    EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_UPDAT_CH);  // Type
    EXPECT_EQ(static_cast<uint8_t>(packet[3]), 7);     // Size (6 + 1)
    EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);     // Channel in header
    // packet[5] is checksum
    EXPECT_EQ(static_cast<uint8_t>(packet[6]), 4);     // Target channel in data
}