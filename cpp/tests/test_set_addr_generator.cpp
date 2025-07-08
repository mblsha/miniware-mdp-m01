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

class SetAddressGeneratorTest : public ::testing::Test {
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
    
    // Helper to create address data
    QByteArray createAddressData(const uint8_t address[5], uint16_t frequency) {
        QByteArray data;
        // Address bytes (5 bytes)
        for (int i = 0; i < 5; i++) {
            data.append(static_cast<char>(address[i]));
        }
        // Frequency - offset from 2400 MHz
        data.append(static_cast<char>(frequency - 2400));
        return data;
    }
};

// Static members initialization
int SetAddressGeneratorTest::argc = 0;
char** SetAddressGeneratorTest::argv = nullptr;
QCoreApplication* SetAddressGeneratorTest::app = nullptr;

// Test basic PACK_SET_ADDR generation
TEST_F(SetAddressGeneratorTest, TestSetAddressPacket) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create test address and frequency
    uint8_t address[] = {0x01, 0x02, 0x03, 0x04, 0x05};
    QByteArray data = createAddressData(address, 2420);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data, 2);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 12);  // 6 header + 6 data
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_ADDR);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 12);    // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 2);     // Channel
        
        // Verify address bytes
        for (int i = 0; i < 5; i++) {
            EXPECT_EQ(static_cast<uint8_t>(packet[6 + i]), address[i]);
        }
        
        // Verify frequency offset
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 20);  // 2420 - 2400
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_ADDR);
        EXPECT_EQ(kpacket->size(), 12);
        
        // Cast to set_addr type
        auto* addrPacket = static_cast<miniware_mdp_m01_t::set_addr_t*>(kpacket->data());
        ASSERT_NE(addrPacket, nullptr);
        EXPECT_EQ(addrPacket->channel(), 2);
        EXPECT_EQ(addrPacket->addr_byte0(), 0x01);
        EXPECT_EQ(addrPacket->addr_byte1(), 0x02);
        EXPECT_EQ(addrPacket->addr_byte2(), 0x03);
        EXPECT_EQ(addrPacket->addr_byte3(), 0x04);
        EXPECT_EQ(addrPacket->addr_byte4(), 0x05);
        EXPECT_EQ(addrPacket->frequency_offset(), 20);
        EXPECT_EQ(addrPacket->frequency(), 2420);
        EXPECT_FALSE(addrPacket->is_empty());
    }
}

// Test using slotSendAddrToLower function
TEST_F(SetAddressGeneratorTest, TestSendAddrToLowerFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set values for channel 3
    processor->MDP[3].upDatAddress[0] = 0xAA;
    processor->MDP[3].upDatAddress[1] = 0xBB;
    processor->MDP[3].upDatAddress[2] = 0xCC;
    processor->MDP[3].upDatAddress[3] = 0xDD;
    processor->MDP[3].upDatAddress[4] = 0xEE;
    processor->MDP[3].upDatFreq = 2450;
    processor->MDP[3].updatAddressFlag = true;
    
    // Send address settings
    processor->slotSendAddrToLower(3);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    // Verify flag was cleared
    EXPECT_FALSE(processor->MDP[3].updatAddressFlag);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 3);
        
        // Verify address bytes
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0xAA);
        EXPECT_EQ(static_cast<uint8_t>(packet[7]), 0xBB);
        EXPECT_EQ(static_cast<uint8_t>(packet[8]), 0xCC);
        EXPECT_EQ(static_cast<uint8_t>(packet[9]), 0xDD);
        EXPECT_EQ(static_cast<uint8_t>(packet[10]), 0xEE);
        
        // Verify frequency offset (2450 - 2400 = 50)
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 50);
    }
}

// Test various address patterns
TEST_F(SetAddressGeneratorTest, TestVariousAddressPatterns) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    struct TestCase {
        uint8_t address[5];
        uint16_t frequency;
        const char* description;
    };
    
    TestCase cases[] = {
        {{0x00, 0x00, 0x00, 0x00, 0x00}, 2400, "All zeros, base frequency"},
        {{0xFF, 0xFF, 0xFF, 0xFF, 0xFF}, 2483, "All ones, max frequency"},
        {{0x12, 0x34, 0x56, 0x78, 0x9A}, 2425, "Sequential pattern"},
        {{0xDE, 0xAD, 0xBE, 0xEF, 0x00}, 2440, "Classic pattern"},
        {{0x01, 0x23, 0x45, 0x67, 0x89}, 2412, "BLE-like address"}
    };
    
    for (const auto& tc : cases) {
        QByteArray data = createAddressData(tc.address, tc.frequency);
        processor->slotComSendPack(processingData::PACK_SET_ADDR, data, 0);
    }
    
    EXPECT_EQ(sendSpy.count(), 5);
    
    // Verify the BLE-like address packet (last one)
    if (sendSpy.count() >= 5) {
        QByteArray packet = sendSpy.at(4).at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0x01);
        EXPECT_EQ(static_cast<uint8_t>(packet[10]), 0x89);
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 12);  // 2412 - 2400
    }
}

// Test packet byte values and checksum
TEST_F(SetAddressGeneratorTest, TestPacketBytesAndChecksum) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use specific values for checksum verification
    uint8_t address[] = {0x11, 0x22, 0x33, 0x44, 0x55};
    QByteArray data = createAddressData(address, 2430);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data, 1);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify checksum
        uint8_t expectedChecksum = 0x11 ^ 0x22 ^ 0x33 ^ 0x44 ^ 0x55 ^ 30;  // 30 = 2430 - 2400
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
    }
}

// Test all channels
TEST_F(SetAddressGeneratorTest, TestAllChannels) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set different addresses for each channel
    for (int ch = 0; ch < 6; ch++) {
        for (int i = 0; i < 5; i++) {
            processor->MDP[ch].upDatAddress[i] = ch * 10 + i;
        }
        processor->MDP[ch].upDatFreq = 2400 + ch * 10;
        processor->slotSendAddrToLower(ch);
    }
    
    EXPECT_EQ(sendSpy.count(), 6);
    
    // Verify each packet
    for (int ch = 0; ch < 6 && ch < sendSpy.count(); ch++) {
        QByteArray packet = sendSpy.at(ch).at(0).toByteArray();
        
        // Verify channel
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), ch);
        
        // Verify first and last address bytes
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), ch * 10);      // First byte
        EXPECT_EQ(static_cast<uint8_t>(packet[10]), ch * 10 + 4); // Last byte
        
        // Verify frequency offset
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), ch * 10);
    }
}

// Test frequency edge cases
TEST_F(SetAddressGeneratorTest, TestFrequencyEdgeCases) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    uint8_t address[] = {0x00, 0x00, 0x00, 0x00, 0x01};
    
    // Test minimum frequency (2400 MHz)
    QByteArray data1 = createAddressData(address, 2400);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data1, 0);
    
    // Test maximum 2.4GHz band frequency (2483 MHz)
    QByteArray data2 = createAddressData(address, 2483);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data2, 1);
    
    // Test mid-range frequency (2440 MHz)
    QByteArray data3 = createAddressData(address, 2440);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data3, 2);
    
    EXPECT_EQ(sendSpy.count(), 3);
    
    // Verify frequency offsets
    if (sendSpy.count() >= 3) {
        QByteArray packet1 = sendSpy.at(0).at(0).toByteArray();
        QByteArray packet2 = sendSpy.at(1).at(0).toByteArray();
        QByteArray packet3 = sendSpy.at(2).at(0).toByteArray();
        
        EXPECT_EQ(static_cast<uint8_t>(packet1[11]), 0);   // 2400 - 2400
        EXPECT_EQ(static_cast<uint8_t>(packet2[11]), 83);  // 2483 - 2400
        EXPECT_EQ(static_cast<uint8_t>(packet3[11]), 40);  // 2440 - 2400
    }
}

// Test packet comparison
TEST_F(SetAddressGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    uint8_t address[] = {0xCA, 0xFE, 0xBA, 0xBE, 0x00};
    QByteArray data = createAddressData(address, 2450);
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data, 4);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_ADDR, 4, data);
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test hex representation
TEST_F(SetAddressGeneratorTest, TestHexRepresentation) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Simple address pattern for easy hex verification
    uint8_t address[] = {0x01, 0x02, 0x03, 0x04, 0x05};
    QByteArray data = createAddressData(address, 2410);  // Offset = 10 = 0x0A
    processor->slotComSendPack(processingData::PACK_SET_ADDR, data, 0);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        QString hexStr = packet.toHex();
        
        // Expected: 5a5a[type]0c00[checksum]01020304050a
        // where [type] is PACK_SET_ADDR and [checksum] is calculated
        EXPECT_TRUE(hexStr.startsWith("5a5a"));
        EXPECT_TRUE(hexStr.endsWith("01020304050a"));
    }
}

// Test empty address handling
TEST_F(SetAddressGeneratorTest, TestEmptyAddress) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // All zeros address
    processor->MDP[5].upDatAddress[0] = 0x00;
    processor->MDP[5].upDatAddress[1] = 0x00;
    processor->MDP[5].upDatAddress[2] = 0x00;
    processor->MDP[5].upDatAddress[3] = 0x00;
    processor->MDP[5].upDatAddress[4] = 0x00;
    processor->MDP[5].upDatFreq = 2425;
    
    processor->slotSendAddrToLower(5);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify all address bytes are zero
        for (int i = 6; i <= 10; i++) {
            EXPECT_EQ(static_cast<uint8_t>(packet[i]), 0x00);
        }
        
        // But frequency offset should still be correct
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 25);  // 2425 - 2400
    }
}