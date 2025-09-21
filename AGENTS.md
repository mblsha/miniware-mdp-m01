# Repository Guidelines

## Project Structure & Module Organization
The repository hosts three active runtimes. `cpp/` contains the Qt 6 desktop parser and Kaitai schema; build artifacts are generated into `build/` when you configure CMake. Parser unit tests live in `cpp/tests/`. `mdp-webui/` implements the Svelte + TypeScript web UI with reusable components under `src/lib/` and test fixtures in `tests/`. `py/` packages the lightweight Python parser (`py/mdp_m01/`) alongside utility scripts; install it in editable mode for rapid iteration.

## Build, Test, and Development Commands
From the repository root:
- C++: `cmake -S cpp -B build && cmake --build build` compiles the Qt application; run `ctest --test-dir build` to execute the Google Test suite.
- Web UI: inside `mdp-webui/`, `npm ci` prepares dependencies, `npm run dev` starts Vite, `npm run build` emits a production bundle, and `npm run test:run` runs Vitest. Use `npm run test:e2e` for Playwright suites and `npm run lint` / `npm run type-check` before commits.
- Python: `pip install -e py` sets up the module; run `pytest py` to execute parser tests.

## Coding Style & Naming Conventions
C++ sources target C++17 and follow Qt idioms: PascalCase classes, camelCase methods, and four-space indentation. Keep generated Kaitai headers out of version control. In the web UI, rely on the ESLint config (`eslint.config.js`) and Svelte's two-space indentation; prefer named exports and TypeScript enums. Python modules are PEP 8 compliant with type hints and dataclasses (`parser.py`).

## Testing Guidelines
Name new C++ test files `test_<feature>.cpp` and register them in `CMakeLists.txt`. Vitest specs belong under `mdp-webui/src` or `mdp-webui/tests` and should mirror component names. Playwright scenarios live in `mdp-webui/tests/e2e`. Aim to keep `npm run test:coverage` above the current baseline before merging. Python tests should reside in `py/mdp_m01/test_*.py`.

## Commit & Pull Request Guidelines
Recent history mixes conventional-style prefixes (`refactor: ...`) with concise imperative messages; follow that pattern and scope commits narrowly. Pull requests should summarize the change, list manual and automated test runs, link any tracking issues, and include UI screenshots or recordings when front-end behavior changes.

## Kaitai Schema Workflow
When `mdp.ksy` changes, rerun `npm run generate-kaitai` (web) and rebuild CMake targets to refresh generated parsers. Commit the `.ksy` file and any hand-authored adapters, but leave build outputs to CI.
