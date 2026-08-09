import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'

const DARWIN_O_CLOEXEC = 0x01000000
const DARWIN_O_EXLOCK = 0x00000020
const lockSuffix = '.local/m45/.policy-exclusive-promotion.lock'

function run() {
  try {
    if (
      process.platform !== 'darwin' ||
      !process.version.startsWith('v24.') ||
      constants.O_NOFOLLOW !== 0x00000100 ||
      constants.O_NONBLOCK !== 0x00000004 ||
      process.argv.length !== 4 ||
      process.argv[2] !== 'lock-preflight'
    )
      return 21
    const repositoryRoot = process.argv[3]
    if (
      !isAbsolute(repositoryRoot) ||
      normalize(repositoryRoot) !== repositoryRoot ||
      realpathSync(repositoryRoot) !== repositoryRoot
    )
      return 21
    const lockPath = join(repositoryRoot, lockSuffix)
    const pathBefore = lstatSync(lockPath)
    const effectiveOwner = process.geteuid?.()
    if (
      effectiveOwner === undefined ||
      !pathBefore.isFile() ||
      pathBefore.isSymbolicLink() ||
      pathBefore.uid !== effectiveOwner ||
      pathBefore.nlink !== 1 ||
      pathBefore.size !== 0 ||
      (pathBefore.mode & 0o7777) !== 0o600
    )
      return 21
    let descriptor
    try {
      descriptor = openSync(
        lockPath,
        constants.O_RDWR |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK |
          DARWIN_O_CLOEXEC |
          DARWIN_O_EXLOCK,
      )
      const metadata = fstatSync(descriptor)
      const pathAfter = lstatSync(lockPath)
      if (
        !metadata.isFile() ||
        metadata.uid !== effectiveOwner ||
        metadata.dev !== pathBefore.dev ||
        metadata.ino !== pathBefore.ino ||
        metadata.dev !== pathAfter.dev ||
        metadata.ino !== pathAfter.ino ||
        !pathAfter.isFile() ||
        pathAfter.isSymbolicLink() ||
        pathAfter.uid !== effectiveOwner ||
        pathAfter.nlink !== 1 ||
        pathAfter.size !== 0 ||
        (pathAfter.mode & 0o7777) !== 0o600 ||
        metadata.nlink !== 1 ||
        metadata.size !== 0 ||
        (metadata.mode & 0o7777) !== 0o600
      ) {
        return 21
      }
      return 0
    } catch (error) {
      const code = error?.code
      return code === 'EWOULDBLOCK' || code === 'EAGAIN' ? 20 : 21
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
    }
  } catch {
    return 21
  }
}

process.exitCode = run()
