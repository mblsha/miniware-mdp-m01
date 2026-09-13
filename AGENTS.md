# Miniware MDP agent instructions

This repository contains a Qt/C++ protocol implementation (`cpp/`), a Svelte
monitoring UI (`webui/`), and TypeScript device-control tooling (`cli/`).

## Protocol changes

- Use `cpp/mdp.ksy` for packet IDs, sizes, fields, and conversions, and
  `cpp/processingdata.h` / `cpp/processingdata.cpp` for reference behavior.
  See [the protocol overview](cpp/MDP_PROTOCOL_OVERVIEW.md) for context.
  Resolve disagreements against the schema, implementation, and packet evidence;
  do not maintain another packet-ID table in this file.
- Packets begin with `5A 5A`; the size includes the six-byte header. Checksums
  XOR payload bytes only, excluding that header. Multi-byte values are little-endian.
- Preserve the initial synthesize-before-wave state (`waitSynPack`) and the
  receive/transmit address-byte ordering. Kaitai-derived voltages, currents,
  and temperatures are already converted; do not scale them twice.
- Regenerate affected parsers after schema changes. CMake generates C++ bindings;
  `npm --prefix webui run generate-kaitai` generates the web parser.
- Cross-validate changed parser/generator behavior against Kaitai with the
  relevant tests in `cpp/tests/`, including invalid sizes and checksums.

## Validation entrypoints

Choose checks for the changed component, fix failures caused by the change, and
rerun affected checks. Shared protocol changes need both C++ and web validation.

- C++ requires Qt6 Core/Test, Google Test, and the Kaitai compiler. Configure
  `cmake -S cpp -B cpp/build`, build with `cmake --build cpp/build`, then run
  `ctest --test-dir cpp/build --output-on-failure`. The test binary supports
  Google Test's `--gtest_filter` for focused checks.
- Web: `npm --prefix webui run test:run -- <test-file>` runs a focused suite;
  omit the filter for all unit tests. Use `check`, `lint`, and `build` for web
  source changes, and `test:e2e` for browser interactions. `webui/package.json`
  owns the remaining development and coverage commands.

## Test contracts

- Qt signal tests need a `QCoreApplication` event loop and `QSignalSpy`.
  Google Test supplies `main`; do not add another entrypoint to test files.
- Reset singleton channel/connection stores between tests. Stop heartbeats,
  clear packet handlers, disconnect, and restore real timers during cleanup.
- Advance fake timers by a bounded duration; running all timers with a repeating
  heartbeat can loop forever. Serial mocks must allow pending reads to complete
  or cancel, and integration tests must still exercise production parsing and
  connection behavior rather than only a replacement implementation.
- Match the generated Kaitai field names, nested `groups/items`, units, and
  component props in mocks. Historical test counts are not current acceptance evidence.

## UI interactions

- Preserve the project's pointer-event convention for mouse/touch/stylus input;
  use `onpointerup` for simple actions and handle cancellation for pressed state.
  Component callback props may still be named `onclick`; that is distinct from
  attaching a DOM click listener.
- Keep keyboard accessibility alongside pointer interactions. Preserve
  `touch-action: manipulation`, selection suppression, and press feedback on
  interactive controls where appropriate.
- Tests must exercise the event sequence the control supports, including both
  down/up when required. Verify changed interactions on desktop and touch paths.
