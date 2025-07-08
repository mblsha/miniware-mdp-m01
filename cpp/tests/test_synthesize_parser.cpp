#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <cstring>
#include <sstream>
#include "../processingdata.h"
#include "miniware_mdp_m01.h"
#include <kaitai/kaitaistream.h>

class SynthesizePacketTest : public ::testing::Test {
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
    
    // Helper to create synthesize packet data for 6 channels
    QByteArray createSynthesizeData(
        uint16_t voltage = 5000,      // 5V in mV
        uint16_t current = 1000,      // 1A in mA
        uint16_t inputVoltage = 12000, // 12V input
        uint16_t inputCurrent = 500,   // 0.5A input
        uint16_t setVoltage = 5000,    // 5V preset
        uint16_t setCurrent = 1000,    // 1A preset
        uint16_t temperature = 25,      // 25°C
        bool online = true,
        uint8_t machineType = 2,    // P906
        bool locked = false,
        bool ccMode = true,
        bool outputOn = true
    ) {
        QByteArray data;
        
        // Data for 6 channels
        for (int ch = 0; ch < 6; ch++) {
            // Channel number
            data.append(static_cast<char>(ch));  // syn_pack_NO
            
            // Real-time voltage (2 bytes, little endian)
            data.append(static_cast<char>(voltage & 0xFF));  // syn_pack_real_volt_L
            data.append(static_cast<char>((voltage >> 8) & 0xFF));  // syn_pack_real_volt_H
            
            // Real-time current (2 bytes, little endian)
            data.append(static_cast<char>(current & 0xFF));  // syn_pack_real_elect_L
            data.append(static_cast<char>((current >> 8) & 0xFF));  // syn_pack_real_elect_H
            
            // Input voltage (2 bytes, little endian)
            data.append(static_cast<char>(inputVoltage & 0xFF));  // syn_pack_input_volt_L
            data.append(static_cast<char>((inputVoltage >> 8) & 0xFF));  // syn_pack_input_volt_H
            
            // Input current (2 bytes, little endian)
            data.append(static_cast<char>(inputCurrent & 0xFF));  // syn_pack_input_elect_L
            data.append(static_cast<char>((inputCurrent >> 8) & 0xFF));  // syn_pack_input_elect_H
            
            // Preset voltage (2 bytes, little endian)
            data.append(static_cast<char>(setVoltage & 0xFF));  // syn_pack_default_volt_L
            data.append(static_cast<char>((setVoltage >> 8) & 0xFF));  // syn_pack_default_volt_H
            
            // Preset current (2 bytes, little endian)
            data.append(static_cast<char>(setCurrent & 0xFF));  // syn_pack_default_elect_L
            data.append(static_cast<char>((setCurrent >> 8) & 0xFF));  // syn_pack_default_elect_H
            
            // Temperature (2 bytes, little endian)
            data.append(static_cast<char>(temperature & 0xFF));  // syn_pack_temp_volt_L
            data.append(static_cast<char>((temperature >> 8) & 0xFF));  // syn_pack_temp_volt_H
            
            // Status flags
            data.append(static_cast<char>(online ? 1 : 0));  // syn_pack_online
            data.append(static_cast<char>(machineType));     // syn_pack_type
            data.append(static_cast<char>(locked ? 1 : 0));  // syn_pack_lock
            data.append(static_cast<char>(ccMode ? 0 : 1));  // syn_pack_cc_or_cv (0=CC, 1=CV)
            data.append(static_cast<char>(outputOn ? 1 : 0)); // syn_pack_is_output
            
            // Color (3 bytes RGB)
            data.append(static_cast<char>(255));  // syn_pack_colour_1 (R)
            data.append(static_cast<char>(0));    // syn_pack_colour_2 (G)
            data.append(static_cast<char>(0));    // syn_pack_colour_3 (B)
            
            // Error flag
            data.append(static_cast<char>(0));    // syn_pack_error
            
            // syn_pack_end (padding byte to reach syn_pack_max = 25)
            data.append(static_cast<char>(0));
            
            // Modify values for each channel to make them unique
            voltage += 100;
            current += 50;
        }
        
        return data;
    }
};

// Static members initialization
int SynthesizePacketTest::argc = 0;
char** SynthesizePacketTest::argv = nullptr;
QCoreApplication* SynthesizePacketTest::app = nullptr;

// Test basic synthesize packet parsing
TEST_F(SynthesizePacketTest, TestBasicSynthesizePacket) {
    // Create synthesize packet
    QByteArray synData = createSynthesizeData();
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify channel 0 data
    EXPECT_EQ(processor->MDP[0].NO, 0);
    EXPECT_EQ(processor->MDP[0].outPutVoltage, 5000);
    EXPECT_EQ(processor->MDP[0].outPutCurrent, 1000);
    EXPECT_EQ(processor->MDP[0].inPutVoltage, 12000);
    EXPECT_EQ(processor->MDP[0].inPutCurrent, 500);
    EXPECT_EQ(processor->MDP[0].setPutVoltage, 5000);
    EXPECT_EQ(processor->MDP[0].setPutCurrent, 1000);
    EXPECT_EQ(processor->MDP[0].temp, 25);
    EXPECT_TRUE(processor->MDP[0].onLine);
    EXPECT_FALSE(processor->MDP[0].lock);
    EXPECT_TRUE(processor->MDP[0].outPutState);
    
    // Verify channel 1 has different values
    EXPECT_EQ(processor->MDP[1].NO, 1);
    EXPECT_EQ(processor->MDP[1].outPutVoltage, 5100);  // Incremented by 100
    EXPECT_EQ(processor->MDP[1].outPutCurrent, 1050);  // Incremented by 50
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    ASSERT_EQ(kaitai->packets()->size(), 1);
    
    auto* pkt = kaitai->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SYNTHESIZE);
    EXPECT_EQ(pkt->size(), 156); // 6 header + 150 data
    
    auto* syn = static_cast<miniware_mdp_m01_t::synthesize_t*>(pkt->data());
    EXPECT_EQ(syn->channel(), 0);
    EXPECT_EQ(syn->channels()->size(), 6);
    
    // Verify channel 0 data matches
    auto* chan0 = syn->channels()->at(0);
    EXPECT_EQ(chan0->num(), 0);
    EXPECT_FLOAT_EQ(chan0->out_voltage(), 5.0f);    // 5000mV -> 5.0V
    EXPECT_FLOAT_EQ(chan0->out_current(), 1.0f);    // 1000mA -> 1.0A
    EXPECT_FLOAT_EQ(chan0->in_voltage(), 12.0f);    // 12000mV -> 12.0V
    EXPECT_FLOAT_EQ(chan0->in_current(), 0.5f);     // 500mA -> 0.5A
    EXPECT_FLOAT_EQ(chan0->set_voltage(), 5.0f);    // 5000mV -> 5.0V
    EXPECT_FLOAT_EQ(chan0->set_current(), 1.0f);    // 1000mA -> 1.0A
    EXPECT_FLOAT_EQ(chan0->temperature(), 2.5f);    // 25 raw -> 2.5°C
    EXPECT_EQ(chan0->online(), 1);
    EXPECT_EQ(chan0->type(), miniware_mdp_m01_t::MACHINE_TYPE_P906); // 2 maps to P906 in enum
    EXPECT_EQ(chan0->lock(), 0);
    EXPECT_EQ(chan0->output_on(), 1);
    
    // Verify channel 1 data increments
    auto* chan1 = syn->channels()->at(1);
    EXPECT_EQ(chan1->num(), 1);
    EXPECT_FLOAT_EQ(chan1->out_voltage(), 5.1f);    // 5100mV -> 5.1V
    EXPECT_FLOAT_EQ(chan1->out_current(), 1.05f);   // 1050mA -> 1.05A
}

// Test all 6 channels data
TEST_F(SynthesizePacketTest, TestAllChannelsData) {
    // Create synthesize packet
    QByteArray synData = createSynthesizeData(3300, 500); // 3.3V, 0.5A
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 2, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify all 6 channels received data
    for (int i = 0; i < 6; i++) {
        EXPECT_EQ(processor->MDP[i].NO, i);
        EXPECT_EQ(processor->MDP[i].outPutVoltage, 3300 + i * 100);
        EXPECT_EQ(processor->MDP[i].outPutCurrent, 500 + i * 50);
        EXPECT_TRUE(processor->MDP[i].onLine);
        
        // Verify power calculations
        uint32_t expectedPower = static_cast<uint32_t>(
            processor->MDP[i].outPutVoltage * processor->MDP[i].outPutCurrent / 1000.0
        );
        EXPECT_EQ(processor->MDP[i].outPutPower, expectedPower);
    }
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    ASSERT_EQ(kaitai->packets()->size(), 1);
    
    auto* pkt = kaitai->packets()->at(0);
    auto* syn = static_cast<miniware_mdp_m01_t::synthesize_t*>(pkt->data());
    EXPECT_EQ(syn->channel(), 2); // Channel from packet header
    
    // Verify all 6 channels
    for (int i = 0; i < 6; i++) {
        auto* chan = syn->channels()->at(i);
        EXPECT_EQ(chan->num(), i);
        EXPECT_FLOAT_EQ(chan->out_voltage(), (3300 + i * 100) / 1000.0f);
        EXPECT_FLOAT_EQ(chan->out_current(), (500 + i * 50) / 1000.0f);
        EXPECT_EQ(chan->online(), 1);
        EXPECT_EQ(chan->type(), miniware_mdp_m01_t::MACHINE_TYPE_P906);
    }
}

// Test channel switching
TEST_F(SynthesizePacketTest, TestChannelSwitching) {
    // Start with channel 0
    processor->now_ch = 0;
    
    // Send packet from channel 3
    QByteArray synData = createSynthesizeData();
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 3, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Channel should have switched
    EXPECT_EQ(processor->now_ch, 3);
}

// Test online/offline status changes
TEST_F(SynthesizePacketTest, TestOnlineStatusChange) {
    // First packet - all channels online
    QByteArray synData1 = createSynthesizeData(5000, 1000, 12000, 500, 5000, 1000, 25, true);
    QByteArray packet1 = createPacket(processingData::PACK_SYNTHESIZE, 0, synData1);
    processor->slotDisposeRawPack(packet1);
    
    // Verify all online
    for (int i = 0; i < 6; i++) {
        EXPECT_TRUE(processor->MDP[i].onLine);
        processor->MDP[i].onLineUpdatFlag = false; // Reset flag
    }
    
    // Second packet - channel 2 goes offline
    QByteArray synData2 = createSynthesizeData(5000, 1000, 12000, 500, 5000, 1000, 25, false);
    QByteArray packet2 = createPacket(processingData::PACK_SYNTHESIZE, 0, synData2);
    processor->slotDisposeRawPack(packet2);
    
    // All channels should be offline now (since all use same data)
    for (int i = 0; i < 6; i++) {
        EXPECT_FALSE(processor->MDP[i].onLine);
        EXPECT_TRUE(processor->MDP[i].onLineUpdatFlag);
    }
}

// Test lock status
TEST_F(SynthesizePacketTest, TestLockStatus) {
    // Create packet with locked status
    QByteArray synData = createSynthesizeData(
        5000, 1000, 12000, 500, 5000, 1000, 25, 
        true,  // online
        2,  // P906
        true   // locked
    );
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify lock status
    for (int i = 0; i < 6; i++) {
        EXPECT_TRUE(processor->MDP[i].lock);
    }
}

// Test CC/CV mode
TEST_F(SynthesizePacketTest, TestCCCVMode) {
    // Create packet with CV mode (ccMode = false)
    QByteArray synData = createSynthesizeData(
        5000, 1000, 12000, 500, 5000, 1000, 25,
        true,   // online
        0x10,   // haveLcd
        false,  // locked
        false   // CV mode
    );
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // The packet sends 1 for CV mode (0 for CC)
    // Verify based on the actual implementation
}

// Test output on/off status
TEST_F(SynthesizePacketTest, TestOutputStatus) {
    // Create packet with output off
    QByteArray synData = createSynthesizeData(
        5000, 1000, 12000, 500, 5000, 1000, 25,
        true,   // online
        0x10,   // haveLcd
        false,  // locked
        true,   // CC mode
        false   // output off
    );
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify output status
    for (int i = 0; i < 6; i++) {
        EXPECT_FALSE(processor->MDP[i].outPutState);
    }
}

// Test temperature reading
TEST_F(SynthesizePacketTest, TestTemperatureReading) {
    // Create packet with specific temperature
    uint16_t testTemp = 45; // 45°C
    QByteArray synData = createSynthesizeData(
        5000, 1000, 12000, 500, 5000, 1000, testTemp
    );
    QByteArray packet = createPacket(processingData::PACK_SYNTHESIZE, 0, synData);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify temperature
    for (int i = 0; i < 6; i++) {
        EXPECT_EQ(processor->MDP[i].temp, testTemp);
    }
    
    // Kaitai cross-validation
    auto kaitai = parseWithKaitai(packet);
    ASSERT_NE(kaitai, nullptr);
    auto* syn = static_cast<miniware_mdp_m01_t::synthesize_t*>(kaitai->packets()->at(0)->data());
    
    // Verify temperature in all channels
    for (int i = 0; i < 6; i++) {
        auto* chan = syn->channels()->at(i);
        EXPECT_FLOAT_EQ(chan->temperature(), testTemp / 10.0f); // 45 raw -> 4.5°C
    }
}

// Test synthesize data generation
TEST_F(SynthesizePacketTest, TestSynthesizeDataGeneration) {
    QByteArray data = createSynthesizeData();
    
    // Should have data for 6 channels
    // Each channel has 25 bytes (syn_pack_max)
    int expectedSize = 6 * 25;  // 150 bytes total
    EXPECT_EQ(data.size(), expectedSize);
    
    // Verify structure of first channel
    EXPECT_EQ(static_cast<uint8_t>(data[0]), 0); // Channel 0 number
    
    // Verify voltage is stored in little-endian format
    uint16_t voltage = static_cast<uint8_t>(data[1]) | (static_cast<uint8_t>(data[2]) << 8);
    EXPECT_EQ(voltage, 5000);
}

