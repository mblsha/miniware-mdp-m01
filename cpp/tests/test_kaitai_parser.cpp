#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <sstream>
#include <cstring>
#include "miniware_mdp_m01.h"
#include <kaitai/kaitaistream.h>

class KaitaiParserTest : public ::testing::Test {
protected:
    static int argc;
    static char** argv;
    static QCoreApplication* app;
    
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
    
    // Helper to parse QByteArray with Kaitai
    std::unique_ptr<miniware_mdp_m01_t> parseWithKaitai(const QByteArray& data) {
        std::string dataStr(data.constData(), data.size());
        std::istringstream iss(dataStr);
        auto ks = std::make_unique<kaitai::kstream>(&iss);
        return std::make_unique<miniware_mdp_m01_t>(ks.get());
    }
};

// Static members initialization
int KaitaiParserTest::argc = 0;
char** KaitaiParserTest::argv = nullptr;
QCoreApplication* KaitaiParserTest::app = nullptr;

// Test parsing a heartbeat packet
TEST_F(KaitaiParserTest, TestHeartbeatPacket) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));  // Magic 1
    packet.append(static_cast<char>(0x5A));  // Magic 2
    packet.append(static_cast<char>(0x22));  // PACK_TYPE_HEARTBEAT
    packet.append(static_cast<char>(0x04));  // Size (just header, no data)
    
    auto parser = parseWithKaitai(packet);
    ASSERT_NE(parser, nullptr);
    ASSERT_EQ(parser->packets()->size(), 1);
    
    auto* pkt = parser->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_HEARTBEAT);
    EXPECT_EQ(pkt->size(), 4);
}

// Test parsing a wave packet
TEST_F(KaitaiParserTest, TestWavePacket) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));  // Magic 1
    packet.append(static_cast<char>(0x5A));  // Magic 2
    packet.append(static_cast<char>(0x12));  // PACK_TYPE_WAVE
    packet.append(static_cast<char>(126));   // Size for 2 points per group
    
    // Wave data
    packet.append(static_cast<char>(0));     // Channel
    packet.append(static_cast<char>(0));     // Dummy
    
    // Add 10 groups of wave data
    for (int g = 0; g < 10; g++) {
        // Timestamp (4 bytes)
        uint32_t timestamp = g * 1000;
        packet.append(timestamp & 0xFF);
        packet.append((timestamp >> 8) & 0xFF);
        packet.append((timestamp >> 16) & 0xFF);
        packet.append((timestamp >> 24) & 0xFF);
        
        // 2 items per group
        for (int i = 0; i < 2; i++) {
            // Voltage (2 bytes)
            uint16_t voltage = 3300 + i * 100;
            packet.append(voltage & 0xFF);
            packet.append((voltage >> 8) & 0xFF);
            
            // Current (2 bytes)
            uint16_t current = 1000 + i * 50;
            packet.append(current & 0xFF);
            packet.append((current >> 8) & 0xFF);
        }
    }
    
    auto parser = parseWithKaitai(packet);
    ASSERT_NE(parser, nullptr);
    ASSERT_EQ(parser->packets()->size(), 1);
    
    auto* pkt = parser->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_WAVE);
    EXPECT_EQ(pkt->size(), 126);
    
    auto* wave = static_cast<miniware_mdp_m01_t::wave_t*>(pkt->data());
    EXPECT_EQ(wave->channel(), 0);
    EXPECT_EQ(wave->group_size(), 2);
    EXPECT_EQ(wave->groups()->size(), 10);
    
    // Check first group
    auto* group0 = wave->groups()->at(0);
    EXPECT_EQ(group0->timestamp(), 0);
    EXPECT_EQ(group0->items()->size(), 2);
    
    // Check first item in first group
    auto* item0 = group0->items()->at(0);
    EXPECT_FLOAT_EQ(item0->voltage(), 3.3f);
    EXPECT_FLOAT_EQ(item0->current(), 1.0f);
}

// Test parsing a synthesize packet
TEST_F(KaitaiParserTest, TestSynthesizePacket) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));  // Magic 1
    packet.append(static_cast<char>(0x5A));  // Magic 2
    packet.append(static_cast<char>(0x11));  // PACK_TYPE_SYNTHESIZE
    packet.append(static_cast<char>(156));   // Size (6 header + 150 data)
    
    // Synthesize data
    packet.append(static_cast<char>(0));     // Channel
    packet.append(static_cast<char>(0));     // Dummy
    
    // Add 6 channels of data (25 bytes each)
    for (int ch = 0; ch < 6; ch++) {
        packet.append(static_cast<char>(ch));              // Channel number
        
        // Out voltage/current
        uint16_t outVoltage = 3600;
        uint16_t outCurrent = 1000;
        packet.append(outVoltage & 0xFF);
        packet.append((outVoltage >> 8) & 0xFF);
        packet.append(outCurrent & 0xFF);
        packet.append((outCurrent >> 8) & 0xFF);
        
        // In voltage/current
        uint16_t inVoltage = 15000;
        uint16_t inCurrent = 1500;
        packet.append(inVoltage & 0xFF);
        packet.append((inVoltage >> 8) & 0xFF);
        packet.append(inCurrent & 0xFF);
        packet.append((inCurrent >> 8) & 0xFF);
        
        // Set voltage/current
        uint16_t setVoltage = 3600;
        uint16_t setCurrent = 1000;
        packet.append(setVoltage & 0xFF);
        packet.append((setVoltage >> 8) & 0xFF);
        packet.append(setCurrent & 0xFF);
        packet.append((setCurrent >> 8) & 0xFF);
        
        // Temperature
        uint16_t temp = 281; // 28.1°C
        packet.append(temp & 0xFF);
        packet.append((temp >> 8) & 0xFF);
        
        packet.append(static_cast<char>(1));    // Online
        packet.append(static_cast<char>(miniware_mdp_m01_t::MACHINE_TYPE_P906)); // Type
        packet.append(static_cast<char>(0));    // Lock
        packet.append(static_cast<char>(1));    // Status (CC)
        packet.append(static_cast<char>(1));    // Output on
        packet.append(static_cast<char>(0xFF)); // Color R
        packet.append(static_cast<char>(0xA0)); // Color G
        packet.append(static_cast<char>(0x00)); // Color B
        packet.append(static_cast<char>(0));    // Error
        packet.append(static_cast<char>(0));    // End
    }
    
    auto parser = parseWithKaitai(packet);
    ASSERT_NE(parser, nullptr);
    ASSERT_EQ(parser->packets()->size(), 1);
    
    auto* pkt = parser->packets()->at(0);
    EXPECT_EQ(pkt->pack_type(), miniware_mdp_m01_t::PACK_TYPE_SYNTHESIZE);
    EXPECT_EQ(pkt->size(), 156);
    
    auto* syn = static_cast<miniware_mdp_m01_t::synthesize_t*>(pkt->data());
    EXPECT_EQ(syn->channel(), 0);
    EXPECT_EQ(syn->channels()->size(), 6);
    
    // Check first channel
    auto* chan0 = syn->channels()->at(0);
    EXPECT_EQ(chan0->num(), 0);
    EXPECT_FLOAT_EQ(chan0->out_voltage(), 3.6f);
    EXPECT_FLOAT_EQ(chan0->out_current(), 1.0f);
    EXPECT_FLOAT_EQ(chan0->in_voltage(), 15.0f);
    EXPECT_FLOAT_EQ(chan0->in_current(), 1.5f);
    EXPECT_FLOAT_EQ(chan0->set_voltage(), 3.6f);
    EXPECT_FLOAT_EQ(chan0->set_current(), 1.0f);
    EXPECT_FLOAT_EQ(chan0->temperature(), 28.1f);
    EXPECT_TRUE(chan0->online());
    EXPECT_EQ(chan0->type(), miniware_mdp_m01_t::MACHINE_TYPE_P906);
}

// Test parsing multiple packets in one stream
TEST_F(KaitaiParserTest, TestMultiplePackets) {
    QByteArray data;
    
    // First packet: heartbeat
    data.append(static_cast<char>(0x5A));
    data.append(static_cast<char>(0x5A));
    data.append(static_cast<char>(0x22));
    data.append(static_cast<char>(0x04));
    
    // Second packet: RGB with data
    data.append(static_cast<char>(0x5A));
    data.append(static_cast<char>(0x5A));
    data.append(static_cast<char>(0x20));
    data.append(static_cast<char>(0x05));
    data.append(static_cast<char>(0x01)); // RGB on
    
    auto parser = parseWithKaitai(data);
    ASSERT_NE(parser, nullptr);
    ASSERT_EQ(parser->packets()->size(), 2);
    
    // Check first packet
    auto* pkt1 = parser->packets()->at(0);
    EXPECT_EQ(pkt1->pack_type(), miniware_mdp_m01_t::PACK_TYPE_HEARTBEAT);
    EXPECT_EQ(pkt1->size(), 4);
    
    // Check second packet
    auto* pkt2 = parser->packets()->at(1);
    EXPECT_EQ(pkt2->pack_type(), miniware_mdp_m01_t::PACK_TYPE_RGB);
    EXPECT_EQ(pkt2->size(), 5);
}

// Test error handling with invalid magic bytes
TEST_F(KaitaiParserTest, TestInvalidMagicBytes) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));  // Magic 1
    packet.append(static_cast<char>(0x5B));  // Wrong Magic 2
    packet.append(static_cast<char>(0x22));  // PACK_TYPE_HEARTBEAT
    packet.append(static_cast<char>(0x04));  // Size
    
    // Kaitai will throw a generic exception for validation errors
    EXPECT_THROW({
        parseWithKaitai(packet);
    }, std::exception);
}

// Test wave packet with 4 items per group
TEST_F(KaitaiParserTest, TestWavePacket4ItemsPerGroup) {
    QByteArray packet;
    packet.append(static_cast<char>(0x5A));
    packet.append(static_cast<char>(0x5A));
    packet.append(static_cast<char>(0x12));  // PACK_TYPE_WAVE
    packet.append(static_cast<char>(206));   // Size for 4 points per group
    
    packet.append(static_cast<char>(1));     // Channel 1
    packet.append(static_cast<char>(0));     // Dummy
    
    // Add 10 groups with 4 items each
    for (int g = 0; g < 10; g++) {
        // Timestamp
        uint32_t timestamp = g * 2000;
        packet.append(timestamp & 0xFF);
        packet.append((timestamp >> 8) & 0xFF);
        packet.append((timestamp >> 16) & 0xFF);
        packet.append((timestamp >> 24) & 0xFF);
        
        // 4 items per group
        for (int i = 0; i < 4; i++) {
            uint16_t voltage = 3000 + i * 100;
            uint16_t current = 500 + i * 50;
            packet.append(voltage & 0xFF);
            packet.append((voltage >> 8) & 0xFF);
            packet.append(current & 0xFF);
            packet.append((current >> 8) & 0xFF);
        }
    }
    
    auto parser = parseWithKaitai(packet);
    ASSERT_NE(parser, nullptr);
    ASSERT_EQ(parser->packets()->size(), 1);
    
    auto* pkt = parser->packets()->at(0);
    auto* wave = static_cast<miniware_mdp_m01_t::wave_t*>(pkt->data());
    EXPECT_EQ(wave->channel(), 1);
    EXPECT_EQ(wave->group_size(), 4);
    EXPECT_EQ(wave->groups()->size(), 10);
    
    // Check last group
    auto* lastGroup = wave->groups()->at(9);
    EXPECT_EQ(lastGroup->timestamp(), 18000);
    EXPECT_EQ(lastGroup->items()->size(), 4);
    
    // Check last item
    auto* lastItem = lastGroup->items()->at(3);
    EXPECT_FLOAT_EQ(lastItem->voltage(), 3.3f);
    EXPECT_FLOAT_EQ(lastItem->current(), 0.65f);
}