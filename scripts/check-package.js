import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of ['src/index.js', 'src/index.cjs', 'src/index.d.ts', 'src/index.d.cts', 'README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'examples/audit.js']) assert.ok(existsSync(file), file);
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly']) assert.equal(pkg.scripts[hook], undefined);
console.log('Package boundaries and declared entry points passed');

assert.equal(readFileSync('src/index.d.ts', 'utf8'), readFileSync('src/index.d.cts', 'utf8'));
assert.deepEqual(pkg.exports['.'], { import: { types: './src/index.d.ts', default: './src/index.js' }, require: { types: './src/index.d.cts', default: './src/index.cjs' } });
