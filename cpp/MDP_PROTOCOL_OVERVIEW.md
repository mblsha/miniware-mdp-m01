# Miniware MDP-M01 serial protocol

This document describes the USB CDC serial protocol implemented by the
GD32F303 MDP-M01 main firmware v2.02. It combines observed host traffic with
the recovered firmware implementation. M02 controllers may differ.

## Frame format

Every frame is:

```text
offset  size  meaning
0       2     magic: 5A 5A
2       1     packet type
3       1     total frame size, including this six-byte header
4       1     channel: 0..5 for indexed packets, EE for broadcast packets
5       1     XOR of payload bytes [6, size)
6       ...   type-specific payload
```

The byte at offset 5 is a checksum, not padding. Multi-byte integers are
little-endian. Voltage and current values are unsigned millivolts and
milliamps; temperature is an unsigned value in tenths of a degree Celsius.

## Packet types

### Device to host

| Type | Name | Size | Channel | Payload |
|---:|---|---:|---|---|
| `11` | SYNTHESIZE | 156 | selected channel `0..5` | Six 25-byte status records |
| `12` | WAVE | 126 or 206 | sampled channel `0..5` | Ten timestamp/sample groups |
| `13` | ADDR | 42 | `EE` | Six address/frequency records |
| `14` | UPDATE_CH | 7 | selected channel `0..5` | Same channel byte again |
| `15` | MACHINE | 7 | `EE` | `10` for the LCD M01 |
| `23` | ERR_240 | 6 | `EE` | None; retained for old captures |

No construction or enqueue path for ERR_240 was found in v2.02, so it should
be treated as a legacy possibility rather than an error the firmware is known
to report.

### Host to device

| Type | Name | Size | Channel | Payload / firmware behaviour |
|---:|---|---:|---|---|
| `16` | SET_ISOUTPUT | 7 | `0..5` | Zero is off; any nonzero value is on |
| `17` | GET_ADDR | 6 | `EE` | Sends ADDR immediately |
| `18` | SET_ADDR | 12 | `0..5` | Five address bytes plus frequency offset |
| `19` | SET_CH | 6 | `0..5` | Selects UI/wave channel and clears partial wave accumulation |
| `1A` | SET_V | 10 | `0..5` | Voltage and current pair; selects voltage edit mode |
| `1B` | SET_I | 10 | `0..5` | Voltage and current pair; selects current edit mode |
| `1C` | SET_ALL_ADDR | 42 | `EE` | Six address/frequency records; sends ADDR immediately |
| `1D` | START_AUTO_MATCH | 6 | `EE` | Starts matching; no direct response |
| `1E` | STOP_AUTO_MATCH | 6 | `EE` | Stops matching; no direct response |
| `1F` | RESET_TO_DFU | 6 | `EE` | Explicit no-op in v2.02 |
| `20` | RGB | 7 | `EE` | Zero disables animation, nonzero enables it |
| `21` | GET_MACHINE | 6 | `EE` | Sends MACHINE immediately |
| `22` | HEARTBEAT | 6 | `EE` | No direct response; advances the telemetry scheduler |

SET_V and SET_I do not independently update one value. Both consume the same
four-byte `voltage_mV, current_mA` pair and write both setpoints. The opcode
changes the controller's mode/state. A host changing only one value must first
preserve the companion setpoint from recent telemetry.

SET_CH is not required before SET_V, SET_I, SET_ISOUTPUT, or SET_ADDR. Those
handlers use the channel in their own header directly. Sending SET_CH as an
addressing preamble has an unrelated visible side effect and discards a
partially accumulated WAVE packet.

Radio-address byte order is asymmetric in v2.02. SET_ADDR and SET_ALL_ADDR are
consumed as `addr[0]..addr[4]`, while ADDR responses emit each stored address as
`addr[4]..addr[0]`. The shared decoder reverses ADDR response bytes before
exposing them to callers, so a read-modify-write round trip retains the human
order used by the command encoders.

## Response semantics

Only these requests have direct responses:

- GET_MACHINE -> MACHINE
- GET_ADDR -> ADDR
- SET_ALL_ADDR -> ADDR

The control setters do not ACK. To confirm one, compare a later SYNTHESIZE
frame with the requested state. A telemetry timeout means “not observed”; it
does not prove that the command was rejected.

HEARTBEAT is also not a request/response pair. Every checksum-valid received
frame advances a shared counter by 20. SYNTHESIZE is attempted when the
counter is divisible by 200, UPDATE_CH at 300, and RGB animation work at 700.
The initial scheduler phase is not established, so one heartbeat must never be
assumed to produce one SYNTHESIZE frame. The CLI installs one telemetry waiter
and sends separately paced heartbeat probes until status arrives or times out.

## SYNTHESIZE layout

The 150-byte payload contains six records. Record byte offsets are:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 1 | Record/channel number |
| 1 | 2 | Output voltage, mV |
| 3 | 2 | Output current, mA |
| 5 | 2 | Input voltage, mV |
| 7 | 2 | Input current, mA |
| 9 | 2 | Set voltage, mV |
| 11 | 2 | Set current, mA |
| 13 | 2 | Temperature, 0.1 C |
| 15 | 1 | Online flag |
| 16 | 1 | Module type (`1` P905, `2` P906, `3` L1060) |
| 17 | 1 | Lock flag |
| 18 | 1 | PSU/load operating mode |
| 19 | 1 | Output state |
| 20 | 2 | RGB565 colour, little-endian |
| 22 | 1 | Fixed `EE` marker |
| 23 | 1 | Error flag |
| 24 | 1 | Fixed `FF` end marker |

For an offline or invalid-address slot the firmware zeroes the record and then
sets only the record number; the fixed markers are consequently zero too.

## WAVE layout and timing

The firmware accumulates ten groups before it emits a WAVE frame:

- 126-byte frame: ten groups with two voltage/current samples each.
- 206-byte frame: ten groups with four voltage/current samples each.

Each group starts with a little-endian `uint32` raw TIMER1 tick accumulator,
followed by its sample pairs. The value is an interval accumulated for that
group, not an absolute timestamp. The historical host conversion is:

```text
point interval = group_ticks / samples_per_group / 10
```

The exact wall-clock scale depends on the timer clock configuration. Preserve
the raw tick value in captures when precise timing or later recalibration is
important.

## USB transport behaviour

Device-to-host traffic is a normal byte stream. Endpoint 5 transmits at most 64
bytes per USB transfer, and the firmware flushes it every sixth qualifying USB
SOF while configured. A single 126-, 156-, or 206-byte frame is therefore split
across multiple host reads. Conversely, one host read can contain several
complete frames. Host parsers must retain partial frames and extract all
coalesced frames.

Host-to-device parsing is substantially more fragile. Endpoint 4 passes one
USB OUT buffer and its length to the parser, whose state machine is sensitive
to transfer boundaries:

- A frame split across USB OUT callbacks can be accepted prematurely and have
  its remainder discarded.
- Multiple frames coalesced into one callback can be appended together, after
  which only the first declared frame is dispatched and the trailing data is
  lost.
- There is effectively one pending receive-frame slot.

All legitimate host commands are at most 42 bytes, below the 64-byte endpoint
size. The host implementation consequently:

1. validates one exact, checksummed host command before writing;
2. performs one serial write per complete frame;
3. serializes concurrent commands and heartbeats;
4. avoids redundant SET_CH/control pairs;
5. spaces status probes instead of emitting a tight burst.

The Web Serial and serialport APIs cannot absolutely guarantee USB transaction
boundaries, but these rules avoid creating splits or coalescing at the
application layer.

## Defensive validation

The firmware does not validate type-specific sizes or channel indexes before
several array accesses. In particular, sending `EE` with a channel-indexed
command can write outside the six-slot arrays. It also accepts arbitrary radio
frequency offsets. Host code must enforce:

- channel `0..5` for SET_ISOUTPUT, SET_ADDR, SET_CH, SET_V, and SET_I;
- channel `EE` for broadcast commands;
- exact type-specific sizes;
- a frequency offset in `0..83` (2400–2483 MHz);
- one complete frame, with XOR over payload bytes only;
- voltage/current values representable as unsigned 16-bit milliunits.

The shared TypeScript stream extractor additionally rejects wrong-direction,
bad-checksum, and semantically inconsistent UPDATE_CH frames and resynchronizes
after corrupt or false headers. The C++ stream parser mirrors the important
partial/coalesced-frame and resynchronization behaviour.
