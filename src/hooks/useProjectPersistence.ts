import { useEffect, useState } from 'react'
import {
  getAppPersistenceController,
  type PersistenceStatus,
} from '../lib/persistenceController'
import { TUTORIAL_PRACTICE_SAVE_STATUS } from '../lib/tutorial'

/** Subscribe to save/restore status. Call restoreOnStartup() once from main. */
export function useProjectPersistence() {
  const controller = getAppPersistenceController()
  const [status, setStatus] = useState<PersistenceStatus>(() =>
    controller.getStatus(),
  )
  const [quarantine, setQuarantine] = useState(
    () => controller.getQuarantineRaw() !== null,
  )
  const [practiceSuspended, setPracticeSuspended] = useState(() =>
    controller.isAutosaveSuspended(),
  )

  useEffect(() => {
    return controller.subscribe((next) => {
      setStatus(next)
      setQuarantine(controller.getQuarantineRaw() !== null)
      setPracticeSuspended(controller.isAutosaveSuspended())
    })
  }, [controller])

  return {
    status,
    practiceSuspended,
    isSaveBlocked: controller.isSaveBlocked(),
    hasQuarantine: quarantine,
    saveNow: controller.saveNow,
    discardStoredAndUnblock: controller.discardStoredAndUnblock,
    afterSuccessfulReplace: controller.afterSuccessfulReplace,
    downloadCurrentProject: controller.downloadCurrentProject,
    downloadQuarantine: controller.downloadQuarantine,
  }
}

export function statusLabel(
  status: PersistenceStatus,
  options?: { practice?: boolean },
): string | null {
  // Genuine errors always win over practice copy.
  if (status === 'save-error') {
    return "Couldn't save in this browser (storage full or unavailable)."
  }
  if (status === 'restore-error') {
    return "Couldn't restore the saved project."
  }
  if (options?.practice) {
    return TUTORIAL_PRACTICE_SAVE_STATUS
  }
  if (status === 'saved') {
    return 'Saved in this browser'
  }
  return null
}
