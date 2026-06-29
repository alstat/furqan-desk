import {
	$getSelection,
	$isRangeSelection,
	$isRootOrShadowRoot,
	type ElementNode,
	type LexicalNode
} from 'lexical';
import { $findMatchingParent } from '@lexical/utils';

/** Read one declaration's value from a `cssText`-style string ("a: 1; b: 2;"). */
export function getStyleProperty(style: string, property: string): string {
	if (!style) return '';
	for (const decl of style.split(';')) {
		const idx = decl.indexOf(':');
		if (idx === -1) continue;
		if (decl.slice(0, idx).trim() === property) return decl.slice(idx + 1).trim();
	}
	return '';
}

/**
 * Return `style` with `property` set to `value`, replacing an existing
 * declaration or appending a new one. An empty `value` removes the property.
 */
export function setStyleProperty(style: string, property: string, value: string): string {
	const decls = (style ?? '')
		.split(';')
		.map((d) => d.trim())
		.filter(Boolean)
		.filter((d) => d.slice(0, d.indexOf(':')).trim() !== property);
	if (value) decls.push(`${property}: ${value}`);
	return decls.length ? decls.join('; ') + ';' : '';
}

/** Top-level block element containing `node` (paragraph, heading, list item, …). */
function $getTopLevelBlock(node: LexicalNode): ElementNode | null {
	if (node.getKey() === 'root') return null;
	const element = $findMatchingParent(node, (e) => {
		const parent = e.getParent();
		return parent !== null && $isRootOrShadowRoot(parent);
	});
	return (element ?? node.getTopLevelElementOrThrow()) as ElementNode;
}

/**
 * Apply `line-height` as a block-level style to every top-level block in the
 * current selection. Block-level (rather than inline on text nodes) so the
 * value replaces the paragraph's own line-height instead of being floored by
 * it — letting values below the editor's default (e.g. single, 1.5) take
 * effect. Must run inside an `editor.update()`.
 */
export function $patchBlockLineHeight(lineHeight: string): void {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return;
	const blocks = new Set<ElementNode>();
	for (const node of selection.getNodes()) {
		const block = $getTopLevelBlock(node);
		if (block) blocks.add(block);
	}
	const anchorBlock = $getTopLevelBlock(selection.anchor.getNode());
	if (anchorBlock) blocks.add(anchorBlock);
	for (const block of blocks) {
		if (typeof block.getStyle !== 'function') continue;
		block.setStyle(setStyleProperty(block.getStyle(), 'line-height', lineHeight));
	}
}

/** Block-level `line-height` for the top-level block of the selection anchor. */
export function $getSelectionBlockLineHeight(): string {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return '';
	const block = $getTopLevelBlock(selection.anchor.getNode());
	if (!block || typeof block.getStyle !== 'function') return '';
	return getStyleProperty(block.getStyle(), 'line-height');
}
