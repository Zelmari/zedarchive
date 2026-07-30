import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const packageJsonPath = new URL('../package.json', import.meta.url)
const packageLockPath = new URL('../package-lock.json', import.meta.url)

function packageNameFromLockPath(lockPath) {
  const packagePath = lockPath.slice(lockPath.lastIndexOf('node_modules/') + 13)

  if (packagePath.startsWith('@')) {
    return packagePath.split('/').slice(0, 2).join('/')
  }

  return packagePath.split('/')[0]
}

export function assertInstallScriptPolicy(packageJson, packageLock) {
  const allowScripts = packageJson.allowScripts ?? {}
  const identities = Object.entries(packageLock.packages)
    .filter(([, packageEntry]) => packageEntry.hasInstallScript)
    .map(([lockPath, packageEntry]) => ({
      name: packageNameFromLockPath(lockPath),
      version: packageEntry.version,
    }))

  const errors = []

  for (const { name, version } of identities) {
    const nameDisposition = allowScripts[name]
    const exactDisposition = allowScripts[`${name}@${version}`]

    if (nameDisposition === false && exactDisposition === true) {
      errors.push(
        `${name}@${version} has conflicting broad denial and exact approval`,
      )
      continue
    }

    if (nameDisposition === false || exactDisposition === true) {
      continue
    }

    errors.push(
      `${name}@${version} has no explicit lifecycle-script disposition`,
    )
  }

  for (const [key, disposition] of Object.entries(allowScripts)) {
    if (disposition !== false && disposition !== true) {
      errors.push(`${key} has a non-boolean lifecycle-script disposition`)
    }

    if (disposition === true && key.lastIndexOf('@') <= 0) {
      errors.push(`${key} is an unpinned lifecycle-script approval`)
    }
  }

  if (errors.length > 0) {
    throw new Error('Install-script policy failed: ' + errors.join('; '))
  }
}

function run(command, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, options)
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', reject)
    child.once('close', (exitCode) => {
      resolve({ exitCode, output })
    })
  })
}

export async function assertUnapprovedScriptDoesNotRun() {
  const npmExecPath = process.env.npm_execpath

  if (!npmExecPath) {
    throw new Error('Install-script sentinel must run through npm.')
  }

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'zedarchive-m44-install-script-'),
  )

  try {
    const dependencyDirectory = join(temporaryRoot, 'synthetic-install-script')
    const consumerDirectory = join(temporaryRoot, 'consumer')
    const markerPath = join(temporaryRoot, 'unexpected-install-script-marker')

    await Promise.all([
      mkdir(dependencyDirectory, { recursive: true }),
      mkdir(consumerDirectory, { recursive: true }),
    ])

    await writeFile(
      join(dependencyDirectory, 'package.json'),
      JSON.stringify({
        name: 'synthetic-install-script',
        version: '1.0.0',
        scripts: { install: 'node write-marker.mjs' },
      }),
    )
    await writeFile(
      join(dependencyDirectory, 'write-marker.mjs'),
      "import { writeFile } from 'node:fs/promises'\nawait writeFile(process.env.M44_SENTINEL_MARKER, 'executed')\n",
    )
    await writeFile(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({
        name: 'm44-install-script-consumer',
        private: true,
        version: '1.0.0',
        dependencies: {
          'synthetic-install-script': 'file:../synthetic-install-script',
        },
      }),
    )
    await writeFile(
      join(consumerDirectory, '.npmrc'),
      'strict-allow-scripts=true\n',
    )

    const result = await run(
      process.execPath,
      [
        npmExecPath,
        'install',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      {
        cwd: consumerDirectory,
        env: {
          ...process.env,
          M44_SENTINEL_MARKER: markerPath,
          npm_config_cache: join(temporaryRoot, 'cache'),
        },
      },
    )

    if (result.exitCode === 0 || !result.output.includes('allow-scripts')) {
      throw new Error(
        'Unapproved lifecycle script did not fail before execution.',
      )
    }

    try {
      await access(markerPath)
    } catch {
      return
    }

    throw new Error(
      'Unapproved lifecycle script executed before npm rejected it.',
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function main() {
  const [packageJson, packageLock] = await Promise.all([
    readFile(packageJsonPath, 'utf8').then(JSON.parse),
    readFile(packageLockPath, 'utf8').then(JSON.parse),
  ])

  assertInstallScriptPolicy(packageJson, packageLock)
  await assertUnapprovedScriptDoesNotRun()
  console.log('Install-script policy verified.')
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}
