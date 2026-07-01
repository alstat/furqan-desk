import { modifyText } from "$lib/functions/toolbar/toolBarFunctions";
import { activeClass } from "../config";

export let actionBtnStyle =
  "cursor-pointer rounded-full bg-brand-sand-100 dark:bg-[#292c3c] hover:bg-brand-sand-200 dark:hover:bg-[#363a4f] active:bg-brand-sand-400 dark:active:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] p-2 shadow-sm";
export let toolBarBtnStyle =
  "cursor-pointer hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] active:bg-brand-sand-200 dark:active:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] rounded-md";
export let activeBtnStyle = "bg-brand-sand-200 dark:bg-[#414559] rounded-md";
export let selectBtnStyle =
  "border-1 block cursor-pointer rounded-md border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#292c3c] p-1 text-center text-sm text-brand-gold-600 dark:text-[#e5c890]";
export let icons = {
  undo: "fluent:arrow-undo-16-filled",
  redo: "fluent:arrow-redo-16-filled",
  // format
  bold: "fluent:text-bold-16-filled",
  italic: "fluent:text-italic-16-filled",
  underline: "fluent:text-underline-16-filled",
  strikethrough: "fluent:text-strikethrough-16-filled",
  superscript: "fluent:text-superscript-16-filled",
  subscript: "fluent:text-subscript-16-filled",
  link: "fluent:link-16-filled",
  clearFormat: "material-symbols:format-clear",
  highlight: "material-symbols:ink-highlighter",
  // alignment
  left: "icon-park-outline:align-text-left",
  center: "icon-park-outline:align-text-center",
  right: "icon-park-outline:align-text-right",
  justify: "icon-park-outline:align-text-both",
  // indent/outdent
  indent: "icon-park-outline:indent-right",
  outdent: "icon-park-outline:indent-left",
  //
  dropdown: "gridicons:dropdown",
  bullet: "fluent:text-bullet-list-16-filled",
  list: "fluent:text-number-list-16-filled",
  tripleDots: "tabler:dots",
  //
  fontFamily: "radix-icons:font-family",
  hr: "fluent:line-horizontal-1-16-filled",
  image: "fluent:image-add-20-regular",
  insert: "gg:insert-after-r",
  math: "tabler:math",
  table: "fluent:table-add-20-regular",
  // ai-btns
  toc: "carbon:table-of-contents",
  info: "icon-park-outline:info",
  comment: "iconamoon:comment-dots",
  ideas: "ri:ai-generate",
  // format block
  paragraph: "mdi:format-paragraph",
  heading: "dashicons:heading",
  checklist: "ic:round-checklist",
  quote: "fluent:text-quote-16-filled",
  code: "fluent:code-16-filled",
  lineSpacing: "material-symbols:format-line-spacing",
};

// export interface Tool {
// 	icon: string;
// 	toolTip: string;
// 	action: CallableFunction | MouseEvent;
// 	id: string;
// 	vr?: boolean;
// 	class?: string;
// 	active?: string;
// }

// export interface ToolDropdown {
// 	toolTip: string;
// 	label: string;
// 	options: [string, string][] | string[];
// 	action: CallableFunction;
// 	id: string;
// 	class?: string;
// }

// export const leadUndoRedo: Tool[] = [
// 	// Undo and Redo
// 	{
// 		icon: 'fluent:arrow-undo-16-filled',
// 		toolTip: 'Undo',
// 		action: () => modifyText('undo'),
// 		id: 'undo'
// 	},
// 	{
// 		icon: 'fluent:arrow-redo-16-filled',
// 		toolTip: 'Redo',
// 		action: () => modifyText('redo'),
// 		id: 'redo',
// 		vr: true
// 	}
// ];

// export const leadDropdown: ToolDropdown[] = [
// 	{
// 		toolTip: 'Font Family',
// 		label: 'font-family',
// 		options: [
// 			'Quicksand',
// 			'Arial',
// 			'Helvetica',
// 			'Verdana',
// 			'Times New Roman',
// 			'Georgia',
// 			'Courier New'
// 		],
// 		action: (value: string) => modifyText('fontName', false, value),
// 		id: 'font-family',
// 		class: 'dropdown'
// 	},
// 	{
// 		toolTip: 'Font Styles',
// 		label: 'font-styles',
// 		options: [
// 			['N', 'Paragraph'],
// 			['H1', 'Title'],
// 			['H2', 'Subtitle'],
// 			['H3', 'Heading 1'],
// 			['H4', 'Heading 2'],
// 			['H5', 'Heading 3']
// 		],
// 		action: (value: string) => modifyText('formatBlock', false, value),
// 		id: 'font-styles',
// 		class: 'dropdown'
// 	}
// ];

// export let formatBlock = {
// 	Paragraph: 'N',
// 	Title: 'H1',
// 	Subtitle: 'H2',
// 	Heading_1: 'H3',
// 	Heading_2: 'H4',
// 	Heading_3: 'H5'
// };

// export const leadToolBar: Tool[] = [
// 	{
// 		icon: 'fluent:text-bold-16-filled',
// 		toolTip: 'Bold',
// 		action: () => modifyText('bold'),
// 		class: 'format',
// 		id: 'bold'
// 	},
// 	{
// 		icon: 'fluent:text-italic-16-filled',
// 		toolTip: 'Italic',
// 		action: () => modifyText('italic'),
// 		class: 'format',
// 		id: 'italic'
// 	},
// 	{
// 		icon: 'fluent:text-underline-16-filled',
// 		toolTip: 'Underline',
// 		action: () => modifyText('underline'),
// 		class: 'format',
// 		id: 'underline'
// 	},
// 	{
// 		icon: 'fluent:text-strikethrough-16-filled',
// 		toolTip: 'Strikethrough',
// 		action: () => modifyText('strikethrough'),
// 		vr: true,
// 		class: 'format',
// 		id: 'strikethrough'
// 	},
// 	// subscript and superscript
// 	{
// 		icon: 'fluent:text-subscript-16-filled',
// 		toolTip: 'Subscript',
// 		action: () => modifyText('subscript'),
// 		class: 'script',
// 		id: 'subscript'
// 	},
// 	{
// 		icon: 'fluent:text-superscript-16-filled',
// 		toolTip: 'Superscript',
// 		action: () => modifyText('superscript'),
// 		vr: true,
// 		class: 'script',
// 		id: 'superscript'
// 	},
// 	{
// 		icon: 'icon-park-outline:align-text-left',
// 		toolTip: 'Justify Left',
// 		action: () => modifyText('justifyLeft'),
// 		class: 'align',
// 		id: 'justlify-left',
// 		active: activeClass
// 	},
// 	{
// 		icon: 'icon-park-outline:align-text-center',
// 		toolTip: 'Justify Center',
// 		action: () => modifyText('justifyCenter'),
// 		class: 'align',
// 		id: 'justify-center'
// 	},
// 	{
// 		icon: 'icon-park-outline:align-text-right',
// 		toolTip: 'Justify Right',
// 		action: () => modifyText('justifyRight'),
// 		class: 'align',
// 		id: 'justify-right'
// 	},
// 	{
// 		icon: 'icon-park-outline:align-text-both',
// 		toolTip: 'Justify Full',
// 		action: () => modifyText('justifyFull'),
// 		vr: true,
// 		class: 'align',
// 		id: 'justify-full'
// 	},
// 	// List
// 	{
// 		icon: 'fluent:text-bullet-list-16-filled',
// 		toolTip: 'Insert Unordered List',
// 		action: () => modifyText('insertUnorderedList'),
// 		id: 'list'
// 	},
// 	{
// 		icon: 'fluent:text-number-list-16-filled',
// 		toolTip: 'Insert Ordered List',
// 		action: () => modifyText('insertOrderedList'),
// 		vr: true,
// 		id: 'list'
// 	},
// 	// Indentation
// 	{
// 		icon: 'icon-park-outline:indent-left',
// 		toolTip: 'Right Indent',
// 		action: () => modifyText('outdent'),
// 		class: 'spacing',
// 		id: 'right-indent'
// 	},
// 	{
// 		icon: 'icon-park-outline:indent-right',
// 		toolTip: 'Left Indent',
// 		action: () => modifyText('indent'),
// 		vr: true,
// 		class: 'spacing',
// 		id: 'left-indent'
// 	},
// 	// Image, Table, and Horizontal Line
// 	{
// 		icon: 'fluent:image-add-20-regular',
// 		toolTip: 'Insert Image',
// 		action: console.log,
// 		id: 'insert-image'
// 	},
// 	{
// 		icon: 'fluent:table-add-20-regular',
// 		toolTip: 'Insert Table',
// 		action: console.log,
// 		id: 'insert-table'
// 	},
// 	{
// 		icon: 'fluent:line-horizontal-1-16-filled',
// 		toolTip: 'Insert Horizontal Line',
// 		action: console.log,
// 		vr: true,
// 		id: 'insert-hr'
// 	},
// 	// Quote, Code, and Math
// 	{
// 		icon: 'fluent:text-quote-16-filled',
// 		toolTip: 'Insert Quote',
// 		action: () => console.log('insert code'),
// 		id: 'insert-quote'
// 	},
// 	{
// 		icon: 'fluent:code-16-filled',
// 		toolTip: 'Insert Code Block',
// 		action: () => console.log('insert code'),
// 		id: 'insert-code'
// 	},
// 	{
// 		icon: 'tabler:math',
// 		toolTip: 'Insert LaTeX Math Block',
// 		action: () => console.log('insert code'),
// 		vr: true,
// 		id: 'insert-latex'
// 	},
// 	// Link
// 	{
// 		icon: 'fluent:link-16-filled',
// 		toolTip: 'Add Link',
// 		action: () => link('createLink'),
// 		id: 'add-link'
// 	},
// 	{
// 		icon: 'fluent:link-dismiss-16-filled',
// 		toolTip: 'Remove Link',
// 		action: () => link('unlink'),
// 		vr: true,
// 		id: 'remove-link'
// 	}
// ];

// export const trailToolBar: Tool[] = [
// 	{
// 		icon: 'carbon:table-of-contents',
// 		toolTip: 'Table of Content',
// 		action: console.log,
// 		id: 'toc'
// 	},
// 	{
// 		icon: 'icon-park-outline:info',
// 		toolTip: 'Writing Info',
// 		action: console.log,
// 		id: 'info'
// 	},
// 	{
// 		icon: 'iconamoon:comment-dots',
// 		toolTip: 'Comments',
// 		action: console.log,
// 		vr: true,
// 		id: 'comments'
// 	},
// 	{
// 		icon: 'ri:ai-generate',
// 		toolTip: 'Ideas',
// 		action: console.log,
// 		id: 'ideas'
// 	}
// ];
