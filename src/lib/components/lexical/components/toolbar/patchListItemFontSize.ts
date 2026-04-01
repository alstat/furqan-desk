import { $isListItemNode } from '@lexical/list';
import { $isRangeSelection, $isTextNode } from 'lexical';
import type { BaseSelection } from 'lexical';

/**
 * Call this immediately after patchStyleText() to propagate the applied
 * font-size up to the parent ListItemNode so the list marker scales too.
 *
 * patchStyleText already ran so each TextNode in the selection already
 * carries the new font-size; we just read it back and copy it to the <li>.
 */
export function $patchListItemFontSize(selection: BaseSelection): void {
    if (!$isRangeSelection(selection)) return;

    const visited = new Set<string>();

    for (const node of selection.getNodes()) {
        const parent = node.getParent();
        if (!$isListItemNode(parent) || visited.has(parent.getKey())) continue;
        visited.add(parent.getKey());

        // Read the font-size that patchStyleText just wrote onto the text node
        const nodeStyle = $isTextNode(node) ? node.getStyle() : '';
        const match = /font-size\s*:\s*([^;]+)/.exec(nodeStyle ?? '');
        if (!match) continue;

        const newFontSize = match[1].trim();

        // Merge into the list item's existing inline style (preserve other props)
        const existing = (parent.getStyle() ?? '')
            .replace(/font-size\s*:[^;]*(;|$)\s*/g, '')
            .trim()
            .replace(/;$/, '');

        parent.setStyle(
            existing ? `${existing}; font-size: ${newFontSize}` : `font-size: ${newFontSize}`
        );
    }
}
