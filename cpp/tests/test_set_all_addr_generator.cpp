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

class SetAllAddressGeneratorTest : public ::testing::Test {
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
    
    // Helper to create all addresses data
    QByteArray createAllAddressesData(const uint8_t addresses[][5], const uint16_t frequencies[]) {
        QByteArray data;
        for (int ch = 0; ch < 6; ch++) {
            // Address bytes (5 bytes)
            for (int i = 0; i < 5; i++) {
                data.append(static_cast<char>(addresses[ch][i]));
            }
            // Frequency - offset from 2400 MHz
            data.append(static_cast<char>(frequencies[ch] - 2400));
        }
        return data;
    }
};

// Static members initialization
int SetAllAddressGeneratorTest::argc = 0;
char** SetAllAddressGeneratorTest::argv = nullptr;
QCoreApplication* SetAllAddressGeneratorTest::app = nullptr;

// Test basic PACK_SET_ALL_ADDR generation
TEST_F(SetAllAddressGeneratorTest, TestSetAllAddressPacket) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create test addresses and frequencies for all 6 channels
    uint8_t addresses[6][5] = {
        {0x01, 0x02, 0x03, 0x04, 0x05},
        {0x11, 0x12, 0x13, 0x14, 0x15},
        {0x21, 0x22, 0x23, 0x24, 0x25},
        {0x31, 0x32, 0x33, 0x34, 0x35},
        {0x41, 0x42, 0x43, 0x44, 0x45},
        {0x51, 0x52, 0x53, 0x54, 0x55}
    };
    uint16_t frequencies[6] = {2400, 2410, 2420, 2430, 2440, 2450};
    
    QByteArray data = createAllAddressesData(addresses, frequencies);
    processor->slotComSendPack(processingData::PACK_SET_ALL_ADDR, data);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet structure
        EXPECT_EQ(packet.size(), 42);  // 6 header + 36 data
        EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
        EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
        EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_SET_ALL_ADDR);
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 42);    // Size
        EXPECT_EQ(static_cast<uint8_t>(packet[4]), 0xEE);  // Default channel
        
        // Verify first channel's data
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0x01);   // First address byte
        EXPECT_EQ(static_cast<uint8_t>(packet[10]), 0x05);  // Last address byte
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 0);     // Frequency offset (2400-2400)
        
        // Verify last channel's data
        EXPECT_EQ(static_cast<uint8_t>(packet[36]), 0x51);  // First address byte
        EXPECT_EQ(static_cast<uint8_t>(packet[40]), 0x55);  // Last address byte
        EXPECT_EQ(static_cast<uint8_t>(packet[41]), 50);    // Frequency offset (2450-2400)
        
        // Kaitai validation
        auto parsed = parseWithKaitai(packet);
        ASSERT_NE(parsed, nullptr);
        ASSERT_EQ(parsed->packets()->size(), 1);
        
        auto kpacket = parsed->packets()->at(0);
        EXPECT_EQ(kpacket->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SET_ALL_ADDR);
        EXPECT_EQ(kpacket->size(), 42);
        
        // Cast to set_all_addr type
        auto* allAddrPacket = static_cast<miniware_mdp_m01_t::set_all_addr_t*>(kpacket->data());
        ASSERT_NE(allAddrPacket, nullptr);
        EXPECT_EQ(allAddrPacket->channel(), 0xEE);
        ASSERT_EQ(allAddrPacket->addresses()->size(), 6);
        
        // Verify first channel
        auto* addr0 = allAddrPacket->addresses()->at(0);
        EXPECT_EQ(addr0->addr_byte0(), 0x01);
        EXPECT_EQ(addr0->addr_byte1(), 0x02);
        EXPECT_EQ(addr0->addr_byte2(), 0x03);
        EXPECT_EQ(addr0->addr_byte3(), 0x04);
        EXPECT_EQ(addr0->addr_byte4(), 0x05);
        EXPECT_EQ(addr0->frequency_offset(), 0);
        EXPECT_EQ(addr0->frequency(), 2400);
        EXPECT_FALSE(addr0->is_empty());
        
        // Verify last channel
        auto* addr5 = allAddrPacket->addresses()->at(5);
        EXPECT_EQ(addr5->addr_byte0(), 0x51);
        EXPECT_EQ(addr5->addr_byte1(), 0x52);
        EXPECT_EQ(addr5->addr_byte2(), 0x53);
        EXPECT_EQ(addr5->addr_byte3(), 0x54);
        EXPECT_EQ(addr5->addr_byte4(), 0x55);
        EXPECT_EQ(addr5->frequency_offset(), 50);
        EXPECT_EQ(addr5->frequency(), 2450);
        EXPECT_FALSE(addr5->is_empty());
    }
}

// Test using slotSendAllAddrToLower function
TEST_F(SetAllAddressGeneratorTest, TestSendAllAddrToLowerFunction) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set values for all channels
    for (int ch = 0; ch < 6; ch++) {
        for (int i = 0; i < 5; i++) {
            processor->MDP[ch].upDatAddress[i] = 0xA0 + ch * 0x10 + i;
        }
        processor->MDP[ch].upDatFreq = 2400 + ch * 15;  // 2400, 2415, 2430, 2445, 2460, 2475
    }
    
    // Send all addresses
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QList<QVariant> arguments = sendSpy.takeFirst();
        QByteArray packet = arguments.at(0).toByteArray();
        
        // Verify packet size
        EXPECT_EQ(packet.size(), 42);
        
        // Verify channel data is in correct order
        for (int ch = 0; ch < 6; ch++) {
            int baseOffset = 6 + ch * 6;  // Header + channel_index * 6
            
            // Verify address bytes
            for (int i = 0; i < 5; i++) {
                EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + i]), 0xA0 + ch * 0x10 + i);
            }
            
            // Verify frequency offset
            EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + 5]), ch * 15);
        }
    }
}

// Test with all empty addresses
TEST_F(SetAllAddressGeneratorTest, TestAllEmptyAddresses) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set all addresses to zero
    for (int ch = 0; ch < 6; ch++) {
        for (int i = 0; i < 5; i++) {
            processor->MDP[ch].upDatAddress[i] = 0x00;
        }
        processor->MDP[ch].upDatFreq = 2440;  // All on same frequency
    }
    
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify all address bytes are zero
        for (int ch = 0; ch < 6; ch++) {
            int baseOffset = 6 + ch * 6;
            for (int i = 0; i < 5; i++) {
                EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + i]), 0x00);
            }
            // But frequency should still be set
            EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + 5]), 40);  // 2440 - 2400
        }
    }
}

// Test with maximum values
TEST_F(SetAllAddressGeneratorTest, TestMaximumValues) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set all addresses to 0xFF and max frequency
    for (int ch = 0; ch < 6; ch++) {
        for (int i = 0; i < 5; i++) {
            processor->MDP[ch].upDatAddress[i] = 0xFF;
        }
        processor->MDP[ch].upDatFreq = 2483;  // Max 2.4GHz band frequency
    }
    
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify all values are at maximum
        for (int ch = 0; ch < 6; ch++) {
            int baseOffset = 6 + ch * 6;
            for (int i = 0; i < 5; i++) {
                EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + i]), 0xFF);
            }
            EXPECT_EQ(static_cast<uint8_t>(packet[baseOffset + 5]), 83);  // 2483 - 2400
        }
    }
}

// Test packet byte values and checksum
TEST_F(SetAllAddressGeneratorTest, TestPacketBytesAndChecksum) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Use simple pattern for easy checksum calculation
    uint8_t addresses[6][5] = {
        {0x01, 0x01, 0x01, 0x01, 0x01},
        {0x02, 0x02, 0x02, 0x02, 0x02},
        {0x03, 0x03, 0x03, 0x03, 0x03},
        {0x04, 0x04, 0x04, 0x04, 0x04},
        {0x05, 0x05, 0x05, 0x05, 0x05},
        {0x06, 0x06, 0x06, 0x06, 0x06}
    };
    uint16_t frequencies[6] = {2401, 2402, 2403, 2404, 2405, 2406};
    
    QByteArray data = createAllAddressesData(addresses, frequencies);
    processor->slotComSendPack(processingData::PACK_SET_ALL_ADDR, data);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Calculate expected checksum manually
        uint8_t expectedChecksum = 0;
        for (int ch = 0; ch < 6; ch++) {
            for (int i = 0; i < 5; i++) {
                expectedChecksum ^= (ch + 1);  // Address pattern
            }
            expectedChecksum ^= (ch + 1);  // Frequency offset
        }
        
        EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
    }
}

// Test different patterns for each channel
TEST_F(SetAllAddressGeneratorTest, TestDifferentPatterns) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set different patterns for each channel
    // Channel 0: Sequential
    processor->MDP[0].upDatAddress[0] = 0x01;
    processor->MDP[0].upDatAddress[1] = 0x02;
    processor->MDP[0].upDatAddress[2] = 0x03;
    processor->MDP[0].upDatAddress[3] = 0x04;
    processor->MDP[0].upDatAddress[4] = 0x05;
    processor->MDP[0].upDatFreq = 2400;
    
    // Channel 1: All same
    for (int i = 0; i < 5; i++) {
        processor->MDP[1].upDatAddress[i] = 0xAA;
    }
    processor->MDP[1].upDatFreq = 2420;
    
    // Channel 2: Alternating
    processor->MDP[2].upDatAddress[0] = 0x55;
    processor->MDP[2].upDatAddress[1] = 0xAA;
    processor->MDP[2].upDatAddress[2] = 0x55;
    processor->MDP[2].upDatAddress[3] = 0xAA;
    processor->MDP[2].upDatAddress[4] = 0x55;
    processor->MDP[2].upDatFreq = 2440;
    
    // Channel 3: MAC-like
    processor->MDP[3].upDatAddress[0] = 0xDE;
    processor->MDP[3].upDatAddress[1] = 0xAD;
    processor->MDP[3].upDatAddress[2] = 0xBE;
    processor->MDP[3].upDatAddress[3] = 0xEF;
    processor->MDP[3].upDatAddress[4] = 0x00;
    processor->MDP[3].upDatFreq = 2460;
    
    // Channel 4: All zeros
    for (int i = 0; i < 5; i++) {
        processor->MDP[4].upDatAddress[i] = 0x00;
    }
    processor->MDP[4].upDatFreq = 2470;
    
    // Channel 5: All ones
    for (int i = 0; i < 5; i++) {
        processor->MDP[5].upDatAddress[i] = 0xFF;
    }
    processor->MDP[5].upDatFreq = 2480;
    
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Verify channel 0 (sequential)
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0x01);
        EXPECT_EQ(static_cast<uint8_t>(packet[10]), 0x05);
        
        // Verify channel 1 (all same)
        EXPECT_EQ(static_cast<uint8_t>(packet[12]), 0xAA);
        EXPECT_EQ(static_cast<uint8_t>(packet[16]), 0xAA);
        
        // Verify channel 3 (MAC-like)
        EXPECT_EQ(static_cast<uint8_t>(packet[24]), 0xDE);
        EXPECT_EQ(static_cast<uint8_t>(packet[28]), 0x00);
        
        // Verify frequencies
        EXPECT_EQ(static_cast<uint8_t>(packet[11]), 0);   // Ch0: 2400-2400
        EXPECT_EQ(static_cast<uint8_t>(packet[17]), 20);  // Ch1: 2420-2400
        EXPECT_EQ(static_cast<uint8_t>(packet[41]), 80);  // Ch5: 2480-2400
    }
}

// Test packet comparison
TEST_F(SetAllAddressGeneratorTest, TestPacketComparison) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Create simple test data
    uint8_t addresses[6][5] = {{0}};  // Initialize all to zero
    uint16_t frequencies[6] = {2410, 2415, 2420, 2425, 2430, 2435};
    
    for (int ch = 0; ch < 6; ch++) {
        addresses[ch][0] = ch + 1;  // First byte identifies channel
    }
    
    QByteArray data = createAllAddressesData(addresses, frequencies);
    processor->slotComSendPack(processingData::PACK_SET_ALL_ADDR, data);
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray sentPacket = sendSpy.takeFirst().at(0).toByteArray();
        QByteArray expectedPacket = createExpectedPacket(processingData::PACK_SET_ALL_ADDR, 0xEE, data);
        
        EXPECT_EQ(sentPacket, expectedPacket);
    }
}

// Test hex representation
TEST_F(SetAllAddressGeneratorTest, TestHexRepresentation) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Set simple pattern for first channel only
    for (int ch = 0; ch < 6; ch++) {
        for (int i = 0; i < 5; i++) {
            processor->MDP[ch].upDatAddress[i] = (ch == 0) ? (i + 1) : 0;
        }
        processor->MDP[ch].upDatFreq = 2400;
    }
    
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        QString hexStr = packet.toHex();
        
        // Should start with standard header
        EXPECT_TRUE(hexStr.startsWith("5a5a"));
        
        // Should contain first channel pattern "0102030405"
        EXPECT_NE(hexStr.indexOf("0102030405"), -1);
    }
}

// Test data size verification
TEST_F(SetAllAddressGeneratorTest, TestDataSize) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Just test that the data portion is exactly 36 bytes
    processor->slotSendAllAddrToLower();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.takeFirst().at(0).toByteArray();
        
        // Total packet size should be 42 (6 header + 36 data)
        EXPECT_EQ(packet.size(), 42);
        
        // Size field should indicate 42
        EXPECT_EQ(static_cast<uint8_t>(packet[3]), 42);
        
        // Data portion (after header) should be exactly 36 bytes
        QByteArray dataOnly = packet.mid(6);
        EXPECT_EQ(dataOnly.size(), 36);
    }
}