#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include "../processingdata.h"

class RGBGeneratorTest : public ::testing::Test {
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
int RGBGeneratorTest::argc = 0;
char** RGBGeneratorTest::argv = nullptr;
QCoreApplication* RGBGeneratorTest::app = nullptr;

// Test PACK_RGB packet generation using slotSendStartRGB
TEST_F(RGBGeneratorTest, TestStartRGBGeneration) {
    // Create signal spy to capture sent packets
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Trigger start RGB request
    processor->slotSendStartRGB();
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 7);  // PACK_RGB has 1 byte of data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_RGB);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 7);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 1);     // Checksum (1 for data value 1)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[6]), 1);     // Data: 1 for start
    }
}

// Test PACK_RGB packet generation using slotSendStopRGB
TEST_F(RGBGeneratorTest, TestStopRGBGeneration) {
    // Create signal spy to capture sent packets
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Trigger stop RGB request
    processor->slotSendStopRGB();
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 7);  // PACK_RGB has 1 byte of data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_RGB);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 7);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 0);     // Checksum (0 for data value 0)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[6]), 0);     // Data: 0 for stop
    }
}

// Test direct packet generation with slotComSendPack
TEST_F(RGBGeneratorTest, TestDirectPacketGeneration) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_RGB with custom data
    QByteArray testData;
    testData.append(static_cast<char>(1));
    processor->slotComSendPack(processingData::PACK_RGB, testData);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Compare with expected packet
        QByteArray expected = createExpectedPacket(processingData::PACK_RGB, 0xEE, testData);
        EXPECT_EQ(sentPacket, expected);
    }
}

// Test PACK_RGB with different channels
TEST_F(RGBGeneratorTest, TestRGBWithChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_RGB on different channels
    QByteArray data;
    data.append(static_cast<char>(1));
    
    for (int ch = 0; ch < 6; ch++) {
        processor->slotComSendPack(processingData::PACK_RGB, data, ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QList<QVariant> arguments = sendSpy.at(ch);
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), ch);  // Channel number
    }
}

// Test packet byte values for start RGB
TEST_F(RGBGeneratorTest, TestStartRGBPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data;
    data.append(static_cast<char>(1));
    processor->slotComSendPack(processingData::PACK_RGB, data, 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify each byte - PACK_RGB should be 0x20
        EXPECT_EQ(packet.toHex(), QByteArray("5a5a2007030101"));  // 5A 5A 20 07 03 01 01
    }
}

// Test packet byte values for stop RGB
TEST_F(RGBGeneratorTest, TestStopRGBPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data;
    data.append(static_cast<char>(0));
    processor->slotComSendPack(processingData::PACK_RGB, data, 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify each byte
        EXPECT_EQ(packet.toHex(), QByteArray("5a5a2007030000"));  // 5A 5A 20 07 03 00 00
    }
}

// Verify PACK_RGB type value
TEST_F(RGBGeneratorTest, TestPackRGBTypeValue) {
    // From the enum definition, PACK_RGB should be 0x20
    EXPECT_EQ(processingData::PACK_RGB, 0x20);
}

// Test multiple RGB start/stop sequences
TEST_F(RGBGeneratorTest, TestMultipleStartStop) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send alternating start and stop
    for (int i = 0; i < 5; i++) {
        processor->slotSendStartRGB();
        processor->slotSendStopRGB();
    }
    
    EXPECT_EQ(sendSpy.count(), 10);
    
    // Verify alternating data values
    for (int i = 0; i < sendSpy.count() && i < 10; i++) {
        QList<QVariant> arguments = sendSpy.at(i);
        QByteArray packet = arguments.at(0).toByteArray();
        
        if (i % 2 == 0) {
            // Even indices should have data value 1 (start)
            EXPECT_EQ(static_cast<uint8_t>(packet[6]), 1);
        } else {
            // Odd indices should have data value 0 (stop)
            EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0);
        }
    }
}

// Test edge case: maximum channel value
TEST_F(RGBGeneratorTest, TestMaxChannelValue) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    QByteArray data;
    data.append(static_cast<char>(1));
    processor->slotComSendPack(processingData::PACK_RGB, data, 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
    }
}

// Test exact byte sequence for start RGB
TEST_F(RGBGeneratorTest, TestExactByteSequenceStartRGB) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use slotSendStartRGB which should generate the standard packet
    processor->slotSendStartRGB();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Expected: [0x5A][0x5A][0x20][0x07][0xEE][0x01][0x01]
        EXPECT_EQ(packet.size(), 7);
        EXPECT_EQ(packet[0], static_cast<char>(0x5A));
        EXPECT_EQ(packet[1], static_cast<char>(0x5A));
        EXPECT_EQ(packet[2], static_cast<char>(0x20)); // PACK_RGB
        EXPECT_EQ(packet[3], static_cast<char>(0x07)); // Size
        EXPECT_EQ(packet[4], static_cast<char>(0xEE)); // Default channel
        EXPECT_EQ(packet[5], static_cast<char>(0x01)); // Checksum
        EXPECT_EQ(packet[6], static_cast<char>(0x01)); // Data: 1 for start
    }
}

// Test exact byte sequence for stop RGB
TEST_F(RGBGeneratorTest, TestExactByteSequenceStopRGB) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use slotSendStopRGB which should generate the standard packet
    processor->slotSendStopRGB();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Expected: [0x5A][0x5A][0x20][0x07][0xEE][0x00][0x00]
        EXPECT_EQ(packet.size(), 7);
        EXPECT_EQ(packet[0], static_cast<char>(0x5A));
        EXPECT_EQ(packet[1], static_cast<char>(0x5A));
        EXPECT_EQ(packet[2], static_cast<char>(0x20)); // PACK_RGB
        EXPECT_EQ(packet[3], static_cast<char>(0x07)); // Size
        EXPECT_EQ(packet[4], static_cast<char>(0xEE)); // Default channel
        EXPECT_EQ(packet[5], static_cast<char>(0x00)); // Checksum
        EXPECT_EQ(packet[6], static_cast<char>(0x00)); // Data: 0 for stop
    }
}

// Test custom RGB values
TEST_F(RGBGeneratorTest, TestCustomRGBValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test various data values
    for (uint8_t value = 0; value <= 5; value++) {
        QByteArray data;
        data.append(static_cast<char>(value));
        processor->slotComSendPack(processingData::PACK_RGB, data);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet has correct data and checksum
    for (int i = 0; i < sendSpy.count() && i < 6; i++) {
        QList<QVariant> arguments = sendSpy.at(i);
        QByteArray packet = arguments.at(0).toByteArray();
        
        uint8_t expectedValue = static_cast<uint8_t>(i);
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedValue); // Checksum equals data
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), expectedValue); // Data value
    }
}