import marimo

__generated_with = "0.11.17"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    from enum import Enum
    from dataclasses import dataclass
    from typing import List, Optional
    import datetime
    import pandas
    return Enum, List, Optional, dataclass, datetime, mo, pandas


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
    return available_ports, available_ports_names, selected_port_index, serial


@app.cell
def _():
    import clickhouse_connect
    client = clickhouse_connect.get_client(host='clickhouse', port=8123)

    client.query('''
    CREATE TABLE IF NOT EXISTS mdp_data (
        machine_type        Enum('node' = 0, 'p905' = 1, 'p906' = 2, 'l1060' = 3),
        channel_index       UInt8,
        timestamp_received  DateTime,
        temperature         Float32,
        out_voltage         Float32,
        out_current         Float32,
        in_voltage          Float32,
        in_current          Float32,
        set_voltage         Float32,
        set_current         Float32,
        online              Bool,
        lock                Bool,
        output_on           Bool,
        error               Int8,
        status_load         Nullable(Enum('cc' = 0, 'cv' = 1, 'cr' = 2, 'cp' = 3)),
        status_psu          Nullable(Enum('false' = 0, 'cc' = 1, 'cv' = 2, 'true' = 3))
    ) ENGINE = MergeTree()
    ORDER BY timestamp_received
    ''')

    # data = [(1, 'Alice', 25), (2, 'Bob', 30)]
    # client.insert('users', data, column_names=['id', 'name', 'age'])
    return clickhouse_connect, client


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
def _():
    from mdp_m01.parser import parse_buffer, Channel, Synthesize, WaveItem, WaveGroup, Wave
    return Channel, Synthesize, Wave, WaveGroup, WaveItem, parse_buffer


@app.cell
def _(client):
    def send_channel_to_clickhouse(channel):
        client.insert('mdp_data', [(
            channel.machine_type.value,
            channel.channel_index,
            channel.timestamp_received,
            channel.temperature,
            channel.out_voltage,
            channel.out_current,
            channel.in_voltage,
            channel.in_current,
            channel.set_voltage,
            channel.set_current,
            channel.online,
            channel.lock,
            channel.output_on,
            channel.error,
            channel.status_load.value if channel.status_load is not None else None,
            channel.status_psu.value if channel.status_psu is not None else None,
        )], column_names=[
            'machine_type',
            'channel_index',
            'timestamp_received',
            'temperature',
            'out_voltage',
            'out_current',
            'in_voltage',
            'in_current',
            'set_voltage',
            'set_current',
            'online',
            'lock',
            'output_on',
            'error',
            'status_load',
            'status_psu',
        ])
    return (send_channel_to_clickhouse,)


@app.cell
def _(
    Synthesize,
    available_ports,
    collect_data_button,
    datetime,
    mo,
    parse_buffer,
    selected_port_index,
    send_channel_to_clickhouse,
    serial,
    set_packets,
):
    mo.stop(not collect_data_button.value)


    def capture_mdp01_data():
        set_packets([])
        packets = []

        buf = b''
        def parse_buf():
            nonlocal buf
            nonlocal packets
            parsed, buf = parse_buffer(buf)
            if parsed:
                for p in parsed:
                    packets.append(p)
                    if isinstance(p, Synthesize):
                        for c in p.channels:
                            try:
                                send_channel_to_clickhouse(c)
                            except Exception as e: # AttributeError as e:
                                print(c)
                                print(e)
                                pass

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
def _(Synthesize, get_packets, pandas, refresh_packets):
    refresh_packets.value
    packets = get_packets()
    channels = []
    for p in packets:
        if isinstance(p, Synthesize):
            channels += p.channels
    df = pandas.DataFrame(channels)
    df
    return channels, df, p, packets


@app.cell
def _(channels, datetime):
    # try to find channel chunks with minimum timedelta between them, and the timedelta between big chunks
    def analyze_channels_time(channels):
        # first find the minimum timedelta between chunks
        min_timedelta = None
        for i in range(len(channels) - 1):
            timedelta = channels[i + 1].timestamp_received - channels[i].timestamp_received
            if min_timedelta is None or timedelta < min_timedelta:
                min_timedelta = timedelta

        # then find median timedelta between chunks
        timedelta_list = []
        for i in range(len(channels) - 1):
            timedelta = channels[i + 1].timestamp_received - channels[i].timestamp_received
            timedelta_list.append(timedelta)
        timedelta_list.sort()
        median_timedelta = timedelta_list[len(timedelta_list) // 2]

        # average timedelta between chunks
        average_timedelta = sum(timedelta_list, start=datetime.timedelta()) / len(timedelta_list)

        # maxiumum timedelta
        max_timedelta = timedelta_list[-1]
        return (min_timedelta, median_timedelta, average_timedelta, max_timedelta), [c.timestamp_received for c in channels if c.channel_index == 0]



    analyze_channels_time(channels)
    return (analyze_channels_time,)


@app.cell
def _(df, mo):
    def plot_df(df):
        plots = []
        for c in df["channel_index"].unique():
            channel_df = df[df["channel_index"] == c]
            machine_type = channel_df["machine_type"].iloc[0]
            machine_type = str(machine_type).split('.')[1]
            value_columns = [
                "temperature",
                "in_voltage",
                "in_current",
                "out_voltage",
                "out_current",
                "set_voltage",
                "set_current",
            ]
            melted = channel_df.melt(
                id_vars=["timestamp_received", "channel_index"],
                value_vars=value_columns,
                var_name="value_type",
                value_name="value",
            )
            plots.append(
                alt.Chart(melted).mark_line().encode(
                    x="timestamp_received:T",
                    y="value:Q",
                    color="value_type:N",
                ).properties(title=f"C{c+1}: {machine_type}")
            )
        return alt.vconcat(*plots)

    import altair as alt

    mo.ui.altair_chart(plot_df(df))
    return alt, plot_df


if __name__ == "__main__":
    app.run()
