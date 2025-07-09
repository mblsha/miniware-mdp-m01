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

// Example comprehensive edge case tests for MDP protocol
// This file demonstrates how to implement the edge cases identified in edge_case_test_plan.md

class EdgeCaseTest : public ::testing::Test {
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
};

// Static members initialization
int EdgeCaseTest::argc = 0;
char** EdgeCaseTest::argv = nullptr;
QCoreApplication* EdgeCaseTest::app = nullptr;

// ========== 1. General Packet Edge Cases ==========

// Test invalid magic bytes
TEST_F(EdgeCaseTest, TestInvalidMagicBytes) {
    QByteArray packet;
    packet.append(static_cast<char>(0xFF));  // Wrong header 1
    packet.append(static_cast<char>(0xFF));  // Wrong header 2
    packet.append(static_cast<char>(processingData::PACK_SYNTHESIZE));
    packet.append(static_cast<char>(10));    // Size
    packet.append(static_cast<char>(0));     // Channel
    packet.append(static_cast<char>(0));     // Checksum
    packet.append(QByteArray(4, 0));         // Some data
    
    // Process should find no valid packets
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should not process any packets
    EXPECT_EQ(processor->now_ch, 0);  // No channel change
}

// Test packet size mismatch
TEST_F(EdgeCaseTest, TestPacketSizeMismatch) {
    QByteArray data(10, 0x55);  // 10 bytes of data
    QByteArray packet = createPacket(processingData::PACK_WAVE, 0, data);
    
    // Corrupt the size field to claim larger size
    packet[3] = 50;  // Claim 50 bytes but packet is smaller
    
    // This should be handled gracefully
    processor->slotDisposeRawPack(packet);
    
    // Wave data should not be processed due to size mismatch
    EXPECT_EQ(processor->series_V->count(), 0);
}

// Test zero size packet
TEST_F(EdgeCaseTest, TestZeroSizePacket) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));
    packet.append(static_cast<char>(0x5A));
    packet.append(static_cast<char>(processingData::PACK_HEARTBEAT));
    packet.append(static_cast<char>(0));     // Zero size!
    packet.append(static_cast<char>(0));     // Channel
    packet.append(static_cast<char>(0));     // Checksum
    
    // Should handle gracefully without crash
    processor->slotDisposeRawPack(packet);
}

// Test multiple packets in single buffer
TEST_F(EdgeCaseTest, TestMultiplePacketsInBuffer) {
    QByteArray buffer;
    
    // Add three valid packets to buffer
    QByteArray data1(0, 0);  // Empty data for heartbeat
    QByteArray packet1 = createPacket(processingData::PACK_HEARTBEAT, 0, data1);
    
    QByteArray data2(1, 0x03);  // Channel 3
    QByteArray packet2 = createPacket(processingData::PACK_UPDAT_CH, 0, data2);
    
    QByteArray data3(0, 0);  // Empty for get machine
    QByteArray packet3 = createPacket(processingData::PACK_GET_MACHINE, 0, data3);
    
    // Combine all packets
    buffer.append(packet1);
    buffer.append(packet2);
    buffer.append(packet3);
    
    // Process buffer - should handle all three packets
    QSignalSpy channelSpy(processor, &processingData::signalSetUiCh);
    processor->slotDisposeRawPack(buffer);
    
    // Verify channel update was processed
    EXPECT_EQ(channelSpy.count(), 1);
    if (channelSpy.count() > 0) {
        EXPECT_EQ(channelSpy.at(0).at(0).toInt(), 3);
    }
}

// ========== 2. Parser-Specific Edge Cases ==========

// Test wave packet without prior synthesize
TEST_F(EdgeCaseTest, TestWavePacketWithoutSynthesize) {
    // Ensure waitSynPack is true (initial state)
    EXPECT_TRUE(processor->waitSynPack);
    
    // Create wave packet data
    QByteArray waveData;
    // Add minimal wave data (1 group with 2 points for 126-byte packet)
    for (int i = 0; i < 120; i++) {
        waveData.append(static_cast<char>(0));
    }
    
    QByteArray packet = createPacket(processingData::PACK_WAVE, 0, waveData);
    processor->slotDisposeRawPack(packet);
    
    // Wave data should be ignored
    EXPECT_EQ(processor->series_V->count(), 0);
    EXPECT_EQ(processor->series_I->count(), 0);
    
    // Kaitai should still parse the packet correctly
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    ASSERT_EQ(kaitai->packets()->size(), 1);
    EXPECT_EQ(kaitai->packets()->at(0)->pack_type(), 
              miniware_mdp_m01_t::PACK_TYPE_WAVE);
}

// Test wave packet with wrong channel
TEST_F(EdgeCaseTest, TestWavePacketWrongChannel) {
    // First send synthesize to allow wave processing
    QByteArray synData(150, 0);  // 6 channels * 25 bytes
    QByteArray synPacket = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(synPacket);
    
    // Set current channel to 2
    processor->now_ch = 2;
    
    // Send wave packet for channel 5 (different from current)
    QByteArray waveData(120, 0);
    QByteArray wavePacket = createPacket(processingData::PACK_WAVE, 5, waveData);
    processor->slotDisposeRawPack(wavePacket);
    
    // Wave should be ignored due to channel mismatch
    EXPECT_EQ(processor->series_V->count(), 0);
}

// Test synthesize packet color edge cases
TEST_F(EdgeCaseTest, TestSynthesizeColorEdgeCases) {
    QByteArray synData;
    
    // Create synthesize data with specific RGB values
    for (int ch = 0; ch < 6; ch++) {
        // Basic channel data (first 17 bytes)
        synData.append(QByteArray(17, 0));
        
        // Add specific color values for testing
        if (ch == 0) {
            // All white (RGB565: 0xFFFF)
            synData.append(static_cast<char>(0xFF));  // Low byte
            synData.append(static_cast<char>(0xFF));  // High byte
            synData.append(static_cast<char>(0));     // Third color byte (unused)
        } else if (ch == 1) {
            // All black (RGB565: 0x0000)
            synData.append(static_cast<char>(0x00));
            synData.append(static_cast<char>(0x00));
            synData.append(static_cast<char>(0));
        } else {
            // Red (RGB565: 0xF800)
            synData.append(static_cast<char>(0x00));
            synData.append(static_cast<char>(0xF8));
            synData.append(static_cast<char>(0));
        }
        
        // Complete the channel data
        synData.append(QByteArray(5, 0));  // error + padding
    }
    
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(packet);
    
    // Verify color conversion
    // White: R=248, G=252, B=248 (due to RGB565 conversion loss)
    EXPECT_EQ(processor->MDP[0].color.red(), 248);
    EXPECT_EQ(processor->MDP[0].color.green(), 252);
    EXPECT_EQ(processor->MDP[0].color.blue(), 248);
    
    // Black: R=0, G=0, B=0
    EXPECT_EQ(processor->MDP[1].color.red(), 0);
    EXPECT_EQ(processor->MDP[1].color.green(), 0);
    EXPECT_EQ(processor->MDP[1].color.blue(), 0);
}

// Test temperature boundary values
TEST_F(EdgeCaseTest, TestTemperatureBoundaries) {
    QByteArray synData;
    
    for (int ch = 0; ch < 6; ch++) {
        // Basic channel data
        synData.append(QByteArray(13, 0));  // Up to temperature field
        
        // Add temperature values
        if (ch == 0) {
            // Maximum temperature (65535 raw = 6553.5°C)
            synData.append(static_cast<char>(0xFF));
            synData.append(static_cast<char>(0xFF));
        } else if (ch == 1) {
            // Zero temperature
            synData.append(static_cast<char>(0x00));
            synData.append(static_cast<char>(0x00));
        } else {
            // Normal temperature (250 = 25.0°C)
            synData.append(static_cast<char>(0xFA));
            synData.append(static_cast<char>(0x00));
        }
        
        // Complete the channel
        synData.append(QByteArray(10, 0));
    }
    
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(packet);
    
    // Verify temperatures
    EXPECT_EQ(processor->MDP[0].temp, 65535);
    EXPECT_EQ(processor->MDP[1].temp, 0);
    EXPECT_EQ(processor->MDP[2].temp, 250);
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    auto* syn = static_cast<miniware_mdp_m01_t::synthesize_t*>(kaitai->packets()->at(0)->data());
    EXPECT_FLOAT_EQ(syn->channels()->at(0)->temperature(), 6553.5f);
    EXPECT_FLOAT_EQ(syn->channels()->at(1)->temperature(), 0.0f);
    EXPECT_FLOAT_EQ(syn->channels()->at(2)->temperature(), 25.0f);
}

// ========== 3. Generator-Specific Edge Cases ==========

// Test voltage/current boundary values
TEST_F(EdgeCaseTest, TestVoltageCurrentBoundaries) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test maximum values (65.535V, 65.535A)
    processor->MDP[0].updatSetPutVoltage = 65535;
    processor->MDP[0].updatSetPutCurrent = 65535;
    processor->slotSendVoltaToLower(0);
    
    // Test zero values
    processor->MDP[1].updatSetPutVoltage = 0;
    processor->MDP[1].updatSetPutCurrent = 0;
    processor->slotSendVoltaToLower(1);
    
    EXPECT_EQ(sendSpy.count(), 2);
    
    // Verify max values packet
    if (sendSpy.count() > 0) {
        QByteArray maxPacket = sendSpy.at(0).at(0).toByteArray();
        EXPECT_EQ(static_cast<uint8_t>(maxPacket[6]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(maxPacket[7]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(maxPacket[8]), 0xFF);
        EXPECT_EQ(static_cast<uint8_t>(maxPacket[9]), 0xFF);
        
        // Kaitai validation
        auto kaitai = parseWithKaitai(maxPacket);
        auto* vcPacket = static_cast<miniware_mdp_m01_t::set_voltage_current_t*>(
            kaitai->packets()->at(0)->data());
        EXPECT_FLOAT_EQ(vcPacket->voltage(), 65.535f);
        EXPECT_FLOAT_EQ(vcPacket->current(), 65.535f);
    }
}

// Test address frequency boundaries
TEST_F(EdgeCaseTest, TestAddressFrequencyBoundaries) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test maximum frequency offset (83 = 2483 MHz)
    processor->MDP[0].upDatFreq = 2483;
    processor->MDP[0].upDatAddress[0] = 0x01;
    processor->MDP[0].upDatAddress[1] = 0x02;
    processor->MDP[0].upDatAddress[2] = 0x03;
    processor->MDP[0].upDatAddress[3] = 0x04;
    processor->MDP[0].upDatAddress[4] = 0x05;
    processor->slotSendAddrToLower(0);
    
    // Test minimum frequency (0 = 2400 MHz)
    processor->MDP[1].upDatFreq = 2400;
    for (int i = 0; i < 5; i++) {
        processor->MDP[1].upDatAddress[i] = 0xFF;
    }
    processor->slotSendAddrToLower(1);
    
    EXPECT_EQ(sendSpy.count(), 2);
    
    // Verify frequency offsets
    if (sendSpy.count() >= 2) {
        QByteArray packet1 = sendSpy.at(0).at(0).toByteArray();
        QByteArray packet2 = sendSpy.at(1).at(0).toByteArray();
        
        // Max frequency offset
        EXPECT_EQ(static_cast<uint8_t>(packet1[11]), 83);
        
        // Min frequency offset
        EXPECT_EQ(static_cast<uint8_t>(packet2[11]), 0);
    }
}

// Test RGB packet edge case
TEST_F(EdgeCaseTest, TestRGBPacketWorkaround) {
    QSignalSpy sendSpy(processor, &processingData::signalsSendPack);
    
    // Test the workaround for setting RGB off
    processor->slotSendStopRGB();
    
    EXPECT_EQ(sendSpy.count(), 1);
    
    if (sendSpy.count() > 0) {
        QByteArray packet = sendSpy.at(0).at(0).toByteArray();
        
        // Verify RGB state is 0 (off)
        EXPECT_EQ(static_cast<uint8_t>(packet[6]), 0);
        
        // Kaitai validation
        auto kaitai = parseWithKaitai(packet);
        auto* rgbPacket = static_cast<miniware_mdp_m01_t::rgb_t*>(
            kaitai->packets()->at(0)->data());
        EXPECT_FALSE(rgbPacket->is_rgb_on());
    }
}

// ========== 4. State Machine Edge Cases ==========

// Test rapid channel switching
TEST_F(EdgeCaseTest, TestRapidChannelSwitching) {
    // Set changeChannelCount to prevent immediate switching
    processor->changeChannelCount = 3;
    processor->now_ch = 0;
    
    // Send synthesize packet from channel 5
    QByteArray synData(150, 0);
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 5, synData);
    
    // Process multiple times
    for (int i = 0; i < 4; i++) {
        processor->slotDisposeRawPack(packet);
        if (i < 3) {
            // Channel should not switch yet
            EXPECT_EQ(processor->now_ch, 0);
            EXPECT_EQ(processor->changeChannelCount, 3 - i - 1);
        } else {
            // Channel should switch after countdown
            EXPECT_EQ(processor->now_ch, 5);
        }
    }
}

// Test online/offline transition flags
TEST_F(EdgeCaseTest, TestOnlineOfflineTransitions) {
    // Initialize all channels as offline
    for (int i = 0; i < 6; i++) {
        processor->MDP[i].onLine = false;
        processor->MDP[i].onLineUpdatFlag = false;
    }
    
    // Create synthesize data with all channels online
    QByteArray synData;
    for (int ch = 0; ch < 6; ch++) {
        synData.append(QByteArray(15, 0));  // Basic data
        synData.append(static_cast<char>(1));  // Online = true
        synData.append(QByteArray(9, 0));  // Rest of channel
    }
    
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    processor->slotDisposeRawPack(packet);
    
    // Verify all channels went online and flags were set
    for (int i = 0; i < 6; i++) {
        EXPECT_TRUE(processor->MDP[i].onLine);
        EXPECT_TRUE(processor->MDP[i].onLineUpdatFlag);
    }
}

// ========== 5. Checksum Validation ==========

// Test checksum calculation for various packet types
TEST_F(EdgeCaseTest, TestChecksumCalculation) {
    // Test data with known checksum
    QByteArray testData;
    testData.append(static_cast<char>(0xAA));
    testData.append(static_cast<char>(0x55));
    testData.append(static_cast<char>(0xFF));
    testData.append(static_cast<char>(0x00));
    
    // Expected checksum: 0xAA ^ 0x55 ^ 0xFF ^ 0x00 = 0x00
    uint8_t expectedChecksum = 0xAA ^ 0x55 ^ 0xFF ^ 0x00;
    EXPECT_EQ(expectedChecksum, 0x00);
    
    QByteArray packet = createPacket(processingData::PACK_HEARTBEAT, 0, testData);
    
    // Verify checksum in packet
    EXPECT_EQ(static_cast<uint8_t>(packet[5]), expectedChecksum);
    
    // Process packet - should be valid
    processor->slotDisposeRawPack(packet);
    
    // Corrupt checksum and verify rejection
    packet[5] = 0xFF;  // Wrong checksum
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    EXPECT_NE(output.find("pack_error"), std::string::npos);
}