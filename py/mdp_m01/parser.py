import io
from kaitaistruct import KaitaiStream, KaitaiStruct
import mdp_m01.miniware_mdp_m01
from dataclasses import dataclass
from typing import List, Optional
import datetime


MachineType = mdp_m01.miniware_mdp_m01.MiniwareMdpM01.MachineType
PackType = mdp_m01.miniware_mdp_m01.MiniwareMdpM01.PackType


def parse_buffer(buf):
    def parse_mdp01_single_packet(buf):
        for i in range(len(buf) - 3):
            if buf[i] == 0x5A and buf[i + 1] == 0x5A:
                size = buf[i + 3]
                if len(buf) < i + size:
                    break
                packet = io.BytesIO(buf[i : i + size])
                try:
                    p = mdp_m01.miniware_mdp_m01.MiniwareMdpM01(KaitaiStream(packet))
                except Exception as e:
                    return buf[i + 2 :], None
                return buf[i + size :], p
        return buf, None

    memorybuf = memoryview(buf)
    packets = []
    while len(memorybuf) > 0:
        last_len = len(memorybuf)
        memorybuf, parsed = parse_mdp01_single_packet(memorybuf)
        if parsed:
            assert len(parsed.packets) == 1
            p = parsed.packets[0]
            packets.append(process_packet(p))
        if len(memorybuf) == last_len:
            break
    return packets, bytes(memorybuf)


@dataclass
class Channel:
    channel_index: int
    timestamp_received: datetime.datetime
    temperature: float
    out_voltage: float
    out_current: float
    in_voltage: float
    in_current: float
    set_voltage: float
    set_current: float

    online: bool
    lock: bool
    output_on: bool
    machine_type: MachineType

    # color: bytes
    error: int

    status_load: Optional[bool] = None
    status_psu: Optional[bool] = None


@dataclass
class Synthesize:
    channels: List[Channel]


@dataclass
class WaveItem:
    voltage: float
    current: float


@dataclass
class WaveGroup:
    timestamp: int
    timestamp_received: datetime.datetime
    items: List[WaveItem]


@dataclass
class Wave:
    groups: List[WaveGroup]


def process_packet(p):
    if p.pack_type == PackType.wave:
        wave_groups = []
        for g in p.data.groups:
            wave_groups.append(
                WaveGroup(
                    timestamp=g.timestamp,
                    timestamp_received=datetime.datetime.now(),
                    items=[
                        WaveItem(voltage=i.voltage, current=i.current) for i in g.items
                    ],
                )
            )

        return Wave(groups=wave_groups)
    elif p.pack_type == PackType.synthesize:
        channels = []
        for index, c in enumerate(p.data.channels):
            if c.type == MachineType.node:
                continue
            channels.append(
                Channel(
                    channel_index=index,
                    timestamp_received=datetime.datetime.now(),
                    temperature=c.temperature,
                    out_voltage=c.out_voltage,
                    out_current=c.out_current,
                    in_voltage=c.in_voltage,
                    in_current=c.in_current,
                    set_voltage=c.set_voltage,
                    set_current=c.set_current,
                    online=c.online,
                    lock=c.lock,
                    output_on=c.output_on,
                    machine_type=c.type,
                    status_load=c.status_load if hasattr(c, "status_load") else None,
                    status_psu=c.status_psu if hasattr(c, "status_psu") else None,
                    # color=c.color,
                    error=c.error,
                )
            )
        return Synthesize(channels=channels)
    assert ValueError(f"Unknown packet type: {p.pack_type}")
