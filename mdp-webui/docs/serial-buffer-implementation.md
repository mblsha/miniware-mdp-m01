# Serial Buffer Implementation

## Overview

This implementation adds proper buffer management to the JavaScript serial connection to handle partial packets, matching the Python parser's capabilities.

## Key Changes

### 1. Buffer Management in SerialConnection

- Added `receiveBuffer` as a `Uint8Array` to store incomplete packet data
- Buffer persists between read operations, accumulating data until complete packets are formed
- Automatically clears buffer on disconnect to prevent stale data

### 2. Packet Processing Algorithm

The `processIncomingData()` method:
1. Searches for packet header (0x5A 0x5A) anywhere in the buffer
2. Removes any garbage data before the header
3. Checks if enough data exists for the complete packet (based on size field)
4. Extracts and processes complete packets
5. Preserves remaining data for next iteration
6. Implements safety mechanism to clear buffer if too much garbage accumulates (>256 bytes)

### 3. Data Flow

```
Serial Port → readLoop() → Append to receiveBuffer → processIncomingData() → handlePacket()
```

### 4. Test Coverage

The unit tests verify:
- Packets split into 2 parts
- Packets split into many small chunks
- Multiple packets with various split points
- Garbage data before valid packets
- Incomplete headers at buffer end
- Buffer overflow protection
- Integration with readLoop for realistic data streams

## Benefits

1. **Feature Parity with Python**: JavaScript now handles partial packets like the Python implementation
2. **Robust Error Handling**: Gracefully handles garbage data and malformed packets
3. **Memory Safety**: Prevents unbounded buffer growth with automatic clearing
4. **Backwards Compatible**: Maintains existing API - packet handlers receive arrays as before

## Usage

No changes required to existing code. The buffer management is transparent to packet handlers.