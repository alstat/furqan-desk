/**
 * Search engine behind the Lexical find & replace panel.
 *
 * The editor state is flattened into a single string plus a table that maps
 * each slice of it back to the TextNode it came from, so matching can run as a
 * plain regex scan while replacements still address the model precisely (node
 * key + offset). Block boundaries become '\n' separators, which keeps a query
 * from matching across paragraphs, list items or table cells.
 */
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type ElementNode,
} from 'lexical';

export type FindOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
};

/** A match addressed in the Lexical model rather than the DOM. */
export type FindMatch = {
  anchorKey: string;
  anchorOffset: number;
  focusKey: string;
  focusOffset: number;
  /** Start of the match in the flattened text — used to keep the current match
   *  stable while the document is edited underneath the panel. */
  from: number;
};

type Segment = {key: string; start: number; length: number};

export type FindSnapshot = {text: string; segments: Segment[]};

/** Hard cap so a one-character query in a huge document can't lock the UI. */
export const MAX_MATCHES = 5000;

const BOUNDARY = '\n';
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Flatten the current editor state. Must run inside `editorState.read()` or an
 * `editor.update()` — inside an update it sees the pending state, which is what
 * makes "replace all" able to re-read its own edits.
 */
export function $readSnapshot(): FindSnapshot {
  const segments: Segment[] = [];
  let text = '';

  const pushBoundary = () => {
    if (text.length > 0 && !text.endsWith(BOUNDARY)) text += BOUNDARY;
  };

  const walk = (parent: ElementNode) => {
    for (const child of parent.getChildren()) {
      if ($isTextNode(child)) {
        const value = child.getTextContent();
        // Empty text nodes would create zero-width segments that the offset
        // lookup below could never resolve to, so skip them.
        if (value.length === 0) continue;
        segments.push({key: child.getKey(), start: text.length, length: value.length});
        text += value;
      } else if ($isElementNode(child)) {
        if (!child.isInline()) pushBoundary();
        walk(child);
        if (!child.isInline()) pushBoundary();
      } else {
        // Line breaks and decorators (images, equations, code blocks, Quran
        // blocks, Julia cells…) hold no editable text but do break words.
        pushBoundary();
      }
    }
  };

  walk($getRoot());
  return {text, segments};
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

/** Binary search for the segment covering `offset`; segments are sorted. */
function segmentAt(segments: Segment[], offset: number): Segment | null {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (offset < seg.start) hi = mid - 1;
    else if (offset >= seg.start + seg.length) lo = mid + 1;
    else return seg;
  }
  return null;
}

/** Flat-text offset of a model point, or null if it is outside the text. */
export function offsetOfPoint(
  snapshot: FindSnapshot,
  key: string,
  offset: number,
): number | null {
  for (const seg of snapshot.segments) {
    if (seg.key === key) return seg.start + Math.min(offset, seg.length);
  }
  return null;
}

export function findMatches(
  snapshot: FindSnapshot,
  query: string,
  options: FindOptions,
): FindMatch[] {
  const matches: FindMatch[] = [];
  if (!query) return matches;

  const {text, segments} = snapshot;
  const regex = new RegExp(escapeRegExp(query), options.caseSensitive ? 'g' : 'gi');
  let hit: RegExpExecArray | null;

  while ((hit = regex.exec(text)) !== null) {
    const from = hit.index;
    const to = from + hit[0].length;
    if (hit[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (options.wholeWord && (isWordChar(text[from - 1]) || isWordChar(text[to]))) {
      continue;
    }
    // A match can span text nodes (a bolded word inside a sentence), but never
    // a boundary, since '\n' is not part of any query typed into the panel.
    const startSeg = segmentAt(segments, from);
    const endSeg = segmentAt(segments, to - 1);
    if (!startSeg || !endSeg) continue;

    matches.push({
      anchorKey: startSeg.key,
      anchorOffset: from - startSeg.start,
      focusKey: endSeg.key,
      focusOffset: to - endSeg.start,
      from,
    });
    if (matches.length >= MAX_MATCHES) break;
  }

  return matches;
}

/**
 * Swap one match for `replacement`. Must run inside `editor.update()`.
 * Returns false when the match no longer lines up with the model (the document
 * changed between the scan and the replace).
 */
export function $replaceMatch(match: FindMatch, replacement: string): boolean {
  const anchorNode = $getNodeByKey(match.anchorKey);
  const focusNode = $getNodeByKey(match.focusKey);
  if (!$isTextNode(anchorNode) || !$isTextNode(focusNode)) return false;
  if (
    match.anchorOffset > anchorNode.getTextContentSize() ||
    match.focusOffset > focusNode.getTextContentSize()
  ) {
    return false;
  }

  const selection = $createRangeSelection();
  selection.anchor.set(match.anchorKey, match.anchorOffset, 'text');
  selection.focus.set(match.focusKey, match.focusOffset, 'text');
  $setSelection(selection);

  const active = $getSelection();
  if (!$isRangeSelection(active)) return false;
  active.insertText(replacement);
  return true;
}

/**
 * Replace every match in one update. Matches are applied last-to-first so the
 * edits never shift the offsets of the matches still to come.
 */
export function $replaceAll(
  query: string,
  replacement: string,
  options: FindOptions,
): number {
  const matches = findMatches($readSnapshot(), query, options);
  let replaced = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    if ($replaceMatch(matches[i], replacement)) replaced += 1;
  }
  return replaced;
}
