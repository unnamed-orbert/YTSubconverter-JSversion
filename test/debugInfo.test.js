// Heurísticas da tabela de debug do preview (web/debugInfo.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Line, Section } from '../src/model.js';
import { Color } from '../src/util/color.js';
import { ShadowType } from '../src/enums.js';
import { buildTracks, describeEffects, groupLayers, guessAssTags } from '../web/debugInfo.js';

function frame(start, end, text, alpha, { x = 640, y = 700, shadow = ShadowType.Glow, rgb = [255, 255, 255] } = {}) {
  const s = new Section(text);
  s.font = 'Roboto';
  s.foreColor = Color.fromArgb(alpha, ...rgb);
  s.shadowColors.set(shadow, Color.fromArgb(254, 0, 0, 0));
  const line = new Line(start, end, [s]);
  line.position = { x, y };
  return line;
}

test('quadros seguidos com opacidade subindo e descendo viram uma trilha com \\fad', () => {
  const lines = [
    frame(0, 100, 'Oi', 64), frame(100, 200, 'Oi', 160), frame(200, 1000, 'Oi', 254),
    frame(1000, 1100, 'Oi', 128), frame(1100, 1200, 'Oi', 30),
    frame(1200, 1500, 'Outra', 254),
  ];
  const { trackOf, tracks } = buildTracks(lines);
  assert.equal(trackOf[0], trackOf[4]);
  assert.notEqual(trackOf[0], trackOf[5]);
  const info = tracks[trackOf[0]].info;
  assert.equal(info.frames, 5);
  assert.equal(info.fadeIn, 200);
  assert.equal(info.fadeOut, 200);
  assert.match(guessAssTags(lines, [0], info), /\\fad\(200,200\)/);
  const keys = describeEffects(lines, [3], tracks[trackOf[3]]).map((e) => e.key);
  assert.deepEqual(keys.slice(0, 4), ['dbgFrames', 'dbgFadeIn', 'dbgFadeOut', 'dbgOpacityNow']);
});

test('movimento e mudança de cor viram \\move e \\t(\\c)', () => {
  const lines = [0, 1, 2, 3].map((i) => frame(i * 50, i * 50 + 50, 'Vai', 254, { x: 100 + i * 20, rgb: [255, i * 80, 0] }));
  const { trackOf, tracks } = buildTracks(lines);
  const info = tracks[trackOf[0]].info;
  assert.deepEqual([info.move.from.x, info.move.to.x], [100, 160]);
  const tags = guessAssTags(lines, [0], info);
  assert.match(tags, /\\move\(100,700,160,700\)/);
  assert.match(tags, /\\c&H0000FF&\\t\(\\c&H00F0FF&\)/);
});

test('camadas do mesmo texto que só mudam a sombra ficam num grupo; cópias ao mesmo tempo não viram trilha', () => {
  const lines = [
    frame(0, 100, 'A', 254, { shadow: ShadowType.Glow }),
    frame(0, 100, 'A', 254, { shadow: ShadowType.SoftShadow }),
    frame(0, 100, 'A', 254, { shadow: ShadowType.Glow, x: 300 }),
  ];
  assert.deepEqual(groupLayers(lines, [0, 1, 2]), [[0, 1], [2]]);
  const { trackOf } = buildTracks(lines);
  assert.notEqual(trackOf[0], trackOf[2]);
  const tags = guessAssTags(lines, [0, 1], null);
  assert.match(tags, /\\3c&H000000&\\bord2\\4c&H000000&\\shad2/);
});

test('opacidade diferente em cada trecho é apontada como fade letra por letra', () => {
  const line = frame(0, 100, 'C', 192);
  for (const [text, a] of [['o', 128], ['m', 64]]) {
    const s = line.sections[0].clone();
    s.text = text;
    s.foreColor = Color.fromArgb(a, 255, 255, 255);
    line.sections.push(s);
  }
  const { tracks, trackOf } = buildTracks([line]);
  const effects = describeEffects([line], [0], tracks[trackOf[0]]);
  assert.deepEqual(effects.find((e) => e.key === 'dbgAlphaSteps').params, { n: 3, from: 75, to: 25 });
});
