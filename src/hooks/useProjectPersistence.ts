import { useEffect, useState } from 'react'
import {
  getAppPersistenceController,
  type PersistenceStatus,
} from '../lib/persistenceController'

/** Subscribe to save/restore status. Call restoreOnStartup() once from main. */
export function useProjectPersistence() {
  const controller = getAppPersistenceController()
  const [status, setStatus] = useState<PersistenceStatus>(() =>
    controller.getStatus(),
  )
  const [quarantine, setQuarantine] = useState(
    () => controller.getQuarantineRaw() !== null,
  )

  useEffect(() => {
    return controller.subscribe((next) => {
      setStatus(next)
      setQuarantine(controller.getQuarantineRaw() !== null)
    })
  }, [controller])

  return {
    status,
    isSaveBlocked: controller.isSaveBlocked(),
    hasQuarantine: quarantine,
    saveNow: controller.saveNow,
    discardStoredAndUnblock: controller.discardStoredAndUnblock,
    afterSuccessfulReplace: controller.afterSuccessfulReplace,
    downloadCurrentProject: controller.downloadCurrentProject,
    downloadQuarantine: controller.downloadQuarantine,
  }
}

export function statusLabel(status: PersistenceStatus): string | null {
  switch (status) {
    case 'saved':
      return 'Saved in this browser'
    case 'save-error':
      return "Couldn't save in this browser (storage full or unavailable)."
    case 'restore-error':
      return "Couldn't restore the saved project."
    default:
      return null
  }
}
