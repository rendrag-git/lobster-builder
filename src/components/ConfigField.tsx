import type { ConfigField as ConfigFieldDef } from '../types/actions'

interface ConfigFieldProps {
  field: ConfigFieldDef
  value: unknown
  onChange: (value: unknown) => void
}

export function ConfigField({ field, value, onChange }: ConfigFieldProps) {
  const baseInput =
    'w-full px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors'

  const label = (
    <label className="block text-xs text-gray-400 mb-1">
      {field.label}
      {field.required && <span className="text-red-400 ml-1">*</span>}
    </label>
  )

  if (field.type === 'boolean') {
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={field.id}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 accent-blue-500"
          />
          <label htmlFor={field.id} className="text-xs text-gray-300 cursor-pointer">
            {field.label}
          </label>
        </div>
      </div>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="mb-3">
        {label}
        <select
          value={String(value ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (field.type === 'textarea' || field.type === 'code') {
    return (
      <div className="mb-3">
        {label}
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={`${baseInput} resize-y font-${field.type === 'code' ? 'mono' : 'sans'}`}
        />
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div className="mb-3">
        {label}
        <input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder={field.placeholder}
          className={baseInput}
        />
      </div>
    )
  }

  // Default: text
  return (
    <div className="mb-3">
      {label}
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={baseInput}
      />
    </div>
  )
}
