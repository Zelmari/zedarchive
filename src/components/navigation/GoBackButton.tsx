'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { hasInAppHistory } from './NavigationHistory';

/** "Go back" for dead ends (errors, 404s) where there is no parent page to link to. */
export default function GoBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="za-button za-button--secondary"
      onClick={() => {
        if (hasInAppHistory() || window.history.length > 1) router.back();
        else router.push('/');
      }}
    >
      <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      Go back
    </button>
  );
}
