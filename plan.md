# CLI Stabilization Plan

## Overview
Goals: keep the CLI working reliably while deferring the large `mdp-core` refactor. Start by documenting the work, apply surgical fixes to the serial transport and command handling, and record longer-term refactor work to be tackled after verification.

## Steps
1. **Document the stabilization strategy** (done) – capture this plan so we can update statuses as we go.
2. **Harden `NodeSerialConnection` framing** – enforce sane packet sizes, resync when malformed lengths are detected, and limit buffer growth so we don't hang or leak data.
3. **Tighten CLI transport usage** – make every command consistently resolve ports (auto-pick only when unambiguous), protect `set`/`output` defaults, and keep discovery/local commands focused.
4. **Record the future `mdp-core`/transport split** – note the refactor roadmap (shared protocol, transport interface, controller abstractions) for later follow-up.

## Progress
- Step 1: ✅ plan documented (this file).
- Step 2: ✅ NodeSerialConnection framing guards and buffer caps added.
- Step 3: ✅ auto port selection now errors if more than one device is present; additional transport polish still planned.
- Step 4: ✅ controller layer introduced and CLI now calls into it for machine/status/output actions.

## Future roadmap
- ✅ Extract `packages/mdp-core/` containing protocol utilities (packet encoder/decoder, Kaitai runtime shim, machine utils) with environment-neutral exports (currently bridging via re-exports).
- ✅ Introduce a transport interface (`write`, `close`, `onBytes`, `listPorts`), then implement WebSerial + NodeSerial implementations that feed into the shared core (NodeSerialConnection now satisfies the interface; WebSerial remains to be formalized).
- ✅ Refactor the CLI around a controller layer that takes a transport, issues protocol actions (`getMachineInfo`, `setTargets`, `setOutput`, etc.), and returns structured data, keeping `index.ts` thin.
- ⬜ Harden tests: unit-test the core parser/transport state machine with mocked chunks, then integration-test the CLI/transport wiring without needing real hardware.
