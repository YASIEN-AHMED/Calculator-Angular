import { Injectable } from '@angular/core';

/** Clipboard copy with a fallback for non-secure contexts. */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  async copy(text: string): Promise<boolean> {
    if (text.length === 0) {
      return false;
    }
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard !== undefined &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the legacy fallback below.
    }
    return this.legacyCopy(text);
  }

  private legacyCopy(text: string): boolean {
    try {
      if (typeof document === 'undefined') {
        return false;
      }
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const succeeded = document.execCommand('copy');
      document.body.removeChild(area);
      return succeeded;
    } catch {
      return false;
    }
  }
}
