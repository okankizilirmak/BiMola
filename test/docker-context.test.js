import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

test('Dockerfile only copies sources present in the repository build context', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const ignored = (await readFile(new URL('../.dockerignore', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean);
  const sources = dockerfile.split(/\r?\n/).filter(line => /^COPY\s/i.test(line)).flatMap(line => {
    const words = line.trim().split(/\s+/);
    return words.slice(1, -1);
  });
  assert.ok(sources.length, 'Dockerfile must copy application sources');
  for (const source of sources) {
    assert.ok(!ignored.includes(source), `${source} is excluded by .dockerignore`);
    if (source.includes('*')) {
      assert.equal(source, 'package*.json');
      await stat(new URL('../package.json', import.meta.url));
      await stat(new URL('../package-lock.json', import.meta.url));
    } else {
      await stat(new URL(`../${source}`, import.meta.url));
    }
  }
  assert.ok(sources.includes('server'), 'server game modules must be in the image');
  assert.ok(sources.includes('public'), 'browser game assets must be in the image');
});
