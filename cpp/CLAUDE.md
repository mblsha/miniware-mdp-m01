# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mixed C++/Python project for handling Miniware MDP (Multi-channel Digital Power) M01/M02 device data. The project provides data logging, parsing, and visualization capabilities for power supply monitoring.

## Repository Structure

- `cpp/` - Qt-based C++ application for real-time data processing
  - `processingdata.h/cpp` - Core data processing class handling serial communication, packet parsing, and real-time charting
  - `machine.h` - Mock header with machine class definition
  - `CMakeLists.txt` - CMake build configuration
  - `tests/` - Unit tests using Google Test framework
  - `build/` - Build directory (git-ignored)
- `py/` - Python tools for data parsing and visualization
  - `mdp_m01/` - Main Python package with binary protocol parser
  - `clickhouse-visualize.py` - Data visualization with ClickHouse integration
  - `miniware-marimo.py` - Interactive Marimo notebook

## Key Technical Details

### Protocol Format
- Binary protocol defined in `py/mdp_m01/mdp.ksy` (Kaitai Struct format)
- Packet types: Synthesize (channel status), Wave (measurements), Address, Frequency
- Support for 6 channels with voltage/current/temperature monitoring
- Checksum validation on all packets
- Default channel value: 0xEE (238) when not specified

### C++ Component
- Requires Qt Framework (QtCore, QtCharts, QtTest for signal testing)
- Mock `machine.h` header file created for compilation
- CMake build system configured with Google Test integration
- Uses Qt's signal/slot mechanism for packet notifications

### Python Component Dependencies
- kaitaistruct - Binary parsing
- clickhouse_connect - Database connectivity
- marimo - Interactive notebooks
- altair, pandas - Data visualization
- pyserial - Serial communication

## Development Commands

### Python Development
```bash
# Navigate to Python directory
cd py

# Run tests (pytest-style)
python -m pytest mdp_m01/test_parser.py

# Run visualization tools
python clickhouse-visualize.py  # Requires ClickHouse at 'clickhouse' host
python miniware-marimo.py       # Starts Marimo notebook server
```

### C++ Development
```bash
# Build the project (from cpp directory)
mkdir -p build && cd build
cmake ..
make -j4

# Run the main application
./mdp_parser

# Run all unit tests
./mdp_parser_test

# Run specific test suites
./mdp_parser_test --gtest_filter="ProcessingDataTest.*"    # Wave packet tests
./mdp_parser_test --gtest_filter="SynthesizePacketTest.*"  # Synthesize packet tests
./mdp_parser_test --gtest_filter="AddressPacketTest.*"     # Address packet tests
./mdp_parser_test --gtest_filter="UpdateChannelTest.*"     # Channel update tests
./mdp_parser_test --gtest_filter="MachinePacketTest.*"     # Machine type tests
./mdp_parser_test --gtest_filter="Err240PacketTest.*"      # Error 240 tests
./mdp_parser_test --gtest_filter="HeartbeatGeneratorTest.*"  # Heartbeat tests
./mdp_parser_test --gtest_filter="SetChannelGeneratorTest.*" # Channel setting tests
./mdp_parser_test --gtest_filter="SetVoltageGeneratorTest.*" # Voltage setting tests
./mdp_parser_test --gtest_filter="SetCurrentGeneratorTest.*" # Current setting tests
./mdp_parser_test --gtest_filter="SetAddressGeneratorTest.*" # Address setting tests
./mdp_parser_test --gtest_filter="SetAllAddressGeneratorTest.*" # Bulk address tests
./mdp_parser_test --gtest_filter="SetIsOutputGeneratorTest.*"   # Output control tests

# Run tests with CTest
ctest --test-dir . -V
```

## Architecture Notes

The project implements a reverse-engineered protocol for Miniware MDP devices based on original source code. Key components:

1. **Serial Communication**: Both C++ and Python components can communicate directly with MDP devices
2. **Data Flow**: Device → Serial → Parser → Storage (ClickHouse) → Visualization
3. **Real-time vs Historical**: C++ for real-time monitoring, Python for historical analysis

## Testing and Test Data Generation

### Unit Testing Infrastructure
- Google Test framework integrated via system package (Homebrew on macOS)
- Test files located in `cpp/tests/` directory
- Each packet type has dedicated test suite with comprehensive coverage

### Generating Dummy Test Data

#### Packet Structure
All packets follow this format:
```
[0x5A][0x5A][Type][Size][Channel][Checksum][Data...]
```
- Headers: Always 0x5A 0x5A
- Size: Total packet size including 6-byte header
- Checksum: XOR of all data bytes (excluding header)

#### Key Packet Types and Sizes

**Device → Host (Incoming) Packets:**
1. **PACK_WAVE (0x12)**: 126 or 206 bytes total
   - 10 groups of time-stamped data
   - 126 bytes = 2 points/group, 206 bytes = 4 points/group
   - Each point: 2 bytes voltage (mV) + 2 bytes current (mA)

2. **PACK_SYNTHESIZE (0x11)**: 156 bytes total (6 + 150 data)
   - 6 channels × 25 bytes per channel
   - Contains: voltage, current, temperature, status flags
   - Important: `waitSynPack` must be false for wave packets to process

3. **PACK_ADDR (0x14)**: 42 bytes total
   - 6 channels × 6 bytes (5 address bytes + 1 frequency offset)
   - Frequency stored as offset from 2400 MHz

4. **PACK_UPDAT_CH (0x15)**: 7 bytes total
   - Single byte payload with target channel number

5. **PACK_MACHINE (0x16)**: 7 bytes total
   - Single byte payload: 0x10 (M01 with LCD) or 0x11 (M02 without LCD)

6. **PACK_ERR_240 (0x23)**: 6 bytes total
   - No data payload, just notification packet

**Host → Device (Outgoing) Packets:**
7. **PACK_SET_CH (0x1C)**: 6 bytes total
   - No data payload, channel in header field

8. **PACK_SET_V (0x1D)**: 10 bytes total
   - 2 bytes voltage (mV) + 2 bytes current (mA), little-endian

9. **PACK_SET_I (0x1E)**: 10 bytes total
   - Same format as PACK_SET_V (both send voltage and current)

10. **PACK_SET_ADDR (0x1B)**: 12 bytes total
    - 5 address bytes + 1 frequency offset byte

11. **PACK_SET_ALL_ADDR (0x1F)**: 42 bytes total
    - 6 channels × 6 bytes, bulk address update

12. **PACK_SET_ISOUTPUT (0x17)**: 7 bytes total
    - Single byte payload: 1 (ON) or 0 (OFF)

13. **PACK_HEARTBEAT (0x22)**: 6 bytes total
    - No data payload, keepalive packet

#### Test Data Considerations
- Multi-byte values use little-endian encoding
- processingData initializes `waitSynPack = true`, requiring synthesize packet first
- Wave processing has internal state (`testStartTime`, `StartIndex`) affecting behavior
- Channel pointer increments through MDP[0] to MDP[5] during parsing
- The `slotSendNowCh` function sends PACK_SET_CH packet twice (duplicate in code)
- Empty addresses are detected when all 5 address bytes are 0x00
- Frequency values are in MHz, stored as offset from 2400 MHz base (range: 0-83)

### Example Test Patterns
```cpp
// Create valid checksum packet
QByteArray packet;
packet.append(0x5A); packet.append(0x5A);
packet.append(type); packet.append(size);
packet.append(channel);
uint8_t checksum = 0;
for (auto byte : data) checksum ^= byte;
packet.append(checksum);
packet.append(data);

// Generate test voltage/current (little-endian)
uint16_t voltage_mv = 3300; // 3.3V
data.append(voltage_mv & 0xFF);
data.append((voltage_mv >> 8) & 0xFF);
```

## Important Considerations

- The C++ code references Qt's deprecated features and may need updates for newer Qt versions
- Python code assumes ClickHouse is available at hostname 'clickhouse'
- Protocol changes require regenerating parser from `mdp.ksy` using Kaitai Struct compiler
- Test execution requires Qt event loop (QCoreApplication) for signal/slot mechanism
- Google Test's gtest_main provides the main() function - don't add it to test files
- Use QSignalSpy from QtTest to verify Qt signal emissions in tests
- All packet checksums are calculated as XOR of data bytes only (excluding 6-byte header)