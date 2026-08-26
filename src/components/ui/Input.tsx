import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldBase = {
  className?: string;
};

export function TextField({
  className = '',
  ...rest
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`za-field ${className}`.trim()} />;
}

export function TextArea({
  className = '',
  ...rest
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`za-field ${className}`.trim()} />;
}
