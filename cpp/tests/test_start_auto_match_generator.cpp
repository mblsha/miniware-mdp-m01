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

class StartAutoMatchGeneratorTest : public ::testing::Test {
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
int StartAutoMatchGeneratorTest::argc = 0;
char** StartAutoMatchGeneratorTest::argv = nullptr;
QCoreApplication* StartAutoMatchGeneratorTest::app = nullptr;

// Test PACK_START_ATUO_MATCH packet generation using slotSendStartAutoMatch
TEST_F(StartAutoMatchGeneratorTest, TestStartAutoMatchGeneration) {
    // Create signal spy to capture sent packets
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Trigger start auto match request
    processor->slotSendStartAutoMatch();
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 6);  // PACK_START_ATUO_MATCH has no data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_START_ATUO_MATCH);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 6);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 0);     // Checksum (0 for empty data)
        
        // Kaitai validation
        auto parsed = parseWithKaitai(sentPacket);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto packet = parsed->packets()->at(0);
        EXPECT_EQ(packet->pack_type(), miniware_mdp_m01_t::PACK_TYPE_START_AUTO_MATCH);
        EXPECT_EQ(packet->size(), 6);
        
        // Cast to empty_packet type
        auto* emptyPacket = static_cast<miniware_mdp_m01_t::empty_packet_t*>(packet->data());
        ASSERT_NE(emptyPacket, nullptr);
        EXPECT_EQ(emptyPacket->channel(), 0xEE);
    }
}

// Test direct packet generation with slotComSendPack
TEST_F(StartAutoMatchGeneratorTest, TestDirectPacketGeneration) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_START_ATUO_MATCH with empty data
    processor->slotComSendPack(processingData::PACK_START_ATUO_MATCH, QByteArray());
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Compare with expected packet
        QByteArray expected = createExpectedPacket(processingData::PACK_START_ATUO_MATCH, 0xEE, QByteArray());
        EXPECT_EQ(sentPacket, expected);
    }
}

// Test PACK_START_ATUO_MATCH with different channels
TEST_F(StartAutoMatchGeneratorTest, TestStartAutoMatchWithChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send PACK_START_ATUO_MATCH on different channels
    for (int ch = 0; ch < 6; ch++) {
        processor->slotComSendPack(processingData::PACK_START_ATUO_MATCH, QByteArray(), ch);
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
TEST_F(StartAutoMatchGeneratorTest, TestPacketByteValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_START_ATUO_MATCH, QByteArray(), 3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify each byte - PACK_START_ATUO_MATCH should be 0x1D
        EXPECT_EQ(packet.toHex(), QByteArray("5a5a1d060300"));  // 5A 5A 1D 06 03 00
    }
}

// Test multiple PACK_START_ATUO_MATCH in sequence
TEST_F(StartAutoMatchGeneratorTest, TestMultipleStartAutoMatch) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Send 10 PACK_START_ATUO_MATCH packets
    for (int i = 0; i < 10; i++) {
        processor->slotSendStartAutoMatch();
    }
    
    EXPECT_EQ(sendSpy.count(), 10);
    
    // All packets should be identical
    if (sendSpy.count() >= 2) {
        QByteArray firstPacket = sendSpy.at(0).at(0).toByteArray();
        QByteArray secondPacket = sendSpy.at(1).at(0).toByteArray();
        EXPECT_EQ(firstPacket, secondPacket);
    }
}

// Verify PACK_START_ATUO_MATCH type value
TEST_F(StartAutoMatchGeneratorTest, TestPackStartAutoMatchTypeValue) {
    // From the enum definition, PACK_START_ATUO_MATCH should be 0x1D
    EXPECT_EQ(processingData::PACK_START_ATUO_MATCH, 0x1D);
}

// Test packet structure consistency (with custom data to verify behavior)
TEST_F(StartAutoMatchGeneratorTest, TestPacketStructureWithData) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Even though PACK_START_ATUO_MATCH shouldn't have data, test checksum calculation
    QByteArray testData;
    testData.append(static_cast<char>(0xAA));
    testData.append(static_cast<char>(0xBB));
    
    processor->slotComSendPack(processingData::PACK_START_ATUO_MATCH, testData, 1);
    
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
TEST_F(StartAutoMatchGeneratorTest, TestMaxChannelValue) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    processor->slotComSendPack(processingData::PACK_START_ATUO_MATCH, QByteArray(), 255);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 255);
    }
}

// Test exact byte sequence for PACK_START_ATUO_MATCH
TEST_F(StartAutoMatchGeneratorTest, TestExactByteSequence) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use slotSendStartAutoMatch which should generate the standard packet
    processor->slotSendStartAutoMatch();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Expected: [0x5A][0x5A][0x1D][0x06][0xEE][0x00]
        EXPECT_EQ(packet.size(), 6);
        EXPECT_EQ(packet[0], static_cast<char>(0x5A));
        EXPECT_EQ(packet[1], static_cast<char>(0x5A));
        EXPECT_EQ(packet[2], static_cast<char>(0x1D)); // PACK_START_ATUO_MATCH
        EXPECT_EQ(packet[3], static_cast<char>(0x06)); // Size
        EXPECT_EQ(packet[4], static_cast<char>(0xEE)); // Default channel
        EXPECT_EQ(packet[5], static_cast<char>(0x00)); // Checksum for empty data
    }
}

// Test PACK_STOP_ATUO_MATCH packet generation as well
TEST_F(StartAutoMatchGeneratorTest, TestStopAutoMatchGeneration) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Trigger stop auto match request
    processor->slotSendStopAutoMatch();
    
    // Verify signal was emitted
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray sentPacket = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(sentPacket.size(), 6);  // PACK_STOP_ATUO_MATCH has no data
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[2]), processingData::PACK_STOP_ATUO_MATCH);
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[3]), 6);     // Size
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[4]), 0xEE);  // Channel (default = 0xEE)
        EXPECT_EQ(static_cast<uint8_t>(sentPacket[5]), 0);     // Checksum (0 for empty data)
    }
}

// Verify PACK_STOP_ATUO_MATCH type value
TEST_F(StartAutoMatchGeneratorTest, TestPackStopAutoMatchTypeValue) {
    // From the enum definition, PACK_STOP_ATUO_MATCH should be 0x1E
    EXPECT_EQ(processingData::PACK_STOP_ATUO_MATCH, 0x1E);
}