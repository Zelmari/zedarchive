'use client'

import { useId, useState } from 'react'

const fieldClassName = 'za-field'

const toggleButtonClassName = 'za-button za-button--secondary shrink-0 text-sm'

type PasswordFieldProps = Readonly<{
  autoComplete: 'new-password' | 'current-password'
  describedBy?: string
  disabled?: boolean
  hint?: string
  id: string
  invalid?: boolean
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}>

export function PasswordField({
  autoComplete,
  describedBy,
  disabled = false,
  hint,
  id,
  invalid = false,
  label,
  name,
  onChange,
  value,
}: PasswordFieldProps) {
  const hintId = useId()
  const [visible, setVisible] = useState(false)
  const describedByIds = [hint ? hintId : null, describedBy ?? null]
    .filter((value): value is string => value !== null)
    .join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          aria-describedby={
            describedByIds.length > 0 ? describedByIds : undefined
          }
          aria-invalid={invalid ? true : undefined}
          autoComplete={autoComplete}
          className={fieldClassName}
          disabled={disabled}
          id={id}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className={toggleButtonClassName}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint ? (
        <p className="text-sm text-ink-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
