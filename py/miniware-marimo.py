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
def _():
    from mdp_m01.parser import parse_buffer, Channel, Synthesize, WaveItem, WaveGroup, Wave
    return Channel, Synthesize, Wave, WaveGroup, WaveItem, parse_buffer


@app.cell
def _(
    available_ports,
    collect_data_button,
    datetime,
    mo,
    parse_buffer,
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
            parsed, buf = parse_buffer(buf)
            if parsed:
                for p in parsed:
                    packets.append(p)
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
