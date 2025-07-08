#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <cstring>
#include "../processingdata.h"

class AddressPacketTest : public ::testing::Test {
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
    
    // Helper to create address packet data
    QByteArray createAddressData() {
        QByteArray data;
        
        // 6 channels, each with 5 address bytes + 1 frequency byte
        for (int ch = 0; ch < 6; ch++) {
            // Address: 5 bytes (stored in reverse order in packet)
            // Let's create addresses like 0x01, 0x02, 0x03, 0x04, 0x05+ch for each channel
            data.append(static_cast<char>(0x05 + ch));  // address[4] in machine struct
            data.append(static_cast<char>(0x04));       // address[3]
            data.append(static_cast<char>(0x03));       // address[2]
            data.append(static_cast<char>(0x02));       // address[1]
            data.append(static_cast<char>(0x01));       // address[0]
            
            // Frequency: offset from 2400 MHz
            // Let's use 2420 + ch*5 for each channel
            data.append(static_cast<char>(20 + ch * 5)); // freq - 2400
        }
        
        return data;
    }
    
    // Helper to create empty address data (all zeros)
    QByteArray createEmptyAddressData() {
        QByteArray data;
        
        // 6 channels, all zeros
        for (int ch = 0; ch < 6; ch++) {
            data.append(static_cast<char>(0x00));  // address[4]
            data.append(static_cast<char>(0x00));  // address[3]
            data.append(static_cast<char>(0x00));  // address[2]
            data.append(static_cast<char>(0x00));  // address[1]
            data.append(static_cast<char>(0x00));  // address[0]
            data.append(static_cast<char>(25));    // freq = 2425 MHz
        }
        
        return data;
    }
};

// Static members initialization
int AddressPacketTest::argc = 0;
char** AddressPacketTest::argv = nullptr;
QCoreApplication* AddressPacketTest::app = nullptr;

// Test PACK_ADDR parsing with valid addresses
TEST_F(AddressPacketTest, TestValidAddressPacket) {
    // Create address packet with test data
    QByteArray addrData = createAddressData();
    QByteArray packet = createPacket(processingData::PACK_ADDR, 0, addrData);
    
    // Verify packet size (6 header + 36 data = 42 bytes)
    EXPECT_EQ(packet.size(), 42);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify each channel's address and frequency
    for (int ch = 0; ch < 6; ch++) {
        machine* m = &processor->MDP[ch];
        
        // Check address flag was set
        EXPECT_TRUE(m->addressFlag);
        
        // Check address is not empty
        EXPECT_FALSE(m->addrEmpty);
        
        // Verify address bytes (stored in normal order in machine struct)
        EXPECT_EQ(m->address[0], 0x01);
        EXPECT_EQ(m->address[1], 0x02);
        EXPECT_EQ(m->address[2], 0x03);
        EXPECT_EQ(m->address[3], 0x04);
        EXPECT_EQ(m->address[4], 0x05 + ch);
        
        // Verify frequency
        EXPECT_EQ(m->freq, 2420 + ch * 5);
    }
}

// Test PACK_ADDR with empty addresses
TEST_F(AddressPacketTest, TestEmptyAddressPacket) {
    // Create address packet with all zeros
    QByteArray addrData = createEmptyAddressData();
    QByteArray packet = createPacket(processingData::PACK_ADDR, 0, addrData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify each channel
    for (int ch = 0; ch < 6; ch++) {
        machine* m = &processor->MDP[ch];
        
        // Check address flag was set
        EXPECT_TRUE(m->addressFlag);
        
        // Check address is marked as empty
        EXPECT_TRUE(m->addrEmpty);
        
        // Verify all address bytes are zero
        for (int i = 0; i < 5; i++) {
            EXPECT_EQ(m->address[i], 0x00);
        }
        
        // Frequency should still be set
        EXPECT_EQ(m->freq, 2425);
    }
}

// Test invalid checksum handling
TEST_F(AddressPacketTest, TestInvalidChecksum) {
    QByteArray addrData = createAddressData();
    QByteArray packet = createPacket(processingData::PACK_ADDR, 0, addrData);
    
    // Corrupt the checksum
    packet[5] = packet[5] ^ 0xFF;
    
    // Process the packet - should be rejected
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should have error message
    EXPECT_NE(output.find("pack_error"), std::string::npos);
}

// Test address data generation
TEST_F(AddressPacketTest, TestAddressDataGeneration) {
    QByteArray data = createAddressData();
    
    // Should be 6 channels * 6 bytes = 36 bytes
    EXPECT_EQ(data.size(), 36);
    
    // Verify structure of first channel
    EXPECT_EQ(static_cast<uint8_t>(data[0]), 0x05);  // First channel address[4]
    EXPECT_EQ(static_cast<uint8_t>(data[1]), 0x04);  // address[3]
    EXPECT_EQ(static_cast<uint8_t>(data[2]), 0x03);  // address[2]
    EXPECT_EQ(static_cast<uint8_t>(data[3]), 0x02);  // address[1]
    EXPECT_EQ(static_cast<uint8_t>(data[4]), 0x01);  // address[0]
    EXPECT_EQ(static_cast<uint8_t>(data[5]), 20);    // freq offset
    
    // Verify last channel starts at correct offset
    EXPECT_EQ(static_cast<uint8_t>(data[30]), 0x0A); // Last channel address[4] = 0x05 + 5
}

// Test mixed empty and non-empty addresses
TEST_F(AddressPacketTest, TestMixedAddresses) {
    QByteArray data;
    
    // Create mixed data: channels 0,2,4 empty, channels 1,3,5 with addresses
    for (int ch = 0; ch < 6; ch++) {
        if (ch % 2 == 0) {
            // Empty address
            data.append(static_cast<char>(0x00));
            data.append(static_cast<char>(0x00));
            data.append(static_cast<char>(0x00));
            data.append(static_cast<char>(0x00));
            data.append(static_cast<char>(0x00));
        } else {
            // Valid address
            data.append(static_cast<char>(0xAA));
            data.append(static_cast<char>(0xBB));
            data.append(static_cast<char>(0xCC));
            data.append(static_cast<char>(0xDD));
            data.append(static_cast<char>(0xEE));
        }
        data.append(static_cast<char>(30 + ch)); // freq offset
    }
    
    QByteArray packet = createPacket(processingData::PACK_ADDR, 0, data);
    processor->slotDisposeRawPack(packet);
    
    // Verify results
    for (int ch = 0; ch < 6; ch++) {
        machine* m = &processor->MDP[ch];
        
        if (ch % 2 == 0) {
            EXPECT_TRUE(m->addrEmpty);
        } else {
            EXPECT_FALSE(m->addrEmpty);
            EXPECT_EQ(m->address[0], 0xEE);
            EXPECT_EQ(m->address[1], 0xDD);
            EXPECT_EQ(m->address[2], 0xCC);
            EXPECT_EQ(m->address[3], 0xBB);
            EXPECT_EQ(m->address[4], 0xAA);
        }
        
        EXPECT_EQ(m->freq, 2430 + ch);
    }
}

