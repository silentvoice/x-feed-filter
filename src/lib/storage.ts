import { storage } from '#imports';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings';

const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  return parseSettings(await settingsItem.getValue());
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue(settings);
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => callback(parseSettings(value)));
}
