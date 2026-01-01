# Miniware MDP Logger / Visualizer

Implementation based on the [original source](https://forum.minidso.com/forumdownload/MDPUpperCodeV1.0.zip) implementation in `processingdata.h` / `processingdata.cpp`.

## CLI control interface

A dedicated `cli/` folder reuses the Web UI packet encoder/decoder helpers to talk to the PSU from Node.js using the `serialport` bindings. See `cli/README.md` for installation instructions and the available commands (`list`, `watch`, `machine`, `set`, `output`), which can be executed with `npm run start -- <command>`.

The CLI will automatically pick the first matching Miniware serial port (based on vendor/product or manufacturer) when you omit `--port`, so most commands work immediately once the device is plugged in.
