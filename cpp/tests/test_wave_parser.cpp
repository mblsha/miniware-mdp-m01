#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <cstring>
#include <sstream>
#include "../processingdata.h"
#include "miniware_mdp_m01.h"
#include <kaitai/kaitaistream.h>

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
    
    // Helper to parse QByteArray with Kaitai
    std::unique_ptr<miniware_mdp_m01_t> parseWithKaitai(const QByteArray& data) {
        std::string dataStr(data.constData(), data.size());
        std::istringstream iss(dataStr);
        auto ks = std::make_unique<kaitai::kstream>(&iss);
        return std::make_unique<miniware_mdp_m01_t>(ks.get());
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
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    ASSERT_EQ(kaitai->packets()->size(), 1);
    
    auto* pkt = kaitai->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_WAVE);
    EXPECT_EQ(pkt->size(), 126);
    
    auto* wave = static_cast<miniware_mdp_m01_t::wave_t*>(pkt->data());
    EXPECT_EQ(wave->channel(), 0);
    EXPECT_EQ(wave->group_size(), 2);
    EXPECT_EQ(wave->groups()->size(), 10);
    
    // Verify first group matches original parser
    auto* group0 = wave->groups()->at(0);
    EXPECT_EQ(group0->timestamp(), 1000);
    EXPECT_EQ(group0->items()->size(), 2);
    
    // Check first item values match
    auto* item0 = group0->items()->at(0);
    EXPECT_FLOAT_EQ(item0->voltage(), 3.3f);  // 3300mV -> 3.3V
    EXPECT_FLOAT_EQ(item0->current(), 0.5f);  // 500mA -> 0.5A
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
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    ASSERT_EQ(kaitai->packets()->size(), 1);
    
    auto* pkt = kaitai->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_WAVE);
    EXPECT_EQ(pkt->size(), 206);
    
    auto* wave = static_cast<miniware_mdp_m01_t::wave_t*>(pkt->data());
    EXPECT_EQ(wave->channel(), 0);
    EXPECT_EQ(wave->group_size(), 4);
    EXPECT_EQ(wave->groups()->size(), 10);
    
    // Verify data structure
    for (int g = 0; g < 10; g++) {
        auto* group = wave->groups()->at(g);
        EXPECT_EQ(group->timestamp(), static_cast<uint32_t>(1000 + g * 100));
        EXPECT_EQ(group->items()->size(), 4);
        
        // Check first item in each group
        auto* item0 = group->items()->at(0);
        float expectedVoltage = (3300 + g * 100) / 1000.0f;
        float expectedCurrent = (500 + g * 50) / 1000.0f;
        EXPECT_FLOAT_EQ(item0->voltage(), expectedVoltage);
        EXPECT_FLOAT_EQ(item0->current(), expectedCurrent);
    }
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
    
    // Kaitai cross-validation for both packets
    auto kaitai1 = parseWithKaitai(packet1);
    auto kaitai2 = parseWithKaitai(packet2);
    
    // Verify first packet
    ASSERT_NE(kaitai1, nullptr);
    ASSERT_EQ(kaitai1->packets()->size(), 1);
    auto* wave1 = static_cast<miniware_mdp_m01_t::wave_t*>(kaitai1->packets()->at(0)->data());
    EXPECT_EQ(wave1->groups()->at(0)->timestamp(), 1000);
    
    // Verify second packet
    ASSERT_NE(kaitai2, nullptr);
    ASSERT_EQ(kaitai2->packets()->size(), 1);
    auto* wave2 = static_cast<miniware_mdp_m01_t::wave_t*>(kaitai2->packets()->at(0)->data());
    EXPECT_EQ(wave2->groups()->at(0)->timestamp(), 2000);
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

