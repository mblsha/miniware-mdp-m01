import marimo

__generated_with = "0.11.5"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    from enum import Enum
    from dataclasses import dataclass
    from typing import List, Optional
    import datetime
    return Enum, List, Optional, dataclass, datetime, mo


@app.cell(hide_code=True)
def _(mo):
    refresh_ports = mo.ui.refresh()
    refresh_packets = mo.ui.refresh(label='Refresh Packets')
    return refresh_packets, refresh_ports


@app.cell(hide_code=True)
def _(mo, refresh_ports):
    import serial
    import serial.tools.list_ports

    available_ports = serial.tools.list_ports.comports()
    available_ports_names = {str(port): i for i, port in enumerate(available_ports)}

    refresh_ports.value
    selected_port_index = mo.ui.dropdown(options=available_ports_names)
    return (
        available_ports,
        available_ports_names,
        selected_port_index,
        serial,
    )


@app.cell(hide_code=True)
def _(mo, refresh_ports, selected_port_index):
    collect_data_button = mo.ui.run_button(label="Collect Data", disabled=selected_port_index.value is None)
    mo.hstack([refresh_ports, selected_port_index, collect_data_button], justify='start')
    return (collect_data_button,)


@app.cell(hide_code=True)
def _(mo):
    get_packets, set_packets = mo.state([])
    return get_packets, set_packets


@app.cell
def _(
    available_ports,
    collect_data_button,
    datetime,
    mo,
    parse_mdp01_data,
    parse_packet,
    selected_port_index,
    serial,
    set_packets,
):
    mo.stop(not collect_data_button.value)


    def capture_mdp01_data():
        set_packets([])
        packets = []

        start = datetime.datetime.now()
        buf = b''
        def parse_buf():
            nonlocal buf
            nonlocal packets
            parsed, buf = parse_mdp01_data(buf)
            if parsed:
                for p in parsed:
                    packets.append(parse_packet(p))
                set_packets(packets)

        with serial.Serial(available_ports[selected_port_index.value].device) as ser:
            while True:
                buf += ser.read()
                parse_buf()

        parse_buf()
        return packets

    capture_mdp01_data()
    return (capture_mdp01_data,)


@app.cell(hide_code=True)
def _(refresh_packets):
    refresh_packets
    return


@app.cell
def _(get_packets, refresh_packets):
    refresh_packets.value
    packets = get_packets()
    packets
    return (packets,)


@app.cell
def _():
    import io
    from kaitaistruct import KaitaiStream, KaitaiStruct
    import miniware_mdp_m01

    MachineType = miniware_mdp_m01.MiniwareMdpM01.MachineType
    PackType = miniware_mdp_m01.MiniwareMdpM01.PackType

    def parse_mdp01_single_packet(buf):
        for i in range(len(buf) - 3):
            if buf[i] == 0x5a and buf[i + 1] == 0x5a:
                size = buf[i + 3]
                if len(buf) < i + size:
                    break
                packet = io.BytesIO(buf[i:i + size])
                try:
                    p = miniware_mdp_m01.MiniwareMdpM01(KaitaiStream(packet))
                except Exception as e:
                    return buf[i + 2:], e
                return buf[i + size:], p
        return buf, None

    def parse_mdp01_data(buf):
        memorybuf = memoryview(buf)
        packets = []
        while len(memorybuf) > 0:
            last_len = len(memorybuf)
            memorybuf, parsed = parse_mdp01_single_packet(memorybuf)
            if parsed:
                assert len(parsed.packets) == 1
                packets.append(parsed.packets[0])
            if len(memorybuf) == last_len:
                break
        return packets, bytes(memorybuf)
    return (
        KaitaiStream,
        KaitaiStruct,
        MachineType,
        PackType,
        io,
        miniware_mdp_m01,
        parse_mdp01_data,
        parse_mdp01_single_packet,
    )


@app.cell
def _(List, MachineType, Optional, PackType, dataclass, datetime):
    @dataclass
    class Channel:
        index: int
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

    def parse_packet(p):
        if p.pack_type == PackType.wave:
            wave_groups = []
            for g in p.data.groups:
                wave_groups.append(WaveGroup(
                    timestamp=g.timestamp,
                    timestamp_received=datetime.datetime.now(),
                    items=[WaveItem(voltage=i.voltage, current=i.current) for i in g.items]
                ))

            return Wave(groups=wave_groups)
        elif p.pack_type == PackType.synthesize:
            channels = []
            for index, c in enumerate(p.data.channels):
                if c.type == MachineType.node:
                    continue
                channels.append(Channel(
                    index=index,
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
                    status_load=c.status_load if hasattr(c, 'status_load') else None,
                    status_psu=c.status_psu if hasattr(c, 'status_psu') else None,
                    # color=c.color,
                    error=c.error
                ))
            return Synthesize(channels=channels)
        assert ValueError(f'Unknown packet type: {p.pack_type}')
    return Channel, Synthesize, Wave, WaveGroup, WaveItem, parse_packet


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
