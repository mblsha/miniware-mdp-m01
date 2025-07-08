#include "miniware_mdp_m01.h"
#include <kaitai/kaitaistream.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <QByteArray>

// Function to parse packets using Kaitai Struct
void parsePacketsWithKaitai(const QByteArray& data) {
    try {
        // Convert QByteArray to string stream
        std::string dataStr(data.constData(), data.size());
        std::istringstream iss(dataStr);
        
        // Create Kaitai stream
        kaitai::kstream ks(&iss);
        
        // Parse the data
        miniware_mdp_m01_t parser(&ks);
        
        std::cout << "Found " << parser.packets()->size() << " packets\n";
        
        // Process each packet
        for (size_t i = 0; i < parser.packets()->size(); i++) {
            miniware_mdp_m01_t::packet_t* packet = parser.packets()->at(i);
            
            std::cout << "Packet " << i << ":\n";
            std::cout << "  Type: 0x" << std::hex << static_cast<int>(packet->pack_type()) 
                      << " (" << getPacketTypeName(packet->pack_type()) << ")\n";
            std::cout << "  Size: " << std::dec << static_cast<int>(packet->size()) << "\n";
            
            // Handle specific packet types
            switch (packet->pack_type()) {
                case miniware_mdp_m01_t::PACK_TYPE_SYNTHESIZE: {
                    miniware_mdp_m01_t::synthesize_t* syn = 
                        static_cast<miniware_mdp_m01_t::synthesize_t*>(packet->data());
                    
                    std::cout << "  Channel: " << static_cast<int>(syn->channel()) << "\n";
                    std::cout << "  Channels data:\n";
                    
                    for (size_t ch = 0; ch < syn->channels()->size(); ch++) {
                        auto* chan = syn->channels()->at(ch);
                        std::cout << "    Channel " << static_cast<int>(chan->num()) << ":\n";
                        std::cout << "      Output: " << chan->out_voltage() << "V, " 
                                  << chan->out_current() << "A\n";
                        std::cout << "      Input: " << chan->in_voltage() << "V, " 
                                  << chan->in_current() << "A\n";
                        std::cout << "      Set: " << chan->set_voltage() << "V, " 
                                  << chan->set_current() << "A\n";
                        std::cout << "      Temperature: " << chan->temperature() << "°C\n";
                        std::cout << "      Online: " << (chan->online() ? "Yes" : "No") << "\n";
                        std::cout << "      Type: " << getMachineTypeName(chan->type()) << "\n";
                    }
                    break;
                }
                
                case miniware_mdp_m01_t::PACK_TYPE_WAVE: {
                    miniware_mdp_m01_t::wave_t* wave = 
                        static_cast<miniware_mdp_m01_t::wave_t*>(packet->data());
                    
                    std::cout << "  Channel: " << static_cast<int>(wave->channel()) << "\n";
                    std::cout << "  Group size: " << wave->group_size() << "\n";
                    std::cout << "  Groups:\n";
                    
                    for (size_t g = 0; g < wave->groups()->size() && g < 3; g++) {
                        auto* group = wave->groups()->at(g);
                        std::cout << "    Group " << g << " (timestamp: " 
                                  << group->timestamp() << "):\n";
                        
                        for (size_t i = 0; i < group->items()->size(); i++) {
                            auto* item = group->items()->at(i);
                            std::cout << "      Item " << i << ": " 
                                      << item->voltage() << "V, " 
                                      << item->current() << "A\n";
                        }
                    }
                    
                    if (wave->groups()->size() > 3) {
                        std::cout << "    ... (" << wave->groups()->size() - 3 
                                  << " more groups)\n";
                    }
                    break;
                }
                
                default:
                    std::cout << "  (Data parsing not implemented for this type)\n";
                    break;
            }
            
            std::cout << "\n";
        }
        
    } catch (const std::exception& e) {
        std::cerr << "Error parsing with Kaitai: " << e.what() << "\n";
    }
}

// Helper function to get packet type name
const char* getPacketTypeName(miniware_mdp_m01_t::pack_type_t type) {
    switch (type) {
        case miniware_mdp_m01_t::PACK_TYPE_SYNTHESIZE: return "SYNTHESIZE";
        case miniware_mdp_m01_t::PACK_TYPE_WAVE: return "WAVE";
        case miniware_mdp_m01_t::PACK_TYPE_ADDR: return "ADDR";
        case miniware_mdp_m01_t::PACK_TYPE_UPDAT_CH: return "UPDAT_CH";
        case miniware_mdp_m01_t::PACK_TYPE_MACHINE: return "MACHINE";
        case miniware_mdp_m01_t::PACK_TYPE_SET_ISOUTPUT: return "SET_ISOUTPUT";
        case miniware_mdp_m01_t::PACK_TYPE_GET_ADDR: return "GET_ADDR";
        case miniware_mdp_m01_t::PACK_TYPE_SET_ADDR: return "SET_ADDR";
        case miniware_mdp_m01_t::PACK_TYPE_SET_CH: return "SET_CH";
        case miniware_mdp_m01_t::PACK_TYPE_SET_V: return "SET_V";
        case miniware_mdp_m01_t::PACK_TYPE_SET_I: return "SET_I";
        case miniware_mdp_m01_t::PACK_TYPE_SET_ALL_ADDR: return "SET_ALL_ADDR";
        case miniware_mdp_m01_t::PACK_TYPE_START_AUTO_MATCH: return "START_AUTO_MATCH";
        case miniware_mdp_m01_t::PACK_TYPE_STOP_AUTO_MATCH: return "STOP_AUTO_MATCH";
        case miniware_mdp_m01_t::PACK_TYPE_RESET_TO_DFU: return "RESET_TO_DFU";
        case miniware_mdp_m01_t::PACK_TYPE_RGB: return "RGB";
        case miniware_mdp_m01_t::PACK_TYPE_GET_MACHINE: return "GET_MACHINE";
        case miniware_mdp_m01_t::PACK_TYPE_HEARTBEAT: return "HEARTBEAT";
        case miniware_mdp_m01_t::PACK_TYPE_ERR_240: return "ERR_240";
        default: return "UNKNOWN";
    }
}

// Helper function to get machine type name
const char* getMachineTypeName(miniware_mdp_m01_t::machine_type_t type) {
    switch (type) {
        case miniware_mdp_m01_t::MACHINE_TYPE_NODE: return "NODE";
        case miniware_mdp_m01_t::MACHINE_TYPE_P905: return "P905";
        case miniware_mdp_m01_t::MACHINE_TYPE_P906: return "P906";
        case miniware_mdp_m01_t::MACHINE_TYPE_L1060: return "L1060";
        default: return "UNKNOWN";
    }
}

// Example of creating a test packet and parsing it
void testKaitaiParser() {
    std::cout << "=== Testing Kaitai Parser ===\n\n";
    
    // Create a simple heartbeat packet
    QByteArray heartbeatPacket;
    heartbeatPacket.append(static_cast<char>(0x5A));  // Magic 1
    heartbeatPacket.append(static_cast<char>(0x5A));  // Magic 2
    heartbeatPacket.append(static_cast<char>(0x22));  // PACK_TYPE_HEARTBEAT
    heartbeatPacket.append(static_cast<char>(0x04));  // Size (just header, no data)
    
    std::cout << "Parsing heartbeat packet:\n";
    parsePacketsWithKaitai(heartbeatPacket);
    
    // Create a synthesize packet with dummy data
    QByteArray synthesizePacket;
    synthesizePacket.append(static_cast<char>(0x5A));  // Magic 1
    synthesizePacket.append(static_cast<char>(0x5A));  // Magic 2
    synthesizePacket.append(static_cast<char>(0x11));  // PACK_TYPE_SYNTHESIZE
    synthesizePacket.append(static_cast<char>(156));   // Size (6 header + 150 data)
    
    // Add synthesize data
    synthesizePacket.append(static_cast<char>(0));     // Channel
    synthesizePacket.append(static_cast<char>(0));     // Dummy
    
    // Add 6 channels of data (25 bytes each)
    for (int ch = 0; ch < 6; ch++) {
        synthesizePacket.append(static_cast<char>(ch));              // Channel number
        synthesizePacket.append(static_cast<char>(0x10)); synthesizePacket.append(static_cast<char>(0x0E)); // Out voltage (3600mV)
        synthesizePacket.append(static_cast<char>(0xE8)); synthesizePacket.append(static_cast<char>(0x03)); // Out current (1000mA)
        synthesizePacket.append(static_cast<char>(0x98)); synthesizePacket.append(static_cast<char>(0x3A)); // In voltage (15000mV)
        synthesizePacket.append(static_cast<char>(0xDC)); synthesizePacket.append(static_cast<char>(0x05)); // In current (1500mA)
        synthesizePacket.append(static_cast<char>(0x10)); synthesizePacket.append(static_cast<char>(0x0E)); // Set voltage (3600mV)
        synthesizePacket.append(static_cast<char>(0xE8)); synthesizePacket.append(static_cast<char>(0x03)); // Set current (1000mA)
        synthesizePacket.append(static_cast<char>(0x19)); synthesizePacket.append(static_cast<char>(0x01)); // Temperature (281 = 28.1°C)
        synthesizePacket.append(static_cast<char>(1));    // Online
        synthesizePacket.append(static_cast<char>(2));    // Type (P906)
        synthesizePacket.append(static_cast<char>(0));    // Lock
        synthesizePacket.append(static_cast<char>(1));    // Status (CC)
        synthesizePacket.append(static_cast<char>(1));    // Output on
        synthesizePacket.append(static_cast<char>(0xFF)); // Color R
        synthesizePacket.append(static_cast<char>(0xA0)); // Color G
        synthesizePacket.append(static_cast<char>(0x00)); // Color B
        synthesizePacket.append(static_cast<char>(0));    // Error
        synthesizePacket.append(static_cast<char>(0));    // End
    }
    
    std::cout << "\nParsing synthesize packet:\n";
    parsePacketsWithKaitai(synthesizePacket);
}

// Integration with processingData class
#include "processingdata.h"

void integrateKaitaiWithProcessingData(processingData* processor, const QByteArray& rawData) {
    std::cout << "\n=== Integrating Kaitai Parser with processingData ===\n";
    
    // Use Kaitai to parse the packet structure
    try {
        std::string dataStr(rawData.constData(), rawData.size());
        std::istringstream iss(dataStr);
        kaitai::kstream ks(&iss);
        miniware_mdp_m01_t parser(&ks);
        
        // Process packets and compare with existing parser
        for (size_t i = 0; i < parser.packets()->size(); i++) {
            miniware_mdp_m01_t::packet_t* packet = parser.packets()->at(i);
            
            std::cout << "Kaitai found packet type: 0x" << std::hex 
                      << static_cast<int>(packet->pack_type()) << std::dec << "\n";
            
            // You could dispatch to processingData methods here based on packet type
            // For example:
            // if (packet->pack_type() == miniware_mdp_m01_t::PACK_TYPE_SYNTHESIZE) {
            //     // Extract data and call processor->processSynthesizePack()
            // }
        }
    } catch (const std::exception& e) {
        std::cerr << "Kaitai parsing error: " << e.what() << "\n";
    }
}