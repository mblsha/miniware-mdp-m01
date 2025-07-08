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

class ResetToDfuGeneratorTest : public ::testing::Test {
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
int ResetToDfuGeneratorTest::argc = 0;
char** ResetToDfuGeneratorTest::argv = nullptr;
QCoreApplication* ResetToDfuGeneratorTest::app = nullptr;

// Test PACK_RESET_TO_DFU packet generation using slotSendToDfu
TEST_F(ResetToDfuGeneratorTest, TestResetToDfuGeneration) {
    // Create signal spy to capture sent packets
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Note: slotSendToDfu also calls QDesktopServices::openUrl which we can't test here
    // We're only testing the packet generation part
    
    // For this test, we'll use slotComSendPack directly to avoid the side effect
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU);
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 6);  // PACK_RESET_TO_DFU has no data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_RESET_TO_DFU);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 6);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 0);     // Checksum (0 for empty data)
        
        // Kaitai validation
        auto parsed = parseWithKaitai(sentPacket);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto packet = parsed->packets()->at(0);
        EXPECT_EQ(packet->pack_type(), miniware_mdp_m01_t::PACK_TYPE_RESET_TO_DFU);
        EXPECT_EQ(packet->size(), 6);
        
        // Cast to empty_packet type
        auto* emptyPacket = static_cast<miniware_mdp_m01_t::empty_packet_t*>(packet->data());
        ASSERT_NE(emptyPacket, nullptr);
        EXPECT_EQ(emptyPacket->channel(), 0xEE);
    }
}

// Test direct packet generation with slotComSendPack
TEST_F(ResetToDfuGeneratorTest, TestDirectPacketGeneration) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_RESET_TO_DFU with empty data
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU, QByteArray());
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Compare with expected packet
        QByteArray expected = createExpectedPacket(processingData::PACK_RESET_TO_DFU, 0xEE, QByteArray());
        EXPECT_EQ(sentPacket, expected);
    }
}

// Test PACK_RESET_TO_DFU with different channels
TEST_F(ResetToDfuGeneratorTest, TestResetToDfuWithChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_RESET_TO_DFU on different channels
    for (int ch = 0; ch < 6; ch++) {
        processor->slotComSendPack(processingData::PACK_RESET_TO_DFU, QByteArray(), ch);
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
TEST_F(ResetToDfuGeneratorTest, TestPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU, QByteArray(), 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify each byte - PACK_RESET_TO_DFU should be 0x1F
        EXPECT_EQ(packet.toHex(), QByteArray("5a5a1f060300"));  // 5A 5A 1F 06 03 00
    }
}

// Test multiple PACK_RESET_TO_DFU in sequence
TEST_F(ResetToDfuGeneratorTest, TestMultipleResetToDfu) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send 10 PACK_RESET_TO_DFU packets
    for (int i = 0; i < 10; i++) {
        processor->slotComSendPack(processingData::PACK_RESET_TO_DFU);
    }
    
    EXPECT_EQ(sendSpy.count(), 10);
    
    // All packets should be identical
    if (sendSpy.count() >= 2) {
        QByteArray firstPacket = sendSpy.at(0).at(0).toByteArray();
        QByteArray secondPacket = sendSpy.at(1).at(0).toByteArray();
        EXPECT_EQ(firstPacket, secondPacket);
    }
}

// Verify PACK_RESET_TO_DFU type value
TEST_F(ResetToDfuGeneratorTest, TestPackResetToDfuTypeValue) {
    // From the enum definition, PACK_RESET_TO_DFU should be 0x1F
    EXPECT_EQ(processingData::PACK_RESET_TO_DFU, 0x1F);
}

// Test packet structure consistency (with custom data to verify behavior)
TEST_F(ResetToDfuGeneratorTest, TestPacketStructureWithData) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Even though PACK_RESET_TO_DFU shouldn't have data, test checksum calculation
    QByteArray testData;
    testData.append(static_cast<char>(0xAA));
    testData.append(static_cast<char>(0xBB));
    
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU, testData, 1);
    
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
TEST_F(ResetToDfuGeneratorTest, TestMaxChannelValue) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU, QByteArray(), 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
    }
}

// Test exact byte sequence for PACK_RESET_TO_DFU
TEST_F(ResetToDfuGeneratorTest, TestExactByteSequence) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use direct packet generation to avoid side effects of slotSendToDfu
    processor->slotComSendPack(processingData::PACK_RESET_TO_DFU);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Expected: [0x5A][0x5A][0x1F][0x06][0xEE][0x00]
        EXPECT_EQ(packet.size(), 6);
        EXPECT_EQ(packet[0], static_cast<char>(0x5A));
        EXPECT_EQ(packet[1], static_cast<char>(0x5A));
        EXPECT_EQ(packet[2], static_cast<char>(0x1F)); // PACK_RESET_TO_DFU
        EXPECT_EQ(packet[3], static_cast<char>(0x06)); // Size
        EXPECT_EQ(packet[4], static_cast<char>(0xEE)); // Default channel
        EXPECT_EQ(packet[5], static_cast<char>(0x00)); // Checksum for empty data
    }
}

// Test that PACK_RESET_TO_DFU is a critical command
TEST_F(ResetToDfuGeneratorTest, TestCriticalCommand) {
    // Verify that PACK_RESET_TO_DFU is positioned after other configuration commands
    // This is a safety check to ensure it's not accidentally triggered
    EXPECT_GT(processingData::PACK_RESET_TO_DFU, processingData::PACK_SET_CH);
    EXPECT_GT(processingData::PACK_RESET_TO_DFU, processingData::PACK_SET_V);
    EXPECT_GT(processingData::PACK_RESET_TO_DFU, processingData::PACK_SET_I);
    EXPECT_GT(processingData::PACK_RESET_TO_DFU, processingData::PACK_SET_ADDR);
    
    // Verify it's before PACK_RGB
    EXPECT_LT(processingData::PACK_RESET_TO_DFU, processingData::PACK_RGB);
}

// Test command sequence order
TEST_F(ResetToDfuGeneratorTest, TestCommandSequenceOrder) {
    // Verify the sequence of auto match and reset commands
    EXPECT_EQ(processingData::PACK_START_ATUO_MATCH, 0x1D);
    EXPECT_EQ(processingData::PACK_STOP_ATUO_MATCH, 0x1E);
    EXPECT_EQ(processingData::PACK_RESET_TO_DFU, 0x1F);
    
    // These should be consecutive
    EXPECT_EQ(processingData::PACK_STOP_ATUO_MATCH, processingData::PACK_START_ATUO_MATCH + 1);
    EXPECT_EQ(processingData::PACK_RESET_TO_DFU, processingData::PACK_STOP_ATUO_MATCH + 1);
}