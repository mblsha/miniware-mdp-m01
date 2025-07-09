# Miniware MDP M01/M02 Protocol Overview

## Introduction

The Miniware MDP (Multi-channel Digital Power) protocol is a binary communication protocol used by the M01 (with LCD) and M02 (without LCD) power supply devices. The protocol enables real-time monitoring and control of up to 6 independent power channels over a serial connection.

## Protocol Structure

### Packet Format

All packets follow a consistent structure:

```
[0x5A][0x5A][Type][Size][Channel][Checksum][Data...]
```

- **Magic Header** (2 bytes): Always `0x5A 0x5A`
- **Type** (1 byte): Packet type identifier (see command list below)
- **Size** (1 byte): Total packet size including the 6-byte header
- **Channel** (1 byte): Channel number (0-5) or `0xEE` for default/all channels
- **Checksum** (1 byte): XOR of all data bytes (excluding header)
- **Data** (variable): Packet-specific payload

### Data Encoding

- **Multi-byte integers**: Little-endian format
- **Voltages**: Stored as millivolts (mV), divide by 1000 for volts
- **Currents**: Stored as milliamps (mA), divide by 1000 for amps
- **Temperature**: Raw value, divide by 10 for degrees Celsius
- **Frequency**: Stored as offset from 2400 MHz base frequency

## Device → Host Commands (Incoming)

### PACK_SYNTHESIZE (0x11) - Channel Status Report
**Size**: 156 bytes (6 header + 150 data)  
**Purpose**: Comprehensive status update for all 6 channels

Provides real-time data including:
- Output voltage and current
- Input voltage and current  
- Preset voltage and current settings
- Temperature
- Online/offline status
- Machine type (P905/P906/L1060)
- Operating mode (CC/CV/CR/CP)
- Output state (on/off)
- Channel color (RGB565 format)
- Error status

Each channel occupies 25 bytes in the data payload.

### PACK_WAVE (0x12) - Waveform Data
**Size**: 126 or 206 bytes  
**Purpose**: Time-series voltage and current measurements for graphing

Contains 10 groups of timestamped measurements:
- 126 bytes: 2 data points per group (20 points total)
- 206 bytes: 4 data points per group (40 points total)

**Timestamp Decoding**:
Each group starts with a 4-byte timestamp (uint32, little-endian) representing the time in microseconds when the group was sampled. To calculate individual point times within a group:

1. Read the 32-bit timestamp for the group
2. Divide by the number of points in the group (2 or 4)
3. Divide by 10 for the final time unit
4. Add this interval between consecutive points

Example for a 2-point group with timestamp 10000:
- Point interval = 10000 / 2 / 10 = 500 time units
- Point 1: time = 0
- Point 2: time = 500

### PACK_ADDR (0x13) - Address and Frequency Report  
**Size**: 42 bytes  
**Purpose**: Reports wireless address and frequency for all 6 channels

Each channel has:
- 5-byte address (stored in reverse order in packet)
- 1-byte frequency offset from 2400 MHz

**Note**: Address bytes are reversed - packet byte 0 becomes address[4] in memory.

### PACK_UPDAT_CH (0x14) - Channel Switch Notification
**Size**: 7 bytes  
**Purpose**: Notifies host that the active channel has changed on the device

Contains the new channel number (0-5).

### PACK_MACHINE (0x15) - Device Type Identification
**Size**: 7 bytes  
**Purpose**: Reports the device model

Values:
- `0x10`: M01 (with LCD display)
- `0x11`: M02 (without LCD display)

### PACK_ERR_240 (0x23) - Error Notification
**Size**: 6 bytes  
**Purpose**: Indicates a 240V module error condition

No data payload - the packet itself is the error notification.

## Host → Device Commands (Outgoing)

### Control Commands

#### PACK_SET_V (0x1A) - Set Voltage
**Size**: 10 bytes  
**Purpose**: Set target voltage and current limit for a channel

Data: 2 bytes voltage (mV) + 2 bytes current (mA)

#### PACK_SET_I (0x1B) - Set Current  
**Size**: 10 bytes  
**Purpose**: Set target current (identical format to SET_V)

Data: 2 bytes voltage (mV) + 2 bytes current (mA)

#### PACK_SET_ISOUTPUT (0x16) - Enable/Disable Output
**Size**: 7 bytes  
**Purpose**: Turn channel output on or off

Data: 1 byte (0 = OFF, 1 = ON)

#### PACK_SET_CH (0x19) - Select Active Channel
**Size**: 6 bytes  
**Purpose**: Change the currently active channel for display/control

No data payload - channel number is in the header.

### Configuration Commands

#### PACK_SET_ADDR (0x18) - Set Single Channel Address
**Size**: 12 bytes  
**Purpose**: Configure wireless address and frequency for one channel

Data: 5 address bytes + 1 frequency offset byte

#### PACK_SET_ALL_ADDR (0x1C) - Set All Channel Addresses
**Size**: 42 bytes  
**Purpose**: Configure addresses and frequencies for all 6 channels at once

Data: 6 × (5 address bytes + 1 frequency offset byte)

#### PACK_START_AUTO_MATCH (0x1D) - Enable Auto-Matching
**Size**: 6 bytes  
**Purpose**: Start automatic channel matching mode

#### PACK_STOP_AUTO_MATCH (0x1E) - Disable Auto-Matching  
**Size**: 6 bytes  
**Purpose**: Stop automatic channel matching mode

#### PACK_RGB (0x20) - Control RGB LED
**Size**: 7 bytes  
**Purpose**: Turn RGB LED effects on or off

Data: 1 byte (0 = OFF, 1 = ON)

### Query Commands

#### PACK_GET_ADDR (0x17) - Request Address Information
**Size**: 6 bytes  
**Purpose**: Request device to send PACK_ADDR with all channel addresses

#### PACK_GET_MACHINE (0x21) - Request Device Type
**Size**: 6 bytes  
**Purpose**: Request device to send PACK_MACHINE with model information

### Maintenance Commands

#### PACK_HEARTBEAT (0x22) - Keep-Alive Signal
**Size**: 6 bytes  
**Purpose**: Maintain connection and prevent timeout

#### PACK_RESET_TO_DFU (0x1F) - Enter Firmware Update Mode
**Size**: 6 bytes  
**Purpose**: Restart device in DFU (Device Firmware Update) mode

## Communication Flow

1. **Initial Connection**: Host sends PACK_GET_MACHINE to identify device type
2. **Status Monitoring**: Device periodically sends PACK_SYNTHESIZE updates
3. **Waveform Display**: After receiving synthesize packet, device sends PACK_WAVE data
4. **Channel Control**: Host uses PACK_SET_CH to switch channels, PACK_SET_V/I to adjust settings
5. **Keep-Alive**: Host sends periodic PACK_HEARTBEAT to maintain connection

## Important Implementation Notes

1. **Wave Processing**: Wave packets are only processed after receiving at least one synthesize packet (waitSynPack flag)
2. **Channel Filtering**: Wave packets for non-active channels are ignored
3. **Address Byte Order**: Incoming address packets have reversed byte order compared to outgoing
4. **Checksum Calculation**: XOR of data bytes only, excluding 6-byte header
5. **Default Channel**: Use channel value `0xEE` (238) when not targeting a specific channel

## Machine Types

The protocol supports three device types:
- **P905**: Basic power supply
- **P906**: Advanced power supply with CC/CV modes
- **L1060**: Electronic load with CC/CV/CR/CP modes

Operating modes vary by device type, with loads supporting constant resistance (CR) and constant power (CP) modes in addition to the standard constant current (CC) and constant voltage (CV) modes.