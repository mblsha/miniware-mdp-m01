# Repository Guidelines

## GitHub & CI
- Monitor PR checks: `gh pr checks <number> --watch --interval 5` (add `--required` for gating checks, and `--fail-fast` to stop on first failure).
- On the PR branch you can omit `<number>`; `gh pr checks` has no `--wait`, so prefer `--watch` over manual polling.
- Watch a specific workflow run: `gh run watch $(gh run list --branch "$(git rev-parse --abbrev-ref HEAD)" --event pull_request -L 1 --json databaseId --jq '.[0].databaseId') --exit-status`.

## Rebases (non-interactive)
- When `git rebase --continue` would open an editor: `GIT_EDITOR=true git rebase --continue` (or `git -c core.editor=true rebase --continue`).
- For scripted interactive rebases: `GIT_SEQUENCE_EDITOR=true git rebase -i <base>` (keep these env vars scoped to the single command).

## Project Structure & Module Organization
The repository hosts three active runtimes. `cpp/` contains the Qt 6 desktop parser and Kaitai schema; build artifacts are generated into `cpp/build/` (gitignored) when you configure CMake. Parser unit tests live in `cpp/tests/`. `mdp-webui/` implements the Svelte + TypeScript web UI with reusable components under `src/lib/` and test fixtures in `tests/`. `py/` contains the lightweight Python parser (`py/mdp_m01/`) alongside utility scripts (run from `py/` or set `PYTHONPATH=py`).

## Build, Test, and Development Commands
From the repository root:
- C++: `cmake -S cpp -B cpp/build && cmake --build cpp/build` compiles the Qt application; run `ctest --test-dir cpp/build` to execute the Google Test suite.
- Web UI: inside `mdp-webui/`, `npm ci --legacy-peer-deps` prepares dependencies, `npm run dev` starts Vite, `npm run build` emits a production bundle, and `npm run test:run` runs Vitest. Use `npm run test:e2e` for Playwright suites and `npm run lint` / `npm run type-check` before commits.
- Python: inside `py/`, run `python3 -m pytest` for tests, `ruff check .` for linting, and `mypy . --ignore-missing-imports` for type checks (CI installs these tools via `uv`, but any install method is fine).

## Coding Style & Naming Conventions
C++ sources target C++17 and follow Qt idioms: PascalCase classes, camelCase methods, and four-space indentation. Keep generated Kaitai headers out of version control. In the web UI, rely on the ESLint config (`eslint.config.js`) and Svelte's two-space indentation; prefer named exports and TypeScript enums. Python modules are PEP 8 compliant with type hints and dataclasses (`parser.py`).

## Testing Guidelines
Name new C++ test files `test_<feature>.cpp` and register them in `CMakeLists.txt`. Vitest specs belong under `mdp-webui/src` or `mdp-webui/tests` and should mirror component names. Playwright scenarios live in `mdp-webui/tests/e2e`. Aim to keep `npm run test:coverage` above the current baseline before merging. Python tests should reside in `py/mdp_m01/test_*.py`.

## Commit & Pull Request Guidelines
Recent history mixes conventional-style prefixes (`refactor: ...`) with concise imperative messages; follow that pattern and scope commits narrowly. Pull requests should summarize the change, list manual and automated test runs, link any tracking issues, and include UI screenshots or recordings when front-end behavior changes.

## Kaitai Schema Workflow
When `cpp/mdp.ksy` changes:
- Web: run `cd mdp-webui && npm run generate-kaitai` and commit the updated `mdp-webui/src/lib/kaitai/` outputs.
- Python: regenerate `py/mdp_m01/miniware_mdp_m01.py` with `kaitai-struct-compiler -t python --outdir py/mdp_m01 cpp/mdp.ksy` (and commit the result).
- C++: rebuild `cpp/` (generated files go under `cpp/build/` and should not be committed).
