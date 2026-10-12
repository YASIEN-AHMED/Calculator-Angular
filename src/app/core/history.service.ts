import { Injectable, signal } from '@angular/core';
import type { HistoryEntry } from './models';

const STORAGE_KEY = 'calculator.history.v1';
const MAX_ENTRIES = 50;

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Calculation history with localStorage persistence.
 * Corrupt or unavailable storage never breaks the app: it falls back to
 * an in-memory list.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  readonly entries = signal<readonly HistoryEntry[]>(this.load());

  add(expression: string, displayExpression: string, result: string): HistoryEntry {
    const entry: HistoryEntry = {
      id: generateId(),
      expression,
      displayExpression,
      result,
      createdAt: Date.now(),
    };
    // Avoid recording the same calculation twice in a row.
    const current = this.entries();
    const latest = current[0];
    if (
      latest !== undefined &&
      latest.expression === entry.expression &&
      latest.result === entry.result
    ) {
      return latest;
    }
    const next = [entry, ...current].slice(0, MAX_ENTRIES);
    this.set(next);
    return entry;
  }

  remove(id: string): void {
    this.set(this.entries().filter((entry) => entry.id !== id));
  }

  clear(): void {
    this.set([]);
  }

  private set(entries: readonly HistoryEntry[]): void {
    this.entries.set(entries);
    this.persist(entries);
  }

  private load(): HistoryEntry[] {
    try {
      if (typeof localStorage === 'undefined') {
        return [];
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null || raw === '') {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is HistoryEntry => this.isEntry(item));
    } catch {
      return [];
    }
  }

  private isEntry(item: unknown): item is HistoryEntry {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const record = item as Record<string, unknown>;
    return (
      typeof record['id'] === 'string' &&
      typeof record['expression'] === 'string' &&
      typeof record['displayExpression'] === 'string' &&
      typeof record['result'] === 'string' &&
      typeof record['createdAt'] === 'number'
    );
  }

  private persist(entries: readonly HistoryEntry[]): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable: history simply stays in memory.
    }
  }
}
