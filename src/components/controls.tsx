import type { ReactNode } from 'react';

export function Toggle(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{props.label}</span>
        {props.description && (
          <span className="block text-xs text-neutral-500">{props.description}</span>
        )}
      </span>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-sky-500"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-neutral-200 border-b py-3 last:border-b-0 dark:border-neutral-800">
      <h2 className="mb-1 font-semibold text-neutral-500 text-xs uppercase tracking-wide">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export function ActionPicker(props: {
  value: 'blur' | 'hide';
  onChange: (value: 'blur' | 'hide') => void;
}) {
  const options = [
    { value: 'blur', label: 'Blur', hint: 'Show a reason and a Show button' },
    { value: 'hide', label: 'Hide', hint: 'Remove the post from the feed' },
  ] as const;
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="sr-only">Action for filtered posts</legend>
      {options.map((option) => (
        <label
          key={option.value}
          title={option.hint}
          className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-sky-500 ${
            props.value === option.value
              ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
              : 'border-neutral-300 dark:border-neutral-700'
          }`}
        >
          <input
            type="radio"
            name="action"
            className="sr-only"
            value={option.value}
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function StrictnessSlider(props: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="block py-2">
      <span className="flex justify-between text-sm font-medium">
        Strictness <span className="text-neutral-500">{Math.round(props.value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-sky-500"
      />
      <span className="flex justify-between text-neutral-500 text-xs">
        <span>Clear matches only</span>
        <span>Anything that might match</span>
      </span>
    </label>
  );
}
