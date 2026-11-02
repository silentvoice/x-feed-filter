import { type FormEvent, useState } from 'react';
import { ActionPicker, Section, StrictnessSlider, Toggle } from '@/components/controls';
import { useSettings } from '@/components/use-settings';
import { PRESETS } from '@/lib/filters/presets';
import type { Settings } from '@/lib/settings';

const BACKENDS: { value: Settings['backend']; label: string }[] = [
  { value: 'auto', label: 'Automatic (recommended)' },
  { value: 'd1', label: 'Liquid AI d1-omni-600M (about 245 MB, best accuracy)' },
  { value: 'zero-shot', label: 'ModernBERT zero-shot (about 140 MB, faster)' },
  { value: 'rules-only', label: 'Rules only (no model, muted words only)' },
];

export function App() {
  const [settings, update] = useSettings();
  if (!settings) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 text-neutral-900 dark:text-neutral-100">
      <h1 className="mb-6 font-bold text-2xl">Lull settings</h1>

      <Section title="Filtered posts">
        <ActionPicker value={settings.action} onChange={(action) => update({ action })} />
        <StrictnessSlider
          value={settings.strictness}
          onChange={(strictness) => update({ strictness })}
        />
        <Toggle
          label="Blur new posts until they are checked"
          description="Filtered content never shows, not even for a moment."
          checked={settings.pendingBlur}
          onChange={(pendingBlur) => update({ pendingBlur })}
        />
        <Toggle
          label="Check images"
          description="Use image text and descriptions when the model checks a post."
          checked={settings.analyzeImages}
          onChange={(analyzeImages) => update({ analyzeImages })}
        />
        <Toggle
          label="Hide promoted posts"
          checked={settings.hidePromoted}
          onChange={(hidePromoted) => update({ hidePromoted })}
        />
      </Section>

      <Section title="Built-in filters">
        {PRESETS.map((preset) => (
          <Toggle
            key={preset.id}
            label={preset.label}
            description={preset.question}
            checked={settings.presets[preset.id] ?? false}
            onChange={(on) => update({ presets: { ...settings.presets, [preset.id]: on } })}
          />
        ))}
      </Section>

      <Section title="Your filters">
        <CustomFilters settings={settings} update={update} />
      </Section>

      <Section title="Muted words">
        <ListEditor
          placeholder="Add a word or phrase"
          items={settings.mutedWords}
          onChange={(mutedWords) => update({ mutedWords })}
        />
      </Section>

      <Section title="Never filter these accounts">
        <ListEditor
          placeholder="@handle"
          items={settings.allowlist}
          onChange={(allowlist) => update({ allowlist })}
        />
      </Section>

      <Section title="Feedback">
        <FeedbackAdjustments settings={settings} update={update} />
      </Section>

      <Section title="Model">
        <select
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          value={settings.backend}
          onChange={(e) => update({ backend: e.target.value as Settings['backend'] })}
        >
          {BACKENDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-neutral-500 text-xs">
          The model runs on your device. Your posts never leave your computer.
        </p>
      </Section>
    </main>
  );
}

function CustomFilters(props: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const { settings, update } = props;
  const [question, setQuestion] = useState('');

  const add = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    const filter = {
      id: `custom-${crypto.randomUUID()}`,
      label: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      question: text,
      enabled: true,
    };
    update({ customFilters: [...settings.customFilters, filter] });
    setQuestion('');
  };

  return (
    <div>
      <form onSubmit={add} className="flex gap-2 py-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Describe posts to filter, for example: posts about layoffs"
          maxLength={300}
          className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-sm text-white hover:bg-brand-600"
        >
          Add
        </button>
      </form>
      {settings.customFilters.map((filter) => (
        <div key={filter.id} className="flex items-center gap-2">
          <div className="flex-1">
            <Toggle
              label={filter.question}
              checked={filter.enabled}
              onChange={(enabled) =>
                update({
                  customFilters: settings.customFilters.map((f) =>
                    f.id === filter.id ? { ...f, enabled } : f,
                  ),
                })
              }
            />
          </div>
          <button
            type="button"
            aria-label={`Remove filter: ${filter.question}`}
            className="text-neutral-500 text-sm hover:text-red-500"
            onClick={() =>
              update({ customFilters: settings.customFilters.filter((f) => f.id !== filter.id) })
            }
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function ListEditor(props: {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const [value, setValue] = useState('');
  const add = (event: FormEvent) => {
    event.preventDefault();
    const item = value.trim();
    if (item && !props.items.includes(item)) props.onChange([...props.items, item]);
    setValue('');
  };
  return (
    <div className="py-2">
      <form onSubmit={add}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={props.placeholder}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
      </form>
      <ul className="mt-2 flex flex-wrap gap-2">
        {props.items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="text-neutral-500 hover:text-red-500"
              onClick={() => props.onChange(props.items.filter((i) => i !== item))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackAdjustments(props: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { settings, update } = props;
  const labels = new Map<string, string>([
    ...PRESETS.map((p) => [p.id, p.label] as [string, string]),
    ...settings.customFilters.map((f) => [f.id, f.label] as [string, string]),
  ]);
  const entries = Object.entries(settings.filterAdjust).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    return (
      <p className="py-2 text-neutral-500 text-sm">
        Click "Not a match" on a filtered post to make that filter less strict.
      </p>
    );
  }
  return (
    <div className="py-2 text-sm">
      <ul className="space-y-1">
        {entries.map(([id, value]) => (
          <li key={id}>
            {labels.get(id) ?? id}: less strict by {Math.round(value * 100)} points
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => update({ filterAdjust: {} })}
        className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        Reset feedback
      </button>
    </div>
  );
}
