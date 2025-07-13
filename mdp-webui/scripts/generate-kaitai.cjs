const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const KaitaiStructCompiler = require('kaitai-struct-compiler');

async function main() {
  const ksyPath = path.resolve(__dirname, '..', '..', 'cpp', 'mdp.ksy');
  const outDir = path.resolve(__dirname, '..', 'src', 'lib', 'kaitai');
  const ksyYaml = fs.readFileSync(ksyPath, 'utf8');
  const ksy = YAML.parse(ksyYaml);
  const compiler = new KaitaiStructCompiler();
  try {
    const files = await compiler.compile('javascript', ksy, null, false);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), content);
    }
    console.log('Generated files:', Object.keys(files).join(', '));
  } catch (err) {
    console.error('Failed to generate Kaitai parser:', err);
    process.exit(1);
  }
}

main();
