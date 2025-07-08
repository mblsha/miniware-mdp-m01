#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <cstring>
#include "../processingdata.h"

class ProcessingDataTest : public ::testing::Test {
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
    
    // Helper to create wave packet data
    QByteArray createWaveData(int packetSize, uint32_t startTime = 1000) {
        QByteArray data;
        
        // Wave packet structure:
        // 10 groups of data
        // Each group: 4 bytes time + (2 or 4) * 4 bytes point data
        // Point data: 2 bytes voltage + 2 bytes current
        
        int pointsPerGroup = (packetSize == 126) ? 2 : 4;
        
        for (int group = 0; group < 10; group++) {
            // Time stamp (4 bytes, little endian)
            uint32_t groupTime = startTime + group * 100;
            data.append(static_cast<char>(groupTime & 0xFF));
            data.append(static_cast<char>((groupTime >> 8) & 0xFF));
            data.append(static_cast<char>((groupTime >> 16) & 0xFF));
            data.append(static_cast<char>((groupTime >> 24) & 0xFF));
            
            // Points in this group
            for (int point = 0; point < pointsPerGroup; point++) {
                // Voltage (2 bytes, in millivolts)
                uint16_t voltage = 3300 + group * 100 + point * 10; // 3.3V base
                data.append(static_cast<char>(voltage & 0xFF));
                data.append(static_cast<char>((voltage >> 8) & 0xFF));
                
                // Current (2 bytes, in milliamps)
                uint16_t current = 500 + group * 50 + point * 5; // 0.5A base
                data.append(static_cast<char>(current & 0xFF));
                data.append(static_cast<char>((current >> 8) & 0xFF));
            }
        }
        
        return data;
    }
};

// Static members initialization
int ProcessingDataTest::argc = 0;
char** ProcessingDataTest::argv = nullptr;
QCoreApplication* ProcessingDataTest::app = nullptr;

// Test PACK_WAVE parsing with 126-byte packet (2 points per group)
TEST_F(ProcessingDataTest, TestWavePacket126Bytes) {
    // First send a synthesize packet to allow wave processing
    QByteArray synData(processingData::syn_pack_max - 6, 0); // Empty synthesize data
    QByteArray synPacket = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(synPacket);
    
    // Create a 126-byte wave packet
    QByteArray waveData = createWaveData(126);
    QByteArray packet = createPacket(processingData::PACK_WAVE, 0, waveData);
    
    // Verify packet size
    EXPECT_EQ(packet.size(), 126);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Check that series data was updated
    ASSERT_NE(processor->series_V, nullptr);
    ASSERT_NE(processor->series_I, nullptr);
    
    // Should have 20 points (10 groups * 2 points)
    EXPECT_EQ(processor->series_V->count(), 20);
    EXPECT_EQ(processor->series_I->count(), 20);
    
    // Verify first point values
    if (processor->series_V->count() > 0) {
        QPointF firstVoltage = processor->series_V->at(0);
        QPointF firstCurrent = processor->series_I->at(0);
        
        // First voltage should be 3.3V (3300mV)
        EXPECT_NEAR(firstVoltage.y(), 3.3, 0.001);
        // First current should be 0.5A (500mA)
        EXPECT_NEAR(firstCurrent.y(), 0.5, 0.001);
    }
}

// Test PACK_WAVE parsing with 206-byte packet (4 points per group)
TEST_F(ProcessingDataTest, TestWavePacket206Bytes) {
    // First send a synthesize packet to allow wave processing
    QByteArray synData(processingData::syn_pack_max - 6, 0);
    QByteArray synPacket = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(synPacket);
    
    // Create a 206-byte wave packet
    QByteArray waveData = createWaveData(206);
    QByteArray packet = createPacket(processingData::PACK_WAVE, 0, waveData);
    
    // Verify packet size
    EXPECT_EQ(packet.size(), 206);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Should have 40 points (10 groups * 4 points)
    EXPECT_EQ(processor->series_V->count(), 40);
    EXPECT_EQ(processor->series_I->count(), 40);
}

// Test invalid checksum handling
TEST_F(ProcessingDataTest, TestInvalidChecksum) {
    QByteArray waveData = createWaveData(126);
    QByteArray packet = createPacket(processingData::PACK_WAVE, 0, waveData);
    
    // Corrupt the checksum
    packet[5] = packet[5] ^ 0xFF;
    
    // Process the packet - should be rejected
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should have error message
    EXPECT_NE(output.find("pack_error"), std::string::npos);
    
    // Series should remain empty since packet was invalid
    EXPECT_EQ(processor->series_V->count(), 0);
    EXPECT_EQ(processor->series_I->count(), 0);
}

// Test multiple wave packets
TEST_F(ProcessingDataTest, TestMultipleWavePackets) {
    // First send a synthesize packet to allow wave processing
    QByteArray synData(processingData::syn_pack_max - 6, 0);
    QByteArray synPacket = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(synPacket);
    
    // Clear the wave to start fresh
    processor->slotCleanWave();
    
    // Send first packet
    QByteArray waveData1 = createWaveData(126, 1000);
    QByteArray packet1 = createPacket(processingData::PACK_WAVE, 0, waveData1);
    processor->slotDisposeRawPack(packet1);
    
    int firstCount = processor->series_V->count();
    EXPECT_GT(firstCount, 0); // Should have some points
    
    // Send second packet with sequential time stamps
    QByteArray waveData2 = createWaveData(126, 2000);
    QByteArray packet2 = createPacket(processingData::PACK_WAVE, 0, waveData2);
    processor->slotDisposeRawPack(packet2);
    
    // Should have more points than before
    EXPECT_GT(processor->series_V->count(), firstCount);
}

// Test wave data generation
TEST_F(ProcessingDataTest, TestWaveDataGeneration) {
    // Test 126-byte packet data generation
    QByteArray data126 = createWaveData(126);
    // 10 groups * (4 bytes time + 2 points * 4 bytes) = 10 * 12 = 120 bytes
    EXPECT_EQ(data126.size(), 120);
    
    // Test 206-byte packet data generation
    QByteArray data206 = createWaveData(206);
    // 10 groups * (4 bytes time + 4 points * 4 bytes) = 10 * 20 = 200 bytes
    EXPECT_EQ(data206.size(), 200);
}

// Main function for running tests
int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}