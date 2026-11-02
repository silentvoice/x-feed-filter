import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('returns defaults for empty input', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and fills in missing ones', () => {
    expect(parseSettings({ action: 'hide' })).toEqual({ ...DEFAULT_SETTINGS, action: 'hide' });
  });

  it('falls back to defaults for invalid data', () => {
    expect(parseSettings({ strictness: 7 })).toEqual(DEFAULT_SETTINGS);
  });
});
