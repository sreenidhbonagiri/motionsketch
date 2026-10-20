/**
 * Session prefs for Actors / Sequence chrome: fresh workspace starts collapsed;
 * explicit user toggles are remembered for the tab.
 */
export function readPanelOpenPref(key: string, fallback = false): boolean {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // private mode / quota
  }
  return fallback
}

export function writePanelOpenPref(key: string, open: boolean) {
  try {
    sessionStorage.setItem(key, open ? '1' : '0')
  } catch {
    // ignore
  }
}

export const ACTORS_PANEL_OPEN_KEY = 'motionsketch.actorsPanelOpen'
export const SEQUENCE_PANEL_OPEN_KEY = 'motionsketch.sequencePanelOpen'
