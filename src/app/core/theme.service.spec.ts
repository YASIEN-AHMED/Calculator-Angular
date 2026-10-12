import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to the light theme', () => {
    const service = new ThemeService();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('toggles between light and dark', () => {
    const service = new ThemeService();
    expect(service.toggle()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(service.toggle()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('restores the persisted theme', () => {
    localStorage.setItem('calculator.theme', 'dark');
    expect(new ThemeService().theme()).toBe('dark');
  });

  it('ignores invalid persisted values', () => {
    localStorage.setItem('calculator.theme', 'neon');
    expect(new ThemeService().theme()).toBe('light');
  });
});
