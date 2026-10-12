import { Component, input } from '@angular/core';

export type DisplayTone = 'entry' | 'result' | 'error';

/** Presentational display: expression line plus the main result/entry line. */
@Component({
  selector: 'app-calculator-display',
  standalone: true,
  templateUrl: './display.html',
  styleUrl: './display.css',
})
export class CalculatorDisplay {
  /** Expression in display symbols (already mapped by the engine). */
  expressionText = input<string>('');
  /** Main line: result, live preview, error, or echoed entry. */
  mainText = input<string>('0');
  tone = input<DisplayTone>('entry');
}
