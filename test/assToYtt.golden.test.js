// Forward conversion tests from the original project (YTSubConverter.Tests/Ass/AssIntegrationTests.cs):
// each test/files/ass/X.ass must convert to exactly test/files/ass/X.ytt.
// Skipped until the .ass reader (src/formats/ass/index.js) is present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { YttDocument, insertLineBreaks } from '../src/formats/ytt.js';

const dir = fileURLToPath(new URL('./files/ass/', import.meta.url));
const assIndex = fileURLToPath(new URL('../src/formats/ass/index.js', import.meta.url));
const hasAss = existsSync(assIndex);
const ass = hasAss ? await import('../src/formats/ass/index.js') : null;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.ass')).sort()) {
  const name = file.replace(/\.ass$/, '');
  test(`${name} (.ass -> .ytt)`, { skip: hasAss ? false : 'leitor de .ass ainda não integrado' }, () => {
    const styleOptions = ass.loadStyleOptions(readFileSync(join(dir, 'StyleOptions.xml'), 'utf8'));
    const assDoc = ass.loadAssDocument(readFileSync(join(dir, file)), { styleOptions });
    const actual = new YttDocument(assDoc).save();
    const expected = readFileSync(join(dir, `${name}.ytt`), 'utf8').replace(/^﻿/, '');
    // The port breaks the output into lines (insertLineBreaks); the C# files are on a single line.
    assert.equal(actual, insertLineBreaks(expected));
  });
}
