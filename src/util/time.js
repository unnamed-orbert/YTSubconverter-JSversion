// Times are integer milliseconds relative to SubtitleDocument.TimeBase (2000-01-01 in the C# code).
// Durations (TimeSpan in C#) are integer milliseconds too. The C# code runs on .NET Framework,
// where DateTime.AddMilliseconds rounds to whole milliseconds, so integers lose nothing.

import { roundHalfAway, toInt } from './numbers.js';

export const TIME_BASE = 0;

const MS_PER_FRAME = 33.36666666666667;

/** DateTime.AddMilliseconds(double) on .NET Framework. */
export function addMs(time, ms) {
  return time + roundHalfAway(ms);
}

export function minTime(a, b) {
  return a < b ? a : b;
}

export function maxTime(a, b) {
  return a > b ? a : b;
}

export function startTimeToFrame(time) {
  if (time <= TIME_BASE) return 0;
  return endTimeToFrame(time) + 1;
}

export function endTimeToFrame(time) {
  return toInt((time - TIME_BASE + 1) / MS_PER_FRAME);
}

export function frameToStartTime(frame) {
  if (frame <= 0) return TIME_BASE;
  return frameToTime(frame) - 16;
}

export function frameToEndTime(frame) {
  return frameToTime(frame) + 16;
}

function frameToTime(frame) {
  if (frame === 0) return TIME_BASE;
  return TIME_BASE + toInt(frame * MS_PER_FRAME);
}

export function roundTimeToFrameCenter(time) {
  if (time <= TIME_BASE) return TIME_BASE;
  return frameToStartTime(startTimeToFrame(time));
}
