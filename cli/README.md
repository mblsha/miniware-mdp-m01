# mdp-cli

Command-line utility that reuses the Web UI packet encoder/decoder logic to talk to the Miniware MDP PSU from Node.js. It uses `serialport` for USB access and exposes `list`, `watch`, `machine`, `set`, and `output` commands.

## Setup

```bash
cd cli
npm install
```

## Commands

- `npm run start -- list` – prints the detected serial ports.
- Append `--debug` to any command to keep the Kaitai debug logs in the output; otherwise they are disabled so you only see the CLI response.

All commands accept `--port` followed by the serial path and honor standard Miniware channel numbers (0–5).

## Notes

- The CLI relies on `mdp-webui/src/lib` for packet parsing/encoding, so keep the Kaitai build up to date if you regenerate `mdp.ksy`.
- Heartbeats are emitted automatically while `watch` is running; other commands send the required packets and exit cleanly.
