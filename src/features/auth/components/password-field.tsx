'use client'

import { useId, useState } from 'react'

const fieldClassName =
  'w-full rounded border border-gray-300 px-3 py-2 transition-colors aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:outline-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'

const toggleButtonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

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
        <p className="text-sm text-gray-700" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
