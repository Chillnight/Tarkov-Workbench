// Author: CA
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/vendor', { recursive: true });
for (const name of ['highs.mjs', 'highs.wasm']) await copyFile(`node_modules/highs/build/${name}`, `dist/vendor/${name}`);
await copyFile('node_modules/highs/LICENSE', 'dist/vendor/HIGHS-LICENSE.txt');
