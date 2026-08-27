'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareArchiveButtonProps {
  url: string;
}

/** One-click copy of the public archive URL with a transient confirmation. */
export default function ShareArchiveButton({ url }: ShareArchiveButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard unavailable (permissions/insecure context): offer manual copy.
      window.prompt('Copy your archive link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="za-button za-button--secondary inline-flex items-center text-xs"
      aria-label={`Copy archive link ${url}`}
    >
      {copied ? <Check size={14} className="mr-1" /> : <Share2 size={14} className="mr-1" />}
      {copied ? 'Copied!' : 'Share Archive'}
    </button>
  );
}
