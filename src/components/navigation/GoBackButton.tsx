'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { hasInAppHistory } from './NavigationHistory';

interface GoBackButtonProps {
  fallbackHref?: string;
  className?: string;
}

/** "Go back" for dead ends (errors, 404s) where there is no parent page to link to. */
export default function GoBackButton({
  fallbackHref = '/',
  className = 'za-button za-button--secondary',
}: GoBackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (hasInAppHistory() || window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      Go back
    </button>
  );
}
