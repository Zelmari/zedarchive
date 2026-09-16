import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SegmentButtonProps {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}

export default function SegmentButton({
  active,
  onClick,
  icon: Icon,
  children,
  title,
}: SegmentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn('za-segment', active && 'za-segment--active')}
    >
      {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
}
