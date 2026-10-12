import { Component, input, output } from '@angular/core';
import type { HistoryEntry } from '../../core/models';

/** Presentational calculation-history panel. */
@Component({
  selector: 'app-history-panel',
  standalone: true,
  templateUrl: './history-panel.html',
  styleUrl: './history-panel.css',
})
export class HistoryPanel {
  entries = input<readonly HistoryEntry[]>([]);
  reuse = output<HistoryEntry>();
  remove = output<string>();
  clear = output<void>();
}
