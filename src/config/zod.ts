import { z, ZodError } from 'zod'

// Strict production CSP intentionally forbids runtime code generation. Zod's
// supported jitless mode skips its Function probe and uses the interpreter.
z.config({ jitless: true })

export { z, ZodError }
