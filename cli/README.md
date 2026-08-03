# mdp-cli

Command-line utility that reuses the Web UI packet encoder/decoder logic to talk to the Miniware MDP PSU from Node.js. It uses `serialport` for USB access and exposes `list`, `watch`, `machine`, `set`, and `output` commands.

## Setup

```bash
cd cli
npm install
```

## Commands

- `npm run start -- list` – prints only Miniware serial ports (vendor/product 0x0416/0xdc01).
- `npm run start -- watch [--port <path>]` – stream synthesize/wave/machine packets (Ctrl+C to stop); auto-selects the first Miniware matching port if `--port` is omitted.
- `npm run start -- machine [--port <path>]` – queries the machine type from the selected port.
- `npm run start -- devices` – shows the current alias map (`psu`, `psu1`, `load`, …) so you know which context names to use.
- `<alias>` commands (e.g. `npm run start -- psu --status` or `psu1`, `load`, `load2`) become available based on connected devices; use `--status`, `--status-json`, `--set-voltage`, `--set-current`, and `--channel` to inspect or adjust the selected context.
- `npm run start -- psu record [--duration <sec>] [--output-csv <path>] [--output-perfetto <path>] [--output-metadata <path>] [--transition-id <id> --clock-sync-json <path>]` – record waveform data for the selected device context; CSV is written to stdout by default and non-data messages go to stderr. Use `--output-perfetto` to write a Perfetto trace with raw chunks + alert events (limits derive from machine type). `--output-metadata` atomically records controller/host identity, selected channel, initial/final measured and target status, packet/checksum/gap integrity, and capture extrema. A transition ID requires a clock-sync sidecar; the sidecar retains lossless host realtime as decimal strings, 1 ms clock resolution, and uncertainty for cross-device correlation.
- When multiple PSUs or loads are connected the unqualified names (`psu`/`load`) become ambiguous and the CLI will prompt you to use `psu1`, `psu2`, `load1`, etc., so scripts can point at the numbered contexts explicitly.
- Append `--debug` to any command to keep the Kaitai debug logs in the output; otherwise they stay disabled so you only see the CLI response.

All commands accept `--port` followed by the serial path and honor standard Miniware channel numbers (0–5).

## Notes

- The CLI relies on `webui/src/lib` for packet parsing/encoding, so keep the Kaitai build up to date if you regenerate `mdp.ksy`.
- Heartbeats are emitted automatically while `watch` is running; other commands send the required packets and exit cleanly.
- M01 v2.02 does not ACK setters and does not answer each heartbeat with a status packet. `set` and `output` confirm against later SYNTHESIZE telemetry; a timeout means the requested state was not observed, not that the command was explicitly rejected.
- SET_V and SET_I both transmit the complete voltage/current pair. The CLI preserves the companion value from current telemetry and sends one command without a SET_CH preamble, avoiding an unnecessary selected-channel/waveform side effect.
- Each outbound frame is validated, queued, and issued as one serial write because the recovered device receive parser is sensitive to USB OUT transfer splitting and coalescing. See [`../cpp/MDP_PROTOCOL_OVERVIEW.md`](../cpp/MDP_PROTOCOL_OVERVIEW.md) for the firmware-derived implementation notes.
- Incoming packet handlers receive only direction-, size-, channel-, and checksum-valid device frames. Capture/alert observers additionally see complete rejected candidates in wire order, preserving checksum diagnostics without exposing corrupt telemetry to command logic.
