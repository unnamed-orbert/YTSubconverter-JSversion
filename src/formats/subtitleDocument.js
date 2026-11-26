// SubtitleDocument.cs: base class with the operations shared by every format.

import { LineMergeType } from '../enums.js';
import { Section, SectionFormatComparer } from '../model.js';
import { AnchorPointUtil, binarySearchIndexAtOrAfter } from '../util/misc.js';
import { f32 } from '../util/numbers.js';
import { minTime, TIME_BASE } from '../util/time.js';

export class SubtitleDocument {
  static TimeBase = TIME_BASE;

  /** @param {SubtitleDocument} [doc] copy the lines (not cloned, like the C# code) of another document */
  constructor(doc) {
    /** @type {{width: number, height: number}} */
    this.videoDimensions = { width: 1280, height: 720 };
    this.lineMergeType = LineMergeType.MoveNew;
    /** @type {import('../model.js').Line[]} */
    this.lines = [];

    if (doc) {
      this.videoDimensions = { ...doc.videoDimensions };
      this.lineMergeType = doc.lineMergeType;
      this.lines.push(...doc.lines.filter((l) => l.sections.some((s) => s.text.length > 0)));
    }
  }

  sortLines() {
    this.lines = [...this.lines].sort((a, b) => a.start - b.start);
  }

  mergeSimultaneousLines() {
    // Array.prototype.sort is stable, like LINQ's OrderBy
    const lines = this.lines.filter((l) => l.start < l.end).sort((a, b) => a.start - b.start);

    let i = 0;
    while (i < lines.length) {
      if (lines[i].position != null) {
        i++;
        continue;
      }

      const firstLine = lines[i];
      let secondLine = null;
      let j = i + 1;
      while (j < lines.length && lines[j].start < lines[i].end) {
        if (lines[j].position == null && lines[j].anchorPoint === firstLine.anchorPoint) {
          secondLine = lines[j];
          break;
        }
        j++;
      }

      if (secondLine == null) {
        i++;
        continue;
      }

      lines.splice(j, 1);
      lines.splice(i, 1);

      if (firstLine.start < secondLine.start)
        insertConcatenatedLine(lines, i, firstLine.start, secondLine.start, false, firstLine);

      const overlapEnd = minTime(firstLine.end, secondLine.end);
      if (AnchorPointUtil.isBottomAligned(firstLine.anchorPoint) !== (this.lineMergeType === LineMergeType.MoveExisting))
        insertConcatenatedLine(lines, i, secondLine.start, overlapEnd, false, secondLine, firstLine);
      else
        insertConcatenatedLine(lines, i, secondLine.start, overlapEnd, false, firstLine, secondLine);

      if (firstLine.end < secondLine.end)
        insertConcatenatedLine(lines, i, firstLine.end, secondLine.end, true, secondLine);
      else if (secondLine.end < firstLine.end)
        insertConcatenatedLine(lines, i, secondLine.end, firstLine.end, false, firstLine);
    }

    this.lines = lines;
  }

  mergeIdenticallyFormattedSections() {
    for (const line of this.lines) SubtitleDocument.mergeIdenticallyFormattedSections(line);
  }

  static mergeIdenticallyFormattedSections(line) {
    const comparer = new SectionFormatComparer();
    let i = 0;
    while (i < line.sections.length - 1) {
      const a = line.sections[i];
      const b = line.sections[i + 1];
      if (comparer.equals(a, b) && a.startOffset === b.startOffset) {
        a.text += b.text;
        line.sections.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  }

  static moveLineBreaksToSeparateSections(line) {
    for (let sectionIdx = line.sections.length - 1; sectionIdx >= 0; sectionIdx--) {
      const section = line.sections[sectionIdx];
      const parts = section.text.match(/[\r\n]+|[^\r\n]+/g);
      if (!parts || parts.length === 1) continue;

      line.sections.splice(sectionIdx, 1);
      parts.forEach((part, i) => {
        const subSection = section.clone();
        subSection.text = part;
        line.sections.splice(sectionIdx + i, 0, subSection);
      });
    }
  }

  /**
   * Assigns IDs (starting at 1) to distinct objects. `keyOf` maps an object to a string that is equal
   * for objects the C# IEqualityComparer considers equal. Returns a Map<key, id> plus the representatives in order.
   */
  static extractAttributes(objects, keyOf) {
    const ids = new Map();
    const items = [];
    for (const obj of objects) {
      const key = keyOf(obj);
      if (!ids.has(key)) {
        ids.set(key, 1 + ids.size);
        items.push({ id: ids.get(key), item: obj });
      }
    }
    return { ids, items, idOf: (obj) => ids.get(keyOf(obj)) };
  }

  closeGaps() {
    const startTimes = [...new Set(this.lines.map((l) => l.start))].sort((a, b) => a - b);

    for (const line of this.lines) {
      let endTimeIdx = binarySearchIndexAtOrAfter(startTimes, line.end);
      const gapBefore = endTimeIdx > 0 ? line.end - startTimes[endTimeIdx - 1] : Infinity;
      const gapAfter = endTimeIdx < startTimes.length ? startTimes[endTimeIdx] - line.end : Infinity;

      if (gapBefore < 50 && gapBefore < gapAfter) endTimeIdx--;
      else if (gapAfter < 50 && gapAfter <= gapBefore);
      else continue;

      line.end = startTimes[endTimeIdx];
    }
  }

  getDefaultPosition(anchorPoint) {
    const { width, height } = this.videoDimensions;
    const left = f32(width * f32(0.02));
    const center = f32(width / 2);
    const right = f32(width * f32(0.98));
    const top = f32(height * f32(0.02));
    const middle = f32(height / 2);
    const bottom = f32(height * f32(0.98));

    switch (anchorPoint) {
      case 'TopLeft': return { x: left, y: top };
      case 'TopCenter': return { x: center, y: top };
      case 'TopRight': return { x: right, y: top };
      case 'MiddleLeft': return { x: left, y: middle };
      case 'Center': return { x: center, y: middle };
      case 'MiddleRight': return { x: right, y: middle };
      case 'BottomLeft': return { x: left, y: bottom };
      case 'BottomCenter': return { x: center, y: bottom };
      case 'BottomRight': return { x: right, y: bottom };
      default: throw new RangeError(`Invalid anchor point: ${anchorPoint}`);
    }
  }

  /** Serializes the document. Subclasses that support writing override this. */
  save() {
    throw new Error(`${this.constructor.name} does not support saving`);
  }
}

function insertConcatenatedLine(targetList, baseIndex, start, end, afterEqualStart, ...sourceLines) {
  const line = sourceLines[0].clone();
  for (let i = 1; i < sourceLines.length; i++) {
    if (sourceLines[i].sections.length === 0) continue;
    const firstNewSectionIdx = line.sections.length;
    line.sections.push(...sourceLines[i].sections.map((s) => s.clone()));
    line.sections[firstNewSectionIdx].text = '\r\n' + line.sections[firstNewSectionIdx].text;
  }

  line.start = start;
  line.end = end;

  let index = baseIndex;
  while (index < targetList.length && (afterEqualStart ? targetList[index].start <= start : targetList[index].start < start))
    index++;

  targetList.splice(index, 0, line);
}

export { Section };
