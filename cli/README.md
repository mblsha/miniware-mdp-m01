# mdp-cli

Command-line utility that reuses the Web UI packet encoder/decoder logic to talk to the Miniware MDP PSU from Node.js. It uses `serialport` for USB access and exposes `list`, `watch`, `machine`, `set`, and `output` commands.

## Setup

```bash
cd cli
npm install
```

## Commands

- `npm run start -- list` – prints the detected serial ports.
- `npm run start -- watch` – logs synthesize, wave, and machine packets indefinitely (Ctrl+C to stop). If `--port` is omitted, it will pick the first Miniware-compatible serial device automatically.
- `npm run start -- machine` – requests the device type and prints it; the port is autodiscovered unless you pass `--port`.
- `npm run start -- set 0 -v 12 -t 0.5` – sets channel 0 to 12 V/0.5 A (sends the channel select, voltage, and current packets); you can still supply `--port` to override the auto-selected device.
- `npm run start -- output 0 on` – toggles channel output state; uses auto-detected Miniware device when `--port` is not specified.

All commands accept `--port` followed by the serial path and honor standard Miniware channel numbers (0–5).

## Notes

- The CLI relies on `mdp-webui/src/lib` for packet parsing/encoding, so keep the Kaitai build up to date if you regenerate `mdp.ksy`.
- Heartbeats are emitted automatically while `watch` is running; other commands send the required packets and exit cleanly.
