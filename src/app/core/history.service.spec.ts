import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryService } from './history.service';

const STORAGE_KEY = 'calculator.history.v1';

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    localStorage.clear();
    service = new HistoryService();
  });

  it('starts empty', () => {
    expect(service.entries()).toEqual([]);
  });

  it('adds entries newest-first', () => {
    service.add('2+3', '2+3', '5');
    service.add('4*5', '4×5', '20');
    const entries = service.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.result).toBe('20');
    expect(entries[1]?.result).toBe('5');
  });

  it('ignores an immediate duplicate', () => {
    service.add('2+3', '2+3', '5');
    service.add('2+3', '2+3', '5');
    expect(service.entries()).toHaveLength(1);
  });

  it('caps the list at 50 entries', () => {
    for (let i = 0; i < 55; i += 1) {
      service.add(`${i}+1`, `${i}+1`, `${i + 1}`);
    }
    expect(service.entries()).toHaveLength(50);
    expect(service.entries()[0]?.expression).toBe('54+1');
  });

  it('removes a single entry', () => {
    const entry = service.add('2+3', '2+3', '5');
    service.add('4*5', '4×5', '20');
    service.remove(entry.id);
    expect(service.entries()).toHaveLength(1);
    expect(service.entries()[0]?.result).toBe('20');
  });

  it('clears all entries', () => {
    service.add('2+3', '2+3', '5');
    service.clear();
    expect(service.entries()).toEqual([]);
  });

  it('persists entries across instances', () => {
    service.add('2+3', '2+3', '5');
    const reloaded = new HistoryService();
    expect(reloaded.entries()).toHaveLength(1);
    expect(reloaded.entries()[0]?.result).toBe('5');
  });

  it('recovers from corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(new HistoryService().entries()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ bogus: true }]));
    expect(new HistoryService().entries()).toEqual([]);
  });
});
