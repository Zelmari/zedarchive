import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/server/auth/auth'

export const runtime = 'nodejs'

const { GET, POST } = toNextJsHandler(auth)

export { GET, POST }
