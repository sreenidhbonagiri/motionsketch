/**
 * Workspace keyboard shortcuts that actually work in the editor.
 * Keep this list in sync with useEditorShortcuts / useWorkspaceCamera /
 * useTransformShortcuts / usePathEditor — the Help sheet reads from here.
 */

export type ShortcutEntry = {
  /** Stable test id suffix: `shortcut-row-${id}` */
  id: string
  keys: string
  action: string
}

/** Global shortcuts shown in the Help sheet (? / Help → Keyboard shortcuts). */
export const EDITOR_SHORTCUTS: ShortcutEntry[] = [
  {
    id: 'play-pause',
    keys: 'Space',
    action: 'Play or pause when the canvas or workspace has focus',
  },
  {
    id: 'record',
    keys: 'Q',
    action: 'Record (asks before replacing an existing path)',
  },
  {
    id: 'pan-hand',
    keys: 'H (hold)',
    action: 'Pan over elements',
  },
  {
    id: 'pan-middle',
    keys: 'Middle-drag',
    action: 'Pan over elements',
  },
  {
    id: 'pan-empty',
    keys: 'Drag empty canvas',
    action: 'Pan the workspace',
  },
  {
    id: 'undo',
    keys: '⌘Z / Ctrl+Z',
    action: 'Undo',
  },
  {
    id: 'redo',
    keys: '⌘⇧Z / Ctrl+Y',
    action: 'Redo',
  },
  {
    id: 'escape',
    keys: 'Escape',
    action: 'Cancel the active gesture, then close open panels',
  },
  {
    id: 'cycle-handles',
    keys: '[ / ]',
    action: 'Select the previous or next path point while editing',
  },
  {
    id: 'shortcuts',
    keys: '?',
    action: 'Open this shortcut list',
  },
]

/**
 * True when a workspace shortcut must yield to native control behavior
 * (Space on buttons, typing in fields, slider/combobox activation).
 */
export function isWorkspaceShortcutBlockedTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest(
    'input, textarea, select, button, a, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [role="option"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"]',
  )
  return el !== null
}

/** @deprecated Prefer isWorkspaceShortcutBlockedTarget — same form-control gate. */
export const isSpacePanBlockedTarget = isWorkspaceShortcutBlockedTarget
