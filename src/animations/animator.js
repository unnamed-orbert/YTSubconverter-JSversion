// Port of Animations/Animator.cs: turns a line with animations into a sequence of static lines
// (one per two frames while an animation is running).
// Generators are used on purpose to keep the lazy evaluation order of the C# iterators.

import { Range, SortedNumberMap } from '../util/misc.js';
import { f32 } from '../util/numbers.js';
import { endTimeToFrame, frameToEndTime, frameToStartTime, roundTimeToFrameCenter, startTimeToFrame } from '../util/time.js';
import { MoveAnimation } from './animations.js';

const FRAME_STEP_SIZE = 2;

/**
 * @param {import('../formats/subtitleDocument.js').SubtitleDocument} document
 * @param {import('../formats/ass/assModel.js').AssLine} originalLine
 * @returns {Generator<import('../formats/ass/assModel.js').AssLine>}
 */
export function* expandAnimations(document, originalLine) {
  const anims = getAnimationsWithSectionIndex(originalLine);
  if (anims.length === 0) {
    yield originalLine;
    return;
  }

  const animClusters = clusterAnimations(originalLine, anims);
  let lastLine = createInitialLine(originalLine, anims);
  if (animClusters.count === 0 || animClusters.values[0].range.start > lastLine.start) yield lastLine;

  for (let i = 0; i < animClusters.count; i++) {
    const { range: clusterRange, anims: clusterAnims } = animClusters.values[i];
    for (const frameLine of createFrameLines(document, lastLine, clusterRange, clusterAnims)) {
      lastLine.end = frameLine.start;
      yield (lastLine = frameLine);
    }

    const interAnimStart = clusterRange.end;
    const interAnimEnd = i < animClusters.count - 1 ? animClusters.values[i + 1].range.start : originalLine.end;
    if (interAnimEnd > interAnimStart)
      yield (lastLine = createPostAnimationClusterLine(originalLine, lastLine, interAnimStart, interAnimEnd, clusterAnims));
  }

  lastLine.end = originalLine.end;
}

function getAnimationsWithSectionIndex(line) {
  const animations = [];
  for (const anim of line.animations) if (anim instanceof MoveAnimation) animations.push({ animation: anim, sectionIndex: -1 });
  for (const anim of line.animations) if (!(anim instanceof MoveAnimation)) animations.push({ animation: anim, sectionIndex: -1 });

  line.sections.forEach((section, i) => {
    for (const anim of section.animations) animations.push({ animation: anim, sectionIndex: i });
  });
  return animations;
}

/** SortedList<TimeRange, List<...>>: TimeRange compares by start only, so ranges with the same start share an entry. */
function clusterAnimations(line, allAnims) {
  const clusterRanges = getAnimationClusterTimeRanges(allAnims.map((a) => a.animation));
  const lineRange = new Range(line.start, line.end);
  const clusters = new SortedNumberMap();

  for (const clusterRange of clusterRanges) {
    if (!clusterRange.overlaps(lineRange)) continue;

    const clusterAnims = allAnims.filter(
      (a) => clusterRange.contains(a.animation.startTime) && a.animation.endTime > a.animation.startTime,
    );

    clusterRange.intersectWith(lineRange);
    clusterRange.start = roundTimeToFrameCenter(clusterRange.start);
    clusterRange.end = roundTimeToFrameCenter(clusterRange.end);

    const idx = clusters.indexOfKey(clusterRange.start);
    if (idx >= 0) clusters.values[idx].anims.push(...clusterAnims);
    else clusters.set(clusterRange.start, { range: clusterRange, anims: clusterAnims });
  }
  return clusters;
}

function getAnimationClusterTimeRanges(animations) {
  const clusterRanges = [];
  for (const animation of animations) {
    const animationRange = new Range(animation.startTime, animation.endTime);
    for (let i = clusterRanges.length - 1; i >= 0; i--) {
      if (clusterRanges[i].overlaps(animationRange)) {
        animationRange.unionWith(clusterRanges[i]);
        clusterRanges.splice(i, 1);
      }
    }
    clusterRanges.push(animationRange);
  }
  return clusterRanges;
}

/** Stable sort (LINQ OrderBy / OrderByDescending). */
function orderBy(items, key, descending = false) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const diff = descending ? key(y.item) - key(x.item) : key(x.item) - key(y.item);
      return diff !== 0 ? diff : x.index - y.index;
    })
    .map((x) => x.item);
}

function createInitialLine(originalLine, anims) {
  const newLine = originalLine.clone();
  newLine.start = roundTimeToFrameCenter(newLine.start);

  const finished = anims.filter((a) => a.animation.endTime < originalLine.start);
  for (const anim of orderBy(finished, (a) => a.animation.endTime)) applyAnimation(newLine, anim, 1);

  const future = anims.filter((a) => a.animation.affectsPast && a.animation.startTime >= originalLine.start);
  for (const anim of orderBy(future, (a) => a.animation.startTime, true)) applyAnimation(newLine, anim, 0);

  return newLine;
}

function createPostAnimationClusterLine(originalLine, lastLine, start, end, animsWithSection) {
  const newLine = lastLine.clone();
  newLine.start = start;
  newLine.end = end;
  for (const animWithSection of orderBy(animsWithSection, (a) => a.animation.endTime)) {
    if (animWithSection.animation.affectsText) resetText(newLine, originalLine);
    applyAnimation(newLine, animWithSection, 1);
  }
  return newLine;
}

function* createFrameLines(document, originalLine, timeRange, animations) {
  const rangeStartFrame = startTimeToFrame(timeRange.start);
  const rangeEndFrame = endTimeToFrame(timeRange.end);
  const subStepFrames = (rangeEndFrame + 1 - rangeStartFrame) % FRAME_STEP_SIZE;
  const lastIterationFrame = rangeEndFrame + 1 - subStepFrames - FRAME_STEP_SIZE;
  const needTextReset = animations.some((a) => a.animation.affectsText);

  let frameLine = originalLine;
  let basePosition = originalLine.position ?? document.getDefaultPosition(originalLine.anchorPoint);

  for (let frame = rangeStartFrame; frame <= lastIterationFrame; frame += FRAME_STEP_SIZE) {
    frameLine = frameLine.clone();
    frameLine.start = frameToStartTime(frame);
    frameLine.end = frame < lastIterationFrame ? frameToEndTime(frame + FRAME_STEP_SIZE - 1) : timeRange.end;
    frameLine.position = basePosition;
    if (needTextReset) resetText(frameLine, originalLine);

    const interpFrame = f32(frame + (FRAME_STEP_SIZE - 1) / 2);
    for (const animWithSection of animations) {
      const animStartFrame = startTimeToFrame(animWithSection.animation.startTime);
      const animEndFrame = endTimeToFrame(animWithSection.animation.endTime);
      if (interpFrame >= animStartFrame && interpFrame < animEndFrame) {
        const t = f32(f32(interpFrame - animStartFrame) / (animEndFrame - animStartFrame));
        applyAnimation(frameLine, animWithSection, t);
      } else if (interpFrame >= animEndFrame && interpFrame < animEndFrame + FRAME_STEP_SIZE) {
        applyAnimation(frameLine, animWithSection, 1);
        if (animWithSection.animation instanceof MoveAnimation) basePosition = frameLine.position;
      }
    }

    yield frameLine;
  }
}

function applyAnimation(line, animWithSectionIdx, t) {
  const section = animWithSectionIdx.sectionIndex >= 0 ? line.sections[animWithSectionIdx.sectionIndex] : null;
  animWithSectionIdx.animation.apply(line, section, t);
}

function resetText(frameLine, originalLine) {
  for (let i = 0; i < frameLine.sections.length; i++) frameLine.sections[i].text = originalLine.sections[i].text;
}
