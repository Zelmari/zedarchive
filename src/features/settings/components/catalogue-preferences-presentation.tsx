import Link from 'next/link'
import type { CataloguePreferencesPageModel } from '@/features/settings/catalogue-preferences-coordinator'
import { CataloguePreferencesForms } from '@/features/settings/components/catalogue-preferences-forms'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export function CataloguePreferencesRouteContent({
  model,
}: {
  model: CataloguePreferencesPageModel
}) {
  if (model.kind === 'signed_out') {
    return (
      <p>
        <Link className={linkClassName} href="/sign-in">
          Sign in
        </Link>{' '}
        to manage catalogue preferences.
      </p>
    )
  }

  if (model.kind === 'unavailable') {
    return (
      <div className="space-y-2" role="alert">
        <p>Catalogue preferences are temporarily unavailable.</p>
        <p>Try again in a moment.</p>
      </div>
    )
  }

  return <CataloguePreferencesForms preferences={model.preferences} />
}
