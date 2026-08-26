import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names, resolving Tailwind conflicts
 * (later utilities win over earlier ones of the same group).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
