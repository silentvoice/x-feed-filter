import { z } from 'zod';
import { PRESETS } from './filters/presets';

export const CustomFilterSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(60),
  question: z.string().min(1).max(300),
  enabled: z.boolean(),
});

export const SettingsSchema = z.object({
  enabled: z.boolean(),
  /** "blur" shows a blurred post with a reason and a "Show" button. "hide" removes it. */
  action: z.enum(['blur', 'hide']),
  /** Blur new posts until the classifier returns a verdict, so filtered content never flashes. */
  pendingBlur: z.boolean(),
  /** 0 = only hide clear matches, 1 = hide anything that might match. */
  strictness: z.number().min(0).max(1),
  presets: z.record(z.string(), z.boolean()),
  customFilters: z.array(CustomFilterSchema),
  /** Words or phrases that hide a post without the model. Case-insensitive. */
  mutedWords: z.array(z.string()),
  /** Handles that the extension never filters. */
  allowlist: z.array(z.string()),
  hidePromoted: z.boolean(),
  analyzeImages: z.boolean(),
  backend: z.enum(['auto', 'd1', 'zero-shot', 'rules-only']),
  /** Threshold change for each filter from "Not a match" feedback. */
  filterAdjust: z.record(z.string(), z.number()),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type CustomFilter = z.infer<typeof CustomFilterSchema>;

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  action: 'blur',
  pendingBlur: true,
  strictness: 0.5,
  presets: Object.fromEntries(PRESETS.map((p) => [p.id, p.enabledByDefault])),
  customFilters: [],
  mutedWords: [],
  allowlist: [],
  hidePromoted: false,
  analyzeImages: true,
  backend: 'auto',
  filterAdjust: {},
};

/** Parse stored settings. Unknown or invalid fields fall back to defaults. */
export function parseSettings(raw: unknown): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? raw : {}) };
  const result = SettingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_SETTINGS;
}
