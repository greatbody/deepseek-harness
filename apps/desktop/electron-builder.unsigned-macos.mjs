/** Intel-only fork artifacts without Apple credentials or official update services. */
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDesktopBuildCommit } from './scripts/desktop-build-commit.mjs'
import { officePackageDirectories } from '../../scripts/libreoffice-packages.mjs'
import { desktopTargetBuildPaths } from './scripts/desktop-build-paths.mjs'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const paths = desktopTargetBuildPaths('mac-x64')
const appId = 'ink.sunrui.deepseek-harness'
const source = readDesktopBuildCommit(join(appRoot, '../..'))

export default {
  appId,
  productName: 'DeepSeek Harness',
  artifactName: 'deepseek-harness-${version}-mac-x64-unsigned.${ext}',
  extraMetadata: { dshDesktopAppId: appId, dshBuildCommit: source.commit, dshBuildDirty: source.dirty },
  protocols: [{ name: 'DeepSeek Harness', schemes: ['dsh'] }],
  directories: { app: appRoot, output: paths.artifacts },
  asar: true,
  electronDist: paths.electron,
  electronFuses: { runAsNode: true },
  files: [
    'lib/main.js',
    'lib/welcome/**/*',
    'lib/preload-app.cjs',
    'lib/preload-mandatory.cjs',
    'lib/preload-platform-account.cjs',
    'lib/preload-update-dialog.cjs',
    'lib/preload-welcome.cjs',
    'renderer/**/*',
    'package.json',
    { from: paths.dsh, to: 'dsh', filter: ['**/*'] },
    { from: join(paths.dsh, 'node_modules'), to: 'dsh/node_modules', filter: ['**/*'] },
  ],
  asarUnpack: [
    '**/*.{node,dylib,dll,so,exe}',
    '**/*.so.*',
    '**/spawn-helper',
    '**/@vscode/ripgrep-*/bin/rg',
    '**/node_modules/@deepseek-ai/libreoffice-kit-darwin-x64/**/*',
  ],
  extraResources: [
    { from: paths.runtime, to: 'runtime' },
    { from: join(appRoot, 'resources/icon-windows.png'), to: 'icon.png' },
  ],
  mac: {
    icon: join(appRoot, 'resources/icon-macos.png'),
    category: 'public.app-category.developer-tools',
    identity: null,
    forceCodeSigning: false,
    hardenedRuntime: false,
    notarize: false,
    target: ['dmg', 'zip'],
    extendInfo: {
      CFBundleLocalizations: ['en', 'zh_CN'],
      NSMicrophoneUsageDescription: 'DeepSeek Harness uses your microphone to transcribe speech into message drafts.',
    },
  },
  dmg: { sign: false, writeUpdateInfo: false },
  beforePack: async context => {
    const office = await officePackageDirectories(paths.dsh, { platform: 'darwin', arch: 'x64' })
    context.packager.config.asarUnpack = [
      ...context.packager.config.asarUnpack,
      ...office.map(directory => `**/${relative(paths.dsh, directory)}/**/*`),
    ]
  },
  afterPack: async context => {
    const { verifyDesktopRuntime } = await import('./lib/types/runtime-tree.js')
    await verifyDesktopRuntime(paths.dsh, context.packager.appInfo.version, { platform: 'darwin', arch: 'x64' })
  },
  detectUpdateChannel: false,
  publish: null,
}
