import { z } from 'zod'

export const usernameAvailabilitySchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
  }),
  z.strictObject({
    status: z.literal('invalid'),
  }),
])

export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>

export function parseUsernameAvailability(
  input: unknown,
): UsernameAvailability | null {
  const parsed = usernameAvailabilitySchema.safeParse(input)
  return parsed.success ? parsed.data : null
}
