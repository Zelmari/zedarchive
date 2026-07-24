import type { UsernameChangePageState } from '@/features/settings/domain/username-change'
import { UsernameChangeForms } from '@/features/settings/components/username-change-forms'

export function UsernameChangeRouteContent({
  model,
}: {
  model: UsernameChangePageState
}) {
  return <UsernameChangeForms model={model} />
}
