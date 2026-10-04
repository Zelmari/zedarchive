'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { hasInAppHistory } from './NavigationHistory';

interface BackButtonProps {
  href: string;
  label: string;
}

/**
 * Returns to the previous in-app page when there is one, otherwise navigates
 * to `href` (labelled by `label` in the tooltip) so it never leaves the app.
 */
export default function BackButton({ href, label }: BackButtonProps) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        if (!hasInAppHistory()) return;
        event.preventDefault();
        router.back();
      }}
      className="za-button za-button--secondary shrink-0 gap-1 px-2.5"
      title={`Back (${label})`}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      <span>Back</span>
    </Link>
  );
}
