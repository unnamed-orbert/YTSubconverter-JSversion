import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssDocument, loadStyleOptions, getDefaultStyleOptions } from '../src/formats/ass/index.js';
import { YttDocument } from '../src/formats/ytt.js';

const header = `[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,38,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

test('styles, tags and escape sequences', () => {
  const doc = loadAssDocument(header + 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\b1}Olá{\\i1\\c&H0000FF&}\\Nmundo\n', { styleOptions: null });
  assert.equal(doc.videoDimensions.width, 1280);
  assert.equal(doc.lines.length, 1);
  const [line] = doc.lines;
  assert.equal(line.anchorPoint, 'TopCenter');
  assert.equal(line.text, 'Olá\r\nmundo');
  assert.equal(line.sections[0].bold, true);
  assert.equal(line.sections[1].italic, true);
  assert.equal(line.sections[1].foreColor.r, 255);
  assert.ok(line.sections[0].shadowColors.has('Glow'));
});

test('missing style is an error', () => {
  assert.throws(() => loadAssDocument(header + 'Dialogue: 0,0:00:01.00,0:00:03.00,Nope,,0,0,0,,x\n'), /doesn't exist/);
});

test('glitch karaoke produces glitching frames and converts to .ytt', () => {
  const doc = loadAssDocument(header + 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\ytkt(Glitch)\\k50}ab{\\k50}cd\n');
  assert.ok(doc.lines.length > 2);
  assert.ok(new YttDocument(doc).save().includes('<timedtext'));
});

test('style options XML', () => {
  const options = loadStyleOptions('<StyleOptions><Style><Name>K</Name><ShadowType>SoftShadow Glow</ShadowType><IsKaraoke>true</IsKaraoke><CurrentWordTextColor>#FF0000</CurrentWordTextColor></Style></StyleOptions>');
  assert.equal(options.length, 1);
  assert.deepEqual(options[0].shadowTypes, ['Glow', 'SoftShadow']);
  assert.equal(options[0].isKaraoke, true);
  assert.equal(options[0].currentWordTextColor.r, 255);
  assert.ok(getDefaultStyleOptions().length > 0);
});
