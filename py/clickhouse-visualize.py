import marimo

__generated_with = "0.11.17"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _():
    import clickhouse_connect
    client = clickhouse_connect.get_client(host='clickhouse', port=8123)

    result = client.query_df('''
    SELECT * FROM mdp_data order by timestamp_received DESC
    ''')
    return clickhouse_connect, client, result


@app.cell
def _(result):
    result
    return


@app.cell
def _():
    return


@app.cell
def _(mo, result):
    import altair as alt
    import pandas as pd
    import datetime

    def mychart(df):
        df_filtered = df[df['channel_index'] == 0]
        df_filtered = df_filtered[df_filtered['timestamp_received'] > datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)]
        df_filtered['timestamp_received'] = pd.to_datetime(df_filtered['timestamp_received']).dt.tz_localize('UTC').dt.tz_convert('Australia/Sydney')

        columns = ['temperature', 'out_voltage', 'out_current']
        charts = []
        for col in columns:
            df_filtered[f'mean_{col}'] = df_filtered[col].rolling(window=1000).mean()

            chart = alt.Chart(df_filtered).mark_point().encode(
                x='timestamp_received',
                y=f'mean_{col}'
            )
            charts.append(chart)

        return alt.hconcat(*charts)

    mo.ui.altair_chart(mychart(result))
    return alt, datetime, mychart, pd


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
