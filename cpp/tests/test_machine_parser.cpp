#include <gtest/gtest.h>
#include <QCoreApplication>
#include <QByteArray>
#include <QDebug>
#include <QSignalSpy>
#include <cstring>
#include "../processingdata.h"

class MachinePacketTest : public ::testing::Test {
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
    
    // Helper to create machine type data
    QByteArray createMachineData(uint8_t machineType) {
        QByteArray data;
        data.append(static_cast<char>(machineType));
        return data;
    }
};

// Static members initialization
int MachinePacketTest::argc = 0;
char** MachinePacketTest::argv = nullptr;
QCoreApplication* MachinePacketTest::app = nullptr;

// Test PACK_MACHINE parsing with haveLcd type (M01)
TEST_F(MachinePacketTest, TestMachineTypeHaveLcd) {
    // Create signal spy to monitor machine type signal
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Verify initial state
    EXPECT_EQ(processor->machineType, processingData::noType);
    
    // Create packet for M01 (haveLcd)
    QByteArray data = createMachineData(processingData::haveLcd);
    QByteArray packet = createPacket(processingData::PACK_MACHINE, 0, data);
    
    // Verify packet size (6 header + 1 data = 7 bytes)
    EXPECT_EQ(packet.size(), 7);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify machine type was set correctly
    EXPECT_EQ(processor->machineType, processingData::haveLcd);
    
    // Verify signal was emitted
    EXPECT_EQ(machineSpy.count(), 1);
}

// Test PACK_MACHINE parsing with noLcd type (M02)
TEST_F(MachinePacketTest, TestMachineTypeNoLcd) {
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Create packet for M02 (noLcd)
    QByteArray data = createMachineData(processingData::noLcd);
    QByteArray packet = createPacket(processingData::PACK_MACHINE, 0, data);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Verify machine type was set correctly
    EXPECT_EQ(processor->machineType, processingData::noLcd);
    
    // Verify signal was emitted
    EXPECT_EQ(machineSpy.count(), 1);
}

// Test unknown machine type (should default to noLcd)
TEST_F(MachinePacketTest, TestUnknownMachineType) {
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Create packet with unknown type (0xFF)
    QByteArray data = createMachineData(0xFF);
    QByteArray packet = createPacket(processingData::PACK_MACHINE, 0, data);
    
    // Process the packet
    processor->slotDisposeRawPack(packet);
    
    // Unknown types should be set to noLcd
    EXPECT_EQ(processor->machineType, processingData::noLcd);
    
    // Signal should still be emitted
    EXPECT_EQ(machineSpy.count(), 1);
}

// Test invalid checksum handling
TEST_F(MachinePacketTest, TestInvalidChecksum) {
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Store initial machine type
    processingData::machine_type initialType = processor->machineType;
    
    QByteArray data = createMachineData(processingData::haveLcd);
    QByteArray packet = createPacket(processingData::PACK_MACHINE, 0, data);
    
    // Corrupt the checksum
    packet[5] = packet[5] ^ 0xFF;
    
    // Process the packet - should be rejected
    testing::internal::CaptureStderr();
    processor->slotDisposeRawPack(packet);
    std::string output = testing::internal::GetCapturedStderr();
    
    // Should have error message
    EXPECT_NE(output.find("pack_error"), std::string::npos);
    
    // Machine type should not change
    EXPECT_EQ(processor->machineType, initialType);
    
    // Signal should not be emitted
    EXPECT_EQ(machineSpy.count(), 0);
}

// Test machine type changes
TEST_F(MachinePacketTest, TestMachineTypeChanges) {
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Start with M01
    QByteArray data1 = createMachineData(processingData::haveLcd);
    QByteArray packet1 = createPacket(processingData::PACK_MACHINE, 0, data1);
    processor->slotDisposeRawPack(packet1);
    
    EXPECT_EQ(processor->machineType, processingData::haveLcd);
    EXPECT_EQ(machineSpy.count(), 1);
    
    // Change to M02
    QByteArray data2 = createMachineData(processingData::noLcd);
    QByteArray packet2 = createPacket(processingData::PACK_MACHINE, 0, data2);
    processor->slotDisposeRawPack(packet2);
    
    EXPECT_EQ(processor->machineType, processingData::noLcd);
    EXPECT_EQ(machineSpy.count(), 2);
    
    // Change back to M01
    QByteArray data3 = createMachineData(processingData::haveLcd);
    QByteArray packet3 = createPacket(processingData::PACK_MACHINE, 0, data3);
    processor->slotDisposeRawPack(packet3);
    
    EXPECT_EQ(processor->machineType, processingData::haveLcd);
    EXPECT_EQ(machineSpy.count(), 3);
}

// Test data generation
TEST_F(MachinePacketTest, TestDataGeneration) {
    // Test haveLcd data
    QByteArray dataM01 = createMachineData(processingData::haveLcd);
    EXPECT_EQ(dataM01.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(dataM01[0]), processingData::haveLcd);
    
    // Test noLcd data
    QByteArray dataM02 = createMachineData(processingData::noLcd);
    EXPECT_EQ(dataM02.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(dataM02[0]), processingData::noLcd);
    
    // Test noType data (initial state)
    QByteArray dataNoType = createMachineData(processingData::noType);
    EXPECT_EQ(dataNoType.size(), 1);
    EXPECT_EQ(static_cast<uint8_t>(dataNoType[0]), processingData::noType);
}

// Test packet structure
TEST_F(MachinePacketTest, TestPacketStructure) {
    QByteArray data = createMachineData(processingData::haveLcd);
    QByteArray packet = createPacket(processingData::PACK_MACHINE, 3, data);
    
    // Verify packet structure
    EXPECT_EQ(static_cast<uint8_t>(packet[0]), 0x5A);  // Header 1
    EXPECT_EQ(static_cast<uint8_t>(packet[1]), 0x5A);  // Header 2
    EXPECT_EQ(static_cast<uint8_t>(packet[2]), processingData::PACK_MACHINE);  // Type
    EXPECT_EQ(static_cast<uint8_t>(packet[3]), 7);     // Size (6 + 1)
    EXPECT_EQ(static_cast<uint8_t>(packet[4]), 3);     // Channel in header
    // packet[5] is checksum
    EXPECT_EQ(static_cast<uint8_t>(packet[6]), processingData::haveLcd);  // Machine type
}

// Test multiple packets with different channels
TEST_F(MachinePacketTest, TestDifferentChannels) {
    QSignalSpy machineSpy(processor, &processingData::signalSetMachine);
    
    // Machine type should be global, not per-channel
    // Test with different channel numbers
    for (int ch = 0; ch < 6; ch++) {
        QByteArray data = createMachineData(processingData::haveLcd);
        QByteArray packet = createPacket(processingData::PACK_MACHINE, ch, data);
        processor->slotDisposeRawPack(packet);
        
        // Machine type should always be haveLcd regardless of channel
        EXPECT_EQ(processor->machineType, processingData::haveLcd);
    }
    
    // Should have emitted signal for each packet
    EXPECT_EQ(machineSpy.count(), 6);
}