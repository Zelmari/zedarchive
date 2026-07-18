import 'server-only'

import { readAuthEnvironment } from '@/config/auth-environment'
import { createAuth } from '@/server/auth/create-auth'
import { database } from '@/server/database/client'

const authEnvironment = readAuthEnvironment()

export const auth = createAuth(database, authEnvironment)
