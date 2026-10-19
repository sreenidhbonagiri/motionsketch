import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { buildReactPackage } from '../../src/core/export/reactPackage'
import { createSceneActor } from '../../src/core/sceneActor'
import type { PlaybackTrigger, Project } from '../../src/core/types'
import { ensureEditor, openPanel, recordSimplePath,
  expandExportOtherWays,
} from './helpers'
import {
  makeActor,
  makeProject,
  makeRecording,
} from '../unit/helpers/project'

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/react-package-consumer',
)

/** Spawn Vite via node directly — `npx` leaves orphan listeners after SIGTERM. */
const VITE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/vite/bin/vite.js',
)

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

type ConsumerHost = {
  sceneRel: string
  sceneDir: string
  port: number
  url: string
  proc: ChildProcess | null
}

const hosts = new Map<string, ConsumerHost>()

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to reserve an ephemeral port'))
        return
      }
      const { port } = addr
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function waitUntilPortFree(port: number, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isPortFree(port)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`Port ${port} still occupied after stopping consumer Vite`)
}

function killProcessTree(pid: number, signal: NodeJS.Signals) {
  try {
    // Detached spawn → new process group; negative pid signals the group.
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

function hostFor(projectName: string): ConsumerHost {
  let host = hosts.get(projectName)
  if (host) return host
  const sceneRel = `scene-${projectName}`
  host = {
    sceneRel,
    sceneDir: join(FIXTURE_ROOT, sceneRel),
    port: 0,
    url: '',
    proc: null,
  }
  hosts.set(projectName, host)
  return host
}

function writeReactPackageScene(host: ConsumerHost, project: Project) {
  const result = buildReactPackage(project)
  if (!result.ok) throw new Error(result.error)
  mkdirSync(host.sceneDir, { recursive: true })
  mkdirSync(join(host.sceneDir, 'assets'), { recursive: true })
  for (const file of result.files) {
    const target = join(host.sceneDir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.bytes)
  }
  return result
}

function makeTriggerProject(trigger: PlaybackTrigger): Project {
  return makeProject({
    name: `React ${trigger}`,
    stageAspect: 1.6,
    actors: [
      createSceneActor({
        appearance: {
          kind: 'text',
          width: 0.22,
          height: 0.22,
          borderRadius: 0.1,
          color: '#0f766e',
          image: null,
          text: {
            content: 'React\nexport',
            fontSize: 0.055,
            fontWeight: 700,
            align: 'center',
            fontFamily: 'system',
          },
        },
        recording: makeRecording(12),
      }),
      makeActor({
        id: 'img1',
        name: 'Mark',
        recording: makeRecording(12),
        appearance: {
          kind: 'image',
          width: 0.14,
          height: 0.14,
          borderRadius: 0,
          color: '#64748b',
          image: {
            mimeType: 'image/png',
            dataUrl: TINY_PNG,
            naturalWidth: 1,
            naturalHeight: 1,
            label: 'Dot',
          },
          text: null,
        },
      }),
    ],
    playback: {
      durationMs: 1200,
      loop: trigger === 'page-load',
      loopMode: 'repeat',
      trigger,
    },
  })
}

async function loadConsumer(
  page: Page,
  url: string,
  trigger: PlaybackTrigger,
) {
  // Bust Vite module cache after rewriting the generated scene on disk.
  await page.goto(`${url}?scene=${encodeURIComponent(trigger)}&t=${Date.now()}`, {
    waitUntil: 'networkidle',
  })
  await expect(page.getByTestId('react-consumer-app')).toBeVisible()
  await expect(page.getByTestId('ms-react-scene')).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByTestId('ms-react-scene')).toHaveAttribute(
    'data-ms-trigger',
    trigger,
  )
  await expect(page.getByTestId('ms-react-actor')).toContainText('React')
}

async function actorHasRunningAnimation(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="ms-react-scene"]')
    if (!root) return false
    const el = root.querySelector('[class^="ms-actor"]') as HTMLElement | null
    if (!el || typeof el.getAnimations !== 'function') return false
    return el.getAnimations().some((a) => {
      const name = (a as CSSAnimation).animationName
      return (
        typeof name === 'string' &&
        name !== '' &&
        name !== 'none' &&
        a.playState === 'running'
      )
    })
  })
}

async function startConsumerServer(host: ConsumerHost) {
  if (host.proc) return
  // Fresh ephemeral port each start — avoids TIME_WAIT / orphan listener collisions
  // on fixed 5174–5176 that left CI unable to restart between consumer tests.
  host.port = await reservePort()
  host.url = `http://127.0.0.1:${host.port}/`
  host.proc = spawn(
    process.execPath,
    [
      VITE_CLI,
      '--config',
      join(FIXTURE_ROOT, 'vite.config.ts'),
      '--host',
      '127.0.0.1',
      '--port',
      String(host.port),
    ],
    {
      cwd: join(FIXTURE_ROOT, '../../..'),
      stdio: 'pipe',
      detached: true,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        MS_REACT_SCENE_DIR: host.sceneRel,
        MS_REACT_CONSUMER_PORT: String(host.port),
      },
    },
  )
  const started = Date.now()
  while (Date.now() - started < 25000) {
    try {
      const res = await fetch(host.url)
      if (res.ok) return
    } catch {
      // retry
    }
    if (host.proc.exitCode !== null) {
      throw new Error(
        `React package consumer Vite exited early (code ${host.proc.exitCode}) on port ${host.port}`,
      )
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `React package consumer Vite server failed on port ${host.port}`,
  )
}

async function stopConsumerServer(host: ConsumerHost) {
  if (!host.proc) return
  const proc = host.proc
  const pid = proc.pid
  host.proc = null
  if (pid) {
    killProcessTree(pid, 'SIGTERM')
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (pid) killProcessTree(pid, 'SIGKILL')
      resolve()
    }, 3000)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  if (host.port) {
    try {
      await waitUntilPortFree(host.port)
    } catch {
      // Port may linger in TIME_WAIT; next start reserves a new ephemeral port.
    }
  }
  host.port = 0
  host.url = ''
}

/**
 * Rewrite the generated scene and restart Vite so the aliased MotionSketchScene
 * module is not served from a stale transform cache (query-busting the HTML URL
 * alone does not invalidate ms-scene/*).
 */
async function prepareConsumerScene(host: ConsumerHost, project: Project) {
  writeReactPackageScene(host, project)
  await stopConsumerServer(host)
  await startConsumerServer(host)
}

test.describe('react package export', () => {
  test.use({ viewport: { width: 1100, height: 800 } })

  test('Export panel downloads a React ZIP', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page, 'React zip')
    await recordSimplePath(page)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    await expect(page.getByTestId('btn-download-react-package')).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-react-package').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/react-zip-react-.*\.zip/)
    await expect(page.getByTestId('export-action-status')).toHaveText(
      'React package download started.',
    )
    const zipPath = await download.path()
    expect(zipPath).toBeTruthy()
  })
})

test.describe('react package consumer fixture', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 1100, height: 800 } })

  test.afterAll(async ({ browser }, testInfo) => {
    void browser
    const host = hostFor(testInfo.project.name)
    await stopConsumerServer(host)
    try {
      rmSync(host.sceneDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  test('page-load consumer: animation, remount, multi-instance, aspect, offline image', async ({
    page,
  }, testInfo) => {
    const host = hostFor(testInfo.project.name)
    await prepareConsumerScene(host, makeTriggerProject('page-load'))
    await loadConsumer(page, host.url, 'page-load')

    const stageBox = await page.getByTestId('ms-react-stage').boundingBox()
    expect(stageBox).toBeTruthy()
    expect(stageBox!.width / stageBox!.height).toBeCloseTo(1.6, 1)

    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)

    const img = page
      .getByTestId('react-consumer-primary')
      .locator('img')
      .first()
    await expect(img).toBeVisible()
    const src = await img.getAttribute('src')
    expect(src).toBeTruthy()
    expect(src!).not.toMatch(/^https?:\/\//i)
    expect(src!).toMatch(/asset-01/)

    await page.getByTestId('btn-toggle-mount').click()
    await expect(page.getByTestId('ms-react-scene')).toHaveCount(0)
    await page.getByTestId('btn-toggle-mount').click()
    await expect(page.getByTestId('ms-react-scene')).toBeVisible({
      timeout: 10000,
    })
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)

    await page.getByTestId('btn-toggle-second').click()
    await expect(page.getByTestId('ms-react-scene')).toHaveCount(2)
    const ids = await page
      .locator('[data-ms-scene]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-ms-scene')))
    expect(new Set(ids).size).toBe(2)

    await page.getByTestId('ms-react-play').first().click()
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)
  })

  test('click trigger waits until activate', async ({ page }, testInfo) => {
    const host = hostFor(testInfo.project.name)
    await prepareConsumerScene(host, makeTriggerProject('click'))
    await loadConsumer(page, host.url, 'click')
    await expect(page.getByTestId('ms-react-scene')).toHaveClass(/ms-waiting/)
    expect(await actorHasRunningAnimation(page)).toBe(false)
    await page.getByTestId('ms-react-scene').click()
    await expect(page.getByTestId('ms-react-scene')).not.toHaveClass(
      /ms-waiting/,
    )
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)
  })

  test('hover trigger plays on pointer enter', async ({ page }, testInfo) => {
    const host = hostFor(testInfo.project.name)
    await prepareConsumerScene(host, makeTriggerProject('hover'))
    await loadConsumer(page, host.url, 'hover')
    await expect(page.getByTestId('ms-react-scene')).toHaveClass(/ms-waiting/)
    await page.getByTestId('ms-react-scene').hover()
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)
  })

  test('viewport trigger plays when visible', async ({ page }, testInfo) => {
    const host = hostFor(testInfo.project.name)
    await prepareConsumerScene(host, makeTriggerProject('viewport'))
    await loadConsumer(page, host.url, 'viewport')
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 4000 })
      .toBe(true)
  })

  test('reduced-motion keeps animation off until Play', async ({
    page,
  }, testInfo) => {
    const host = hostFor(testInfo.project.name)
    await prepareConsumerScene(host, makeTriggerProject('page-load'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadConsumer(page, host.url, 'page-load')
    expect(await actorHasRunningAnimation(page)).toBe(false)
    await page.getByTestId('ms-react-play').click()
    await expect(page.getByTestId('ms-react-scene')).toHaveClass(/ms-motion-ok/)
    await expect
      .poll(async () => actorHasRunningAnimation(page), { timeout: 3000 })
      .toBe(true)
  })
})
