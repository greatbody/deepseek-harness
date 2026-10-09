import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { load } from 'js-yaml'
import config from '../electron-builder.unsigned-macos.mjs'

test('Intel fork artifacts need no signing, notarization, or official update service', () => {
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.forceCodeSigning, false)
  assert.equal(config.mac.hardenedRuntime, false)
  assert.equal(config.mac.notarize, false)
  assert.equal(config.dmg.sign, false)
  assert.equal(config.publish, null)
  assert.equal(config.extraMetadata.dshMandatoryUpdatePolicy, undefined)
  assert.equal(config.extraMetadata.dshDesktopAppId, config.appId)
  assert.match(config.electronDist, /targets[/\\]mac-x64[/\\]electron$/u)
  assert.match(config.artifactName, /mac-x64-unsigned/u)
  assert.deepEqual(config.mac.target, ['dmg', 'zip'])
  assert.equal(config.electronFuses.runAsNode, true)
  assert.ok(config.files.some(entry => typeof entry === 'object' && entry.to === 'dsh/node_modules'))
  assert.ok(config.asarUnpack.includes('**/*.{node,dylib,dll,so,exe}'))
  assert.ok(config.extraResources.some(entry => entry.to === 'runtime'))
  assert.equal(typeof config.afterPack, 'function')
})

test('the workflow is manual-only and builds native Intel artifacts with smoke checks', () => {
  const workflow = load(readFileSync(new URL('../../../.github/workflows/build-desktop-macos-intel.yml', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  const build = workflow.jobs.build
  assert.equal(build['runs-on'], 'macos-15-intel')
  assert.equal(build.env.DSH_DESKTOP_TARGET_PLATFORM, 'darwin')
  assert.equal(build.env.DSH_DESKTOP_TARGET_ARCH, 'x64')
  assert.ok(build.steps.some(step => step.run?.includes('prepare:dsh --unsigned-macos')))
  assert.ok(build.steps.some(step => step.run?.includes('smoke-packaged-runtime.ts')))
  const upload = build.steps.find(step => step.uses === 'actions/upload-artifact@v4')
  assert.equal(upload.with['if-no-files-found'], 'error')
  assert.match(upload.with.path, /-mac-x64-unsigned\.dmg/u)
  assert.match(upload.with.path, /-mac-x64-unsigned\.zip/u)
})
