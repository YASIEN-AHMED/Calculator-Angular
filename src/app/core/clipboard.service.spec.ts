import { describe, expect, it } from 'vitest';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  it('refuses to copy empty text', async () => {
    const service = new ClipboardService();
    await expect(service.copy('')).resolves.toBe(false);
  });

  it('always resolves to a boolean and never throws', async () => {
    const service = new ClipboardService();
    await expect(service.copy('42')).resolves.toEqual(expect.any(Boolean));
  });
});
