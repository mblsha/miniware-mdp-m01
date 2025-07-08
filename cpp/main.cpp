#include <QCoreApplication>
#include <QDebug>
#include "processingdata.h"

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);
    
    qDebug() << "MDP Parser Test Application";
    
    // Create processingData instance
    processingData processor;
    
    // Test basic functionality
    qDebug() << "Created processingData instance successfully";
    qDebug() << "Number of channels: 6";
    qDebug() << "Current channel:" << processor.now_ch;
    
    // Test creating a simple packet (heartbeat)
    QObject::connect(&processor, &processingData::signalsSendPack, 
                     [](QByteArray data) {
                         qDebug() << "Packet to send:" << data.toHex(' ');
                     });
    
    // Send a test heartbeat packet
    processor.slotHeartBeat();
    
    // Test parsing a synthesize packet (minimal example)
    // Format: 5A 5A [type] [size] [ch] [checksum] [data...]
    QByteArray testPacket;
    testPacket.append(static_cast<char>(0x5A));  // Header 1
    testPacket.append(static_cast<char>(0x5A));  // Header 2
    testPacket.append(static_cast<char>(0x11));  // PACK_SYNTHESIZE
    testPacket.append(static_cast<char>(0x06));  // Size (header size)
    testPacket.append(static_cast<char>(0x00));  // Channel 0
    testPacket.append(static_cast<char>(0x00));  // Checksum (will be validated)
    
    qDebug() << "\nTesting packet parsing...";
    processor.slotDisposeRawPack(testPacket);
    
    qDebug() << "\nTest completed. Use Ctrl+C to exit.";
    
    // For unit tests, we would normally not run the event loop
    // but for this minimal example, we'll just exit immediately
    return 0;
    
    // Uncomment to run event loop if needed for testing
    // return app.exec();
}