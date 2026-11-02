import { today } from './activity';

describe('today', () => {
  it('uses the local date, not the UTC date', () => {
    expect(today(new Date(2026, 10, 2, 23, 30))).toBe('2026-11-02');
    expect(today(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});
