import { Injectable, signal } from '@angular/core';
import type { Theme } from './models';

const STORAGE_KEY = 'calculator.theme';
const DARK = 'dark';
const LIGHT = 'light';

/** Light/dark theme state, persisted and applied to `<html data-theme>`. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): Theme {
    const next: Theme = this.theme() === DARK ? LIGHT : DARK;
    this.set(next);
    return next;
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    this.apply(theme);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // Persistence is a nice-to-have; the in-memory theme still applies.
    }
  }

  private initialTheme(): Theme {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === DARK || stored === LIGHT) {
          return stored;
        }
      }
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
      }
    } catch {
      // Fall through to the default.
    }
    return LIGHT;
  }

  private apply(theme: Theme): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['theme'] = theme;
    }
  }
}
