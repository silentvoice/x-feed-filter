import { Activity } from '@/components/activity';
import { ActionPicker, Section, StrictnessSlider, Toggle } from '@/components/controls';
import { ModelStatusLine } from '@/components/model-status';
import { useSettings } from '@/components/use-settings';
import { PRESETS } from '@/lib/filters/presets';

export function App() {
  const [settings, update] = useSettings();
  if (!settings) return null;

  return (
    <main className="w-80 bg-white px-4 py-3 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between pb-2">
        <h1 className="font-bold text-base">Lull</h1>
        <input
          type="checkbox"
          aria-label="Turn filtering on or off"
          className="size-4 accent-brand-500"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </header>
      {settings.enabled && settings.backend !== 'rules-only' && <ModelStatusLine />}

      <Section title="Activity">
        <Activity />
      </Section>

      <Section title="Filtered posts">
        <ActionPicker value={settings.action} onChange={(action) => update({ action })} />
        <StrictnessSlider
          value={settings.strictness}
          onChange={(strictness) => update({ strictness })}
        />
      </Section>

      <Section title="Filters">
        {PRESETS.map((preset) => (
          <Toggle
            key={preset.id}
            label={preset.label}
            checked={settings.presets[preset.id] ?? false}
            onChange={(on) => update({ presets: { ...settings.presets, [preset.id]: on } })}
          />
        ))}
        {settings.customFilters.map((filter) => (
          <Toggle
            key={filter.id}
            label={filter.label}
            checked={filter.enabled}
            onChange={(enabled) =>
              update({
                customFilters: settings.customFilters.map((f) =>
                  f.id === filter.id ? { ...f, enabled } : f,
                ),
              })
            }
          />
        ))}
      </Section>

      <button
        type="button"
        onClick={() => browser.runtime.openOptionsPage()}
        className="mt-2 w-full rounded-lg bg-brand-500 px-3 py-2 font-semibold text-sm text-white hover:bg-brand-600"
      >
        Add your own filter
      </button>
    </main>
  );
}
