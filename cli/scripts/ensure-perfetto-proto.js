import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const submoduleRoot = resolve(repoRoot, 'third_party', 'retrobus-perfetto');
const protoOutput = resolve(submoduleRoot, 'ts', 'src', 'proto', 'perfetto_pb.js');
const tsRoot = resolve(submoduleRoot, 'ts');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

if (!existsSync(protoOutput)) {
  run('git', ['-C', repoRoot, 'submodule', 'update', '--init', '--recursive', 'third_party/retrobus-perfetto'], repoRoot);

  const pbjsPath = resolve(tsRoot, 'node_modules', '.bin', 'pbjs');
  if (!existsSync(pbjsPath)) {
    run('npm', ['install'], tsRoot);
  }

  mkdirSync(resolve(tsRoot, 'src', 'proto'), { recursive: true });
  run('npm', ['run', 'gen:proto'], tsRoot);
}
