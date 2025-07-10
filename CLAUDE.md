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
- Binary protocol defined in `cpp/mdp.ksy` (Kaitai Struct format)
- Links:
  - [MDP Protocol Overview](/cpp/MDP_PROTOCOL_OVERVIEW.md)
  - [Kaitai Struct Protocol Definition](/cpp/mdp.ksy)
- Incoming packet types fully implemented:
  - Synthesize (0x11): Channel status with voltage/current/temperature
  - Wave (0x12): Time-series measurements
  - Address (0x13): Device addresses and frequencies
  - Update Channel (0x14): Channel switching command
  - Machine (0x15): Device type identification
  - Error 240 (0x23): Error notification
- Support for 6 channels with voltage/current/temperature monitoring
- Checksum validation on all packets (XOR of data bytes)
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

## Kaitai Cross-Validation Testing

### Overview
The C++ tests include Kaitai Struct cross-validation to ensure the Kaitai protocol definition (`cpp/mdp.ksy`) produces semantically identical parsing results to the reference C++ parser. This validates the accuracy of the protocol specification.

### Implementation Pattern
Each parser test file includes:
```cpp
// Helper to parse QByteArray with Kaitai
std::unique_ptr<miniware_mdp_m01_t> parseWithKaitai(const QByteArray& data) {
    std::string dataStr(data.constData(), data.size());
    std::istringstream iss(dataStr);
    auto ks = std::make_unique<kaitai::kstream>(&iss);
    return std::make_unique<miniware_mdp_m01_t>(ks.get());
}
```

### Key Validation Points

1. **Packet Type Enum Values**: The C++ code uses sequential enum values starting from 0x11. The Kaitai definition must match these exact values (not arbitrary hex values).

2. **Address Byte Order**: Address packets store bytes in reverse order in the packet compared to the machine struct:
   - Packet: `[addr4][addr3][addr2][addr1][addr0]`
   - Machine struct: `address[0..4]` in normal order

3. **Temperature Representation**: Kaitai stores temperature as `raw_value / 10.0`, while C++ stores the raw value directly.

4. **Machine Type Mapping**: Values differ between packet and internal representation:
   - `0x10` (haveLcd) → M01 with LCD
   - `0x11` (noLcd) → M02 without LCD
   - Unknown values default to noLcd

5. **Empty Packet Handling**: ERR_240 uses the `empty_packet` type with only channel/dummy bytes, no data payload.

### Regenerating Kaitai Code
When modifying `mdp.ksy`:
```bash
cd cpp
kaitai-struct-compiler -t cpp_stl --outdir build/kaitai_generated mdp.ksy
```

### Running Cross-Validation Tests
All parser tests include Kaitai validation:
```bash
./mdp_parser_test --gtest_filter="*PacketTest.*"
```

### Generator Packet Validation

All generator packet types now include Kaitai cross-validation to ensure the protocol specification matches the C++ implementation. The validation pattern has been applied to all 13 generator test files:

#### Empty Packet Generators (6 bytes total)
- `test_heartbeat_generator.cpp` - PACK_HEARTBEAT (0x22)
- `test_set_ch_generator.cpp` - PACK_SET_CH (0x19)
- `test_get_addr_generator.cpp` - PACK_GET_ADDR (0x17)
- `test_get_machine_generator.cpp` - PACK_GET_MACHINE (0x21)
- `test_reset_to_dfu_generator.cpp` - PACK_RESET_TO_DFU (0x1F)
- `test_start_auto_match_generator.cpp` - PACK_START_AUTO_MATCH (0x1D)
- `test_stop_auto_match_generator.cpp` - PACK_STOP_AUTO_MATCH (0x1E)

#### Data Packet Generators
- `test_set_v_generator.cpp` - PACK_SET_V (0x1A): 10 bytes, voltage/current data
- `test_set_i_generator.cpp` - PACK_SET_I (0x1B): 10 bytes, same format as SET_V
- `test_set_addr_generator.cpp` - PACK_SET_ADDR (0x18): 12 bytes, single address
- `test_set_all_addr_generator.cpp` - PACK_SET_ALL_ADDR (0x1C): 42 bytes, 6 addresses
- `test_set_isoutput_generator.cpp` - PACK_SET_ISOUTPUT (0x16): 7 bytes, on/off state
- `test_rgb_generator.cpp` - PACK_RGB (0x20): 7 bytes, RGB on/off control

Each test validates:
- Packet type matches expected enum value
- Packet size is correct
- Data can be cast to appropriate Kaitai type
- All fields match between C++ generator and Kaitai parser
- Calculated fields (e.g., `is_output_on()`, `frequency()`) work correctly

## Web UI Development

### Key Commands
```bash
# Navigate to web UI directory
cd mdp-webui

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run specific test file
npm test -- tests/unit/stores/channels.test.js

# Check code coverage
npm run coverage
```

### Critical Testing Insights

#### State Management Anti-Patterns
**Problem**: Singleton stores (like `serialConnection` and `channelStore`) maintain state between tests, causing failures when tests expect clean initial state.

**Solution**: Always implement and call `reset()` methods in test setup:
```javascript
// In store implementation
function reset() {
  channels.set(getInitialState());
  activeChannel.set(0);
  waitingSynthesize.set(true);
}

// In test beforeEach
beforeEach(async () => {
  if (get(serialConnection.status) !== 'disconnected') {
    await serialConnection.disconnect();
  }
  channelStore.reset();
});
```

#### Kaitai-JS Integration Challenges
**Critical Property Mapping**: The Kaitai-generated JavaScript parser uses different property names than the original C++ implementation:

```javascript
// WRONG (old decoder assumptions)
voltage: ch.voltage / 1000
current: ch.current / 1000
temperature: ch.temperature / 10
isOutput: ch.isOutput
machineType: ch.machineType

// CORRECT (Kaitai JS properties)
voltage: ch.outVoltage        // Already converted to V
current: ch.outCurrent        // Already converted to A  
temperature: ch.temperature   // Already converted to °C
isOutput: ch.outputOn !== 0
machineType: ch.type
```

**Key Differences**:
- Kaitai performs unit conversions automatically (mV→V, mA→A, raw→°C)
- Field names follow Kaitai naming conventions vs C++ style
- Nested structures use `items` not `datas` for wave packet groups
- Enum values must match exactly between implementations

#### Timer Management in Tests
**Problem**: `setInterval` heartbeat timers cause infinite loops in Vitest with `vi.runAllTimersAsync()`.

**Solution**: Use bounded timer advancement and proper cleanup:
```javascript
// Replace infinite timer runners
await vi.advanceTimersByTimeAsync(10);  // Not runAllTimersAsync()

// Ensure cleanup
afterEach(async () => {
  serialConnection.stopHeartbeat();
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

#### Mock Data Structural Accuracy
**Critical**: Test mocks must exactly match real protocol structure. The Synthesize packet structure is 25 bytes per channel:
```javascript
// Correct Kaitai structure (25 bytes per channel)
data.push(i);                    // num (channel)
data.push(outVoltage & 0xFF);    // outVoltageRaw (LE)
data.push((outVoltage >> 8));
data.push(outCurrent & 0xFF);    // outCurrentRaw (LE)
data.push((outCurrent >> 8));
// ... inVoltage, inCurrent, setVoltage, setCurrent, tempRaw
data.push(ch.online || 0);       // online
data.push(ch.machineType || 2);  // type (P906=2, L1060=3)
data.push(0);                    // lock
data.push(ch.mode || 0);         // statusLoad/statusPsu
data.push(ch.isOutput || 0);     // outputOn
data.push(0, 0, 0);             // color (3 bytes)
data.push(0);                    // error
data.push(0xFF);                 // end marker
```

#### Store API Design Patterns
**Best Practice**: Export both writable stores for internal use and derived stores for components:
```javascript
return {
  channels,                    // Writable for internal updates
  activeChannel: derived(...), // Read-only for components
  activeChannelData,          // Computed properties
  recordingChannels,          // Filtered views
  reset                       // Test utility
};
```

### Test Categories and Status
- **Integration Tests**: 12 tests fixed (state bleeding resolved)
- **Unit Tests**: 41 tests fixed (decoder properties, timer management)
- **Component Tests**: 78 remaining failures (similar property mapping issues)
- **Serial Connection Tests**: 13/19 passing (68% success rate) with complete readLoop mock

## Advanced Testing Architecture: Serial Connection Mock Design

### Critical Issue: Infinite ReadLoop vs Test Environment
**Problem**: The production `SerialConnection` uses an infinite `readLoop()` that continuously reads from the serial port. This pattern is incompatible with test environments using fake timers and causes:
- Tests timing out after 5000ms
- `await serialConnection.connect()` hanging indefinitely
- MockReader promises never resolving with `vi.useFakeTimers()`

### Solution: Test-Specific SerialConnection Architecture
**Strategy**: Create a separate `TestSerialConnection` class that replaces infinite async loops with controlled, synchronous processing.

#### Key Design Principles
1. **Eliminate Infinite Loops**: Replace `while(true)` readLoop with bounded processing
2. **Remove Timer Dependencies**: Eliminate `setTimeout()` delays in MockSerialPort
3. **Controlled Packet Processing**: Trigger processing explicitly rather than continuously
4. **Proper Test Isolation**: Clear handlers and state between tests

#### TestSerialConnection Implementation Pattern
```javascript
// WRONG: Production pattern (infinite loop)
async readLoop() {
  while (this.port && this.reader) {
    const { value, done } = await this.reader.read(); // Hangs in tests
    // Process data...
  }
}

// CORRECT: Test pattern (bounded processing)
async processAvailableData() {
  const buffer = [];
  let readAttempts = 0;
  while (readAttempts < 10) { // Bounded loop
    const { value, done } = await this.reader.read();
    if (done || !value?.length) break;
    buffer.push(...value);
    readAttempts++;
  }
  if (buffer.length > 0) {
    this.processBuffer(buffer);
  }
}

// Explicit trigger for tests
async triggerPacketProcessing() {
  await this.processAvailableData();
}
```

#### MockReader Optimization for Test Environment
```javascript
// WRONG: Hangs with fake timers
async read() {
  return new Promise((resolve) => {
    this.pendingRead = resolve; // Never resolves
  });
}

// CORRECT: Immediate resolution
async read() {
  if (this.dataQueue.length > 0) {
    return { value: this.dataQueue.shift(), done: false };
  }
  // Always return immediately for test environment
  return Promise.resolve({ value: new Uint8Array([]), done: false });
}
```

#### MockSerialPort Timer Elimination
```javascript
// WRONG: setTimeout blocks with fake timers
async open(config) {
  await new Promise(resolve => setTimeout(resolve, 0)); // Hangs
}

// CORRECT: Immediate completion
async open(config) {
  this.opened = true;
  this.config = config;
  // No delays needed in test environment
}
```

#### Test Pattern for Packet Processing
```javascript
// Setup
const serialConnection = new TestSerialConnection();
await serialConnection.connect();

// Register handlers
const receivedPackets = [];
serialConnection.registerPacketHandler(0x15, (packet) => {
  receivedPackets.push(packet);
});

// Simulate data and trigger processing
mockPort.simulateData(createMachinePacket(0x10));
await serialConnection.triggerPacketProcessing();

// Verify results
expect(receivedPackets.length).toBe(1);
```

#### Multiple Handler Support Pattern
```javascript
// Support multiple handlers per packet type
registerPacketHandler(packetType, handler) {
  if (!this.packetHandlers.has(packetType)) {
    this.packetHandlers.set(packetType, []);
  }
  this.packetHandlers.get(packetType).push(handler);
}

handlePacket(packet) {
  const packetType = packet[2];
  const handlers = this.packetHandlers.get(packetType);
  if (handlers && Array.isArray(handlers)) {
    handlers.forEach(handler => handler(packet));
  }
}
```

#### Essential Test Cleanup Pattern
```javascript
afterEach(async () => {
  if (serialConnection) {
    serialConnection.stopHeartbeat();
    serialConnection.clearPacketHandlers(); // Prevent test interference
    await serialConnection.disconnect();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

### Success Metrics
**Before Complete ReadLoop Mock**:
- Serial tests: 0/19 passing (0% success rate)
- All tests timeout after 5000ms
- Infinite hanging in test environment

**After Complete ReadLoop Mock**:
- Serial tests: 13/19 passing (68% success rate)
- Zero timeouts - all tests complete in ~800ms
- Reliable test infrastructure for future development

### Key Architectural Insight
The fundamental issue was **architectural incompatibility**: production code optimized for real-time streaming vs test environment optimized for deterministic, controllable execution. The solution required creating a **test-specific architecture** that maintains the same API while eliminating problematic patterns.

This pattern applies to any component that uses:
- Infinite async loops
- Continuous timers
- Event-driven streaming
- Real-time data processing

The component tests likely need similar attention to property name mapping and mock data accuracy.

### Critical Test Suite Debugging Methodology

#### Root Cause Analysis Framework
When facing widespread test failures (78+ failing tests), use this systematic approach:

1. **Environment Issues First** (High Impact, Easy Fix)
   - Missing browser APIs (Canvas, Web Serial, etc.)
   - Incorrect mock setups causing crashes
   - Build system configuration problems

2. **Application Logic Bugs** (Medium Impact, Medium Fix)  
   - Packet parsing logic errors
   - State management inconsistencies
   - Serial communication buffer handling

3. **Test Logic Bugs** (Lower Impact, Harder to Diagnose)
   - Async/timing issues and race conditions
   - Incorrect test assertions and setup
   - Helper function argument mismatches

#### Environmental Fixes with High ROI

**Canvas API Error**: The most critical fix was installing the `canvas` package as a dev dependency. This single change resolved crashes in all chart-related components and tests.

```bash
npm install -D canvas --legacy-peer-deps
```

**Component Mocking Strategy**: Create actual minimal Svelte components instead of trying to mock with objects or classes:

```javascript
// ❌ WRONG - Complex mock objects that break
vi.mock('../../src/lib/components/WaveformChart.svelte', () => ({
  default: class MockWaveformChart { constructor(options) { this.options = options; } }
}));

// ✅ CORRECT - Simple mock Svelte component  
vi.mock('../../src/lib/components/WaveformChart.svelte', () => ({
  default: vi.importActual('../mocks/components/MockWaveformChart.svelte')
}));
```

#### Vi.Mock Hoisting Anti-Patterns

**Problem**: Variable access before initialization in mock factories.

**Solution**: Use `vi.hoisted()` for variables needed in mocks:

```javascript
// ❌ WRONG - Variables accessed before initialization
const mockConnect = vi.fn();
vi.mock('../../src/lib/serial.js', () => ({
  serialConnection: { connect: mockConnect } // ReferenceError!
}));

// ✅ CORRECT - Hoisted variables
const mockConnect = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/serial.js', () => ({
  serialConnection: { connect: mockConnect }
}));
```

#### Packet Processing Debug Patterns

**Critical Insight**: Mock packet structure must exactly match the real Kaitai parser output, including property names and data types.

```javascript
// Common failure pattern: Mock structure mismatch
// Test expects: packet.data.groups[0].items[0].voltage
// Mock provides: packet.data.datas[0].points[0].voltage_raw

// Fix: Match exact Kaitai property names and conversions
const mockParser = {
  groups: [{
    timestamp: 100,  // Not 0 - tests expect > 0
    items: [{        // Not "points" 
      voltage: 3.3,  // Already converted, not voltage_raw
      current: 0.5   // Already converted, not current_raw
    }]
  }]
};
```

#### Test Failure Triage Priority

1. **Crashes/Cannot Run** (Priority 1): Fix environment and mocking first
2. **Logic Errors** (Priority 2): Fix packet processing and state management  
3. **Assertion Failures** (Priority 3): Fix test expectations and timing
4. **Edge Cases** (Priority 4): Handle boundary conditions and error states

#### Debugging Output Analysis

**Key Pattern**: Look for the most frequent error types first:
- `HTMLCanvasElement.prototype.getContext` → Canvas package needed
- `vi.mock factory` errors → Hoisting issues
- `Cannot read properties of undefined` → Mock structure mismatch
- `Test timed out` → Async/await issues or infinite loops
- `Unable to find element` → Component not rendering due to earlier crashes

#### Success Metrics

After systematic fixes:
- **Before**: Majority failing, many crashes preventing test execution
- **After**: 137 passing / 78 failing (64% success rate) 
- **Foundation**: Stable test infrastructure ready for remaining issues

The key insight is that fixing environmental issues first creates a stable foundation where individual test logic can be debugged effectively.

## Important Considerations

- The C++ code references Qt's deprecated features and may need updates for newer Qt versions
- Python code assumes ClickHouse is available at hostname 'clickhouse'
- Protocol changes require regenerating parser from `mdp.ksy` using Kaitai Struct compiler
- Test execution requires Qt event loop (QCoreApplication) for signal/slot mechanism
- Google Test's gtest_main provides the main() function - don't add it to test files
- Use QSignalSpy from QtTest to verify Qt signal emissions in tests
- All packet checksums are calculated as XOR of data bytes only (excluding 6-byte header)
- Kaitai cross-validation ensures protocol specification accuracy against reference implementation