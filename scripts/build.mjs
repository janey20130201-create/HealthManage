import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'script.js', 'styles.css', 'ai.css']) {
  await copyFile(join(root, name), join(output, name));
}
console.log('Vercel 정적 파일 4개를 dist에 준비했습니다.');
