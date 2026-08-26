import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

/**
 * Typed wrapper around the global `za-button` design-system classes
 * (defined in globals.css). Variants map 1:1 to the existing CSS.
 */
export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`za-button za-button--${variant} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
