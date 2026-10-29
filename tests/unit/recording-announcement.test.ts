import { describe, expect, it } from 'vitest'
import {
  ARMED_ANNOUNCEMENT,
  ARMED_INSTRUCTION,
  ARMED_MISS_INSTRUCTION,
  CONTINUE_PATH_ANNOUNCEMENT,
  isRecordingChromeAnnouncement,
  RECORDING_ANNOUNCEMENT,
  RECORDING_CONTINUATION_ANNOUNCEMENT,
} from '../../src/lib/modeStatus'

describe('isRecordingChromeAnnouncement', () => {
  it('flags armed/recording chrome copy', () => {
    expect(isRecordingChromeAnnouncement(RECORDING_ANNOUNCEMENT)).toBe(true)
    expect(
      isRecordingChromeAnnouncement(RECORDING_CONTINUATION_ANNOUNCEMENT),
    ).toBe(true)
    expect(isRecordingChromeAnnouncement(ARMED_ANNOUNCEMENT)).toBe(true)
    expect(isRecordingChromeAnnouncement(ARMED_MISS_INSTRUCTION)).toBe(true)
    expect(isRecordingChromeAnnouncement(ARMED_INSTRUCTION)).toBe(true)
    expect(isRecordingChromeAnnouncement(CONTINUE_PATH_ANNOUNCEMENT)).toBe(
      true,
    )
  })

  it('allows project/file feedback through', () => {
    expect(
      isRecordingChromeAnnouncement('Saved in this browser'),
    ).toBe(false)
    expect(
      isRecordingChromeAnnouncement('Project download started.'),
    ).toBe(false)
    expect(
      isRecordingChromeAnnouncement('Could not download the project file.'),
    ).toBe(false)
    expect(
      isRecordingChromeAnnouncement('Path continued. Existing smoothing is now part of the continued path.'),
    ).toBe(false)
  })
})
