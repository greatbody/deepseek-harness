import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { load } from 'js-yaml'
import config from '../electron-builder.unsigned-macos.mjs'

const workflow = load(readFileSync(new URL('../../../.github/workflows/build-desktop-macos-intel.yml', import.meta.url), 'utf8'))

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
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  const build = workflow.jobs.build
  assert.deepEqual(build.permissions, { contents: 'write' })
  assert.equal(build['runs-on'], 'macos-15-intel')
  assert.equal(build.env.DSH_DESKTOP_TARGET_PLATFORM, 'darwin')
  assert.equal(build.env.DSH_DESKTOP_TARGET_ARCH, 'x64')
  assert.ok(build.steps.some(step => step.run?.includes('prepare:dsh --unsigned-macos')))
  assert.ok(build.steps.some(step => step.run?.includes('smoke-packaged-runtime.ts')))
  const publishIndex = build.steps.findIndex(step => step.run?.includes('gh release create'))
  assert.ok(publishIndex > build.steps.findIndex(step => step.run?.includes('smoke-packaged-runtime.ts')))
  assert.equal(build.steps[publishIndex].if, undefined)
  assert.equal(build.steps[publishIndex].env.GH_TOKEN, '${{ github.token }}')
})

for (const missingZip of [false, true]) {
  test(missingZip ? 'missing ZIP prevents release publication' : 'release publication attaches both installers to the exact build commit', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-release-test-'))
    try {
      const desktop = join(root, 'apps/desktop')
      const artifacts = join(desktop, '.desktop-build/targets/mac-x64/artifacts')
      mkdirSync(artifacts, { recursive: true })
      writeFileSync(join(desktop, 'package.json'), JSON.stringify({ version: '0.2.1-alpha.1' }))
      writeFileSync(join(artifacts, 'deepseek-harness-0.2.1-alpha.1-mac-x64-unsigned.dmg'), 'fixture')
      if (!missingZip) writeFileSync(join(artifacts, 'deepseek-harness-0.2.1-alpha.1-mac-x64-unsigned.zip'), 'fixture')
      writeFileSync(join(root, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
      const publish = workflow.jobs.build.steps.find(step => step.run?.includes('gh release create'))
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', publish.run], {
        cwd: root,
        env: {
          ...process.env,
          GH_TOKEN: 'test-token',
          PATH: `${root}${delimiter}${process.env.PATH}`,
          GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', GITHUB_RUN_NUMBER: '7',
          GITHUB_REPOSITORY: 'greatbody/deepseek-harness', GITHUB_SHA: 'a'.repeat(40),
        },
        encoding: 'utf8', timeout: 10_000,
      })
      assert.equal(result.error, undefined)
      assert.equal(result.signal, null)
      if (missingZip) {
        assert.notEqual(result.status, 0)
        assert.equal(result.stdout, '')
      } else {
        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /create\nmacos-intel-12345-2\n/u)
        assert.match(result.stdout, /-unsigned\.dmg\n/u)
        assert.match(result.stdout, /-unsigned\.zip\n/u)
        assert.ok(result.stdout.includes(`--target\n${'a'.repeat(40)}\n`))
        assert.match(result.stdout, /--prerelease\n--latest=false\n/u)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
