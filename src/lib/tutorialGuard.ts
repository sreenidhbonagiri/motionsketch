import type { ConfirmFn } from '../hooks/confirmContext'
import { getAppPersistenceController } from './persistenceController'
import {
  TUTORIAL_BLOCKS_REPLACE_BODY,
  TUTORIAL_BLOCKS_REPLACE_CONFIRM,
  TUTORIAL_BLOCKS_REPLACE_TITLE,
} from './tutorial'

/**
 * When tutorial practice has suspended autosave, block project-replacement
 * actions (New, Open, Examples). Returns true when the caller must abort.
 */
export async function blockProjectReplaceDuringTutorial(
  confirm: ConfirmFn,
): Promise<boolean> {
  if (!getAppPersistenceController().isAutosaveSuspended()) return false
  await confirm({
    title: TUTORIAL_BLOCKS_REPLACE_TITLE,
    body: TUTORIAL_BLOCKS_REPLACE_BODY,
    confirmLabel: TUTORIAL_BLOCKS_REPLACE_CONFIRM,
    cancelLabel: 'Back',
    testId: 'tutorial-blocks-replace-confirm',
    confirmTestId: 'btn-tutorial-blocks-replace-ok',
    cancelTestId: 'btn-tutorial-blocks-replace-back',
    bodyTestId: 'tutorial-blocks-replace-copy',
  })
  return true
}
