#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include "../processingdata.h"

class HeartbeatGeneratorTest : public ::testing::Test {
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
int HeartbeatGeneratorTest::argc = 0;
char** HeartbeatGeneratorTest::argv = nullptr;
QCoreApplication* HeartbeatGeneratorTest::app = nullptr;

// Test heartbeat packet generation using slotHeartBeat
TEST_F(HeartbeatGeneratorTest, TestHeartbeatGeneration) {
    // Create signal spy to capture sent packets
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Trigger heartbeat
    processor->slotHeartBeat();
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 6);  // Heartbeat has no data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_HEARTBEAT);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 6);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 0);     // Checksum (0 for empty data)
    }
}

// Test direct packet generation with slotComSendPack
TEST_F(HeartbeatGeneratorTest, TestDirectPacketGeneration) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send heartbeat with empty data
    processor->slotComSendPack(processingData::PACK_HEARTBEAT, QByteArray());
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Compare with expected packet
        QByteArray expected = createExpectedPacket(processingData::PACK_HEARTBEAT, 0xEE, QByteArray());
        EXPECT_EQ(sentPacket, expected);
    }
}

// Test heartbeat with different channels
TEST_F(HeartbeatGeneratorTest, TestHeartbeatWithChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send heartbeat on different channels
    for (int ch = 0; ch < 6; ch++) {
        processor->slotComSendPack(processingData::PACK_HEARTBEAT, QByteArray(), ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QList<QVariant> arguments = sendSpy.at(ch);
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), ch);  // Channel number
    }
}

// Test packet byte values
TEST_F(HeartbeatGeneratorTest, TestPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_HEARTBEAT, QByteArray(), 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify each byte
        EXPECT_EQ(packet.toHex(), QByteArray("5a5a").append(
            QString("%1").arg(processingData::PACK_HEARTBEAT, 2, 16, QChar('0')).toLatin1())
            .append("060300"));  // Size=6, Channel=3, Checksum=0
    }
}

// Test multiple heartbeats in sequence
TEST_F(HeartbeatGeneratorTest, TestMultipleHeartbeats) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send 10 heartbeats
    for (int i = 0; i < 10; i++) {
        processor->slotHeartBeat();
    }
    
    EXPECT_EQ(sendSpy.count(), 10);
    
    // All packets should be identical
    if (sendSpy.count() >= 2) {
        QByteArray firstPacket = sendSpy.at(0).at(0).toByteArray();
        QByteArray secondPacket = sendSpy.at(1).at(0).toByteArray();
        EXPECT_EQ(firstPacket, secondPacket);
    }
}

// Test packet structure consistency
TEST_F(HeartbeatGeneratorTest, TestPacketStructureConsistency) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Generate packet with custom data to verify checksum calculation
    QByteArray testData;
    testData.append(static_cast<char>(0xAA));
    testData.append(static_cast<char>(0xBB));
    
    processor->slotComSendPack(processingData::PACK_HEARTBEAT, testData, 1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify size includes data
        EXPECT_EQ(packet.size(), 8);  // 6 header + 2 data
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 8);  // Size field
        
        // Verify checksum
        uint8_t expectedChecksum = 0xAA ^ 0xBB;
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
        
        // Verify data is appended
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0xAA);
        EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0xBB);
    }
}

// Test edge case: maximum channel value
TEST_F(HeartbeatGeneratorTest, TestMaxChannelValue) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_HEARTBEAT, QByteArray(), 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
    }
}

// Verify packet header constants
TEST_F(HeartbeatGeneratorTest, TestPacketHeaderConstants) {
    // Verify the header indices are as expected
    EXPECT_EQ(processingData::PACK_HEAD_INDEX0, 0);
    EXPECT_EQ(processingData::PACK_HEAD_INDEX1, 1);
    EXPECT_EQ(processingData::PACK_TYPE_INDEX, 2);
    EXPECT_EQ(processingData::PACK_SIZE_INDEX, 3);
    EXPECT_EQ(processingData::PACK_CH_INDEX, 4);
    EXPECT_EQ(processingData::PACK_CHECK, 5);
    EXPECT_EQ(processingData::PACK_HEAD_MAX, 6);
}