import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CalculatorEngine } from '../../core/calculator-engine.service';
import { ClipboardService } from '../../core/clipboard.service';
import { HistoryService } from '../../core/history.service';
import { ThemeService } from '../../core/theme.service';
import {
  CALCULATOR_ERROR_MESSAGES,
  type BinaryOperator,
  type HistoryEntry,
} from '../../core/models';
import { CalculatorDisplay, type DisplayTone } from './display';
import { HistoryPanel } from './history-panel';

/** Identifiers for every keypad key; keyboard input maps onto the same ids. */
export type KeyId =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '+' | '-' | '*' | '/' | '.' | '%' | '(' | ')'
  | 'equals' | 'all-clear' | 'clear-entry' | 'backspace' | 'sign';

interface KeyDef {
  id: KeyId;
  label: string;
  kind: 'digit' | 'operator' | 'utility' | 'equals';
  ariaLabel: string;
  shortcut?: string;
}

/** Keypad definition in visual order (4-column grid; "=" spans two rows). */
export const KEYPAD: readonly KeyDef[] = [
  { id: 'all-clear', label: 'AC', kind: 'utility', ariaLabel: 'All clear', shortcut: 'Esc' },
  { id: 'clear-entry', label: 'C', kind: 'utility', ariaLabel: 'Clear entry' },
  { id: 'backspace', label: '⌫', kind: 'utility', ariaLabel: 'Delete last character', shortcut: '⌫' },
  { id: '/', label: '÷', kind: 'operator', ariaLabel: 'Divide', shortcut: '/' },
  { id: '(', label: '(', kind: 'operator', ariaLabel: 'Open parenthesis', shortcut: '(' },
  { id: ')', label: ')', kind: 'operator', ariaLabel: 'Close parenthesis', shortcut: ')' },
  { id: '%', label: '%', kind: 'operator', ariaLabel: 'Percentage', shortcut: '%' },
  { id: '*', label: '×', kind: 'operator', ariaLabel: 'Multiply', shortcut: '*' },
  { id: '7', label: '7', kind: 'digit', ariaLabel: '7' },
  { id: '8', label: '8', kind: 'digit', ariaLabel: '8' },
  { id: '9', label: '9', kind: 'digit', ariaLabel: '9' },
  { id: '-', label: '−', kind: 'operator', ariaLabel: 'Subtract', shortcut: '−' },
  { id: '4', label: '4', kind: 'digit', ariaLabel: '4' },
  { id: '5', label: '5', kind: 'digit', ariaLabel: '5' },
  { id: '6', label: '6', kind: 'digit', ariaLabel: '6' },
  { id: '+', label: '+', kind: 'operator', ariaLabel: 'Add', shortcut: '+' },
  { id: '1', label: '1', kind: 'digit', ariaLabel: '1' },
  { id: '2', label: '2', kind: 'digit', ariaLabel: '2' },
  { id: '3', label: '3', kind: 'digit', ariaLabel: '3' },
  { id: 'equals', label: '=', kind: 'equals', ariaLabel: 'Calculate result', shortcut: '⏎' },
  { id: 'sign', label: '±', kind: 'operator', ariaLabel: 'Toggle sign', shortcut: 'S' },
  { id: '0', label: '0', kind: 'digit', ariaLabel: '0' },
  { id: '.', label: '.', kind: 'digit', ariaLabel: 'Decimal point', shortcut: '.' },
];

const COPY_FEEDBACK_MS = 1500;

function isOperatorKey(id: KeyId): id is BinaryOperator {
  return id === '+' || id === '-' || id === '*' || id === '/';
}

function isDigitKey(id: KeyId): boolean {
  return id >= '0' && id <= '9';
}

/**
 * Calculator UI state machine. All expression editing and evaluation rules
 * live in {@link CalculatorEngine}; this component only routes button and
 * keyboard input through it and renders state.
 */
@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CalculatorDisplay, HistoryPanel],
  templateUrl: './calculator.html',
  styleUrl: './calculator.css',
})
export class Calculator {
  private readonly engine = inject(CalculatorEngine);
  private readonly clipboard = inject(ClipboardService);
  protected readonly history = inject(HistoryService);
  protected readonly themeService = inject(ThemeService);

  protected readonly keypad = KEYPAD;

  private readonly expression = signal('');
  private readonly error = signal<string | null>(null);
  private readonly lastResult = signal<string | null>(null);
  private readonly lastRaw = signal<number | null>(null);
  private readonly lastExpression = signal<string | null>(null);
  private readonly justEvaluated = signal(false);
  protected readonly copied = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly theme = this.themeService.theme;

  /** Expression rendered with pretty operator symbols. */
  protected readonly displayExpression = computed(() =>
    this.engine.toDisplaySymbols(this.expression()),
  );

  /** Live preview of the current expression; null while incomplete/invalid. */
  protected readonly preview = computed<string | null>(() => {
    if (this.justEvaluated() || this.error() !== null) {
      return null;
    }
    const expr = this.expression();
    if (!this.engine.isComplete(expr)) {
      return null;
    }
    const result = this.engine.evaluate(expr);
    if (!result.ok) {
      return null;
    }
    const formatted = this.engine.formatResult(result.value);
    return formatted === expr ? null : formatted;
  });

  protected readonly topLine = computed<string>(() => {
    if (this.justEvaluated()) {
      const expr = this.lastExpression();
      return expr === null ? '' : `${this.engine.toDisplaySymbols(expr)} =`;
    }
    return this.displayExpression();
  });

  protected readonly mainText = computed<string>(() => {
    const failure = this.error();
    if (failure !== null) {
      return failure;
    }
    if (this.justEvaluated()) {
      return this.lastResult() ?? '0';
    }
    const expr = this.displayExpression();
    return this.preview() ?? (expr === '' ? '0' : expr);
  });

  protected readonly tone = computed<DisplayTone>(() => {
    if (this.error() !== null) {
      return 'error';
    }
    return this.justEvaluated() ? 'result' : 'entry';
  });

  /** Text the copy button would copy; empty when there is nothing to copy. */
  protected readonly copyText = computed<string>(() => {
    if (this.error() !== null) {
      return '';
    }
    if (this.justEvaluated()) {
      return this.lastResult() ?? '';
    }
    return this.preview() ?? '';
  });

  // ------------------------------------------------------------------ input

  protected handleKey(id: KeyId): void {
    if (isDigitKey(id)) {
      if (this.justEvaluated()) {
        this.startNewEntry();
      }
      this.expression.update((expr) => this.engine.inputDigit(expr, id));
      this.afterInput();
      return;
    }

    switch (id) {
      case '.':
        if (this.justEvaluated()) {
          this.startNewEntry();
        }
        this.expression.update((expr) => this.engine.inputDecimal(expr));
        this.afterInput();
        break;
      case '%':
        if (this.justEvaluated()) {
          this.seedFromResult();
        }
        this.expression.update((expr) => this.engine.inputPercent(expr));
        this.afterInput();
        break;
      case '(':
        if (this.justEvaluated()) {
          this.startNewEntry();
        }
        this.expression.update((expr) => this.engine.inputParen(expr, '('));
        this.afterInput();
        break;
      case ')':
        if (this.justEvaluated()) {
          break;
        }
        this.expression.update((expr) => this.engine.inputParen(expr, ')'));
        this.afterInput();
        break;
      case '+':
      case '-':
      case '*':
      case '/':
        if (this.justEvaluated()) {
          this.seedFromResult();
        }
        this.expression.update((expr) => this.engine.inputOperator(expr, id));
        this.afterInput();
        break;
      case 'sign':
        if (this.justEvaluated()) {
          this.seedFromResult();
        }
        this.expression.update((expr) => this.engine.toggleSign(expr));
        this.afterInput();
        break;
      case 'backspace':
        this.pressBackspace();
        break;
      case 'clear-entry':
        this.pressClearEntry();
        break;
      case 'all-clear':
        this.resetAll();
        break;
      case 'equals':
        this.pressEquals();
        break;
    }
  }

  private pressEquals(): void {
    const expr = this.expression();
    if (expr === '' || this.justEvaluated()) {
      return;
    }
    if (!this.engine.isComplete(expr)) {
      this.error.set(CALCULATOR_ERROR_MESSAGES.INVALID_EXPRESSION);
      return;
    }
    const result = this.engine.evaluate(expr);
    if (!result.ok) {
      this.error.set(CALCULATOR_ERROR_MESSAGES[result.error]);
      return;
    }
    const formatted = this.engine.formatResult(result.value);
    this.history.add(expr, this.engine.toDisplaySymbols(expr), formatted);
    this.lastExpression.set(expr);
    this.lastResult.set(formatted);
    this.lastRaw.set(result.value);
    this.justEvaluated.set(true);
  }

  private pressBackspace(): void {
    if (this.justEvaluated()) {
      this.seedFromResult();
    }
    this.error.set(null);
    this.expression.update((expr) => this.engine.deleteLast(expr));
  }

  private pressClearEntry(): void {
    if (this.justEvaluated()) {
      this.resetAll();
      return;
    }
    this.error.set(null);
    this.expression.update((expr) => this.engine.clearEntry(expr));
  }

  private resetAll(): void {
    this.expression.set('');
    this.error.set(null);
    this.lastResult.set(null);
    this.lastRaw.set(null);
    this.lastExpression.set(null);
    this.justEvaluated.set(false);
  }

  /** Begin a fresh expression, discarding the previous result. */
  private startNewEntry(): void {
    this.expression.set('');
    this.justEvaluated.set(false);
    this.lastExpression.set(null);
  }

  /** Continue calculating from the previous numeric result. */
  private seedFromResult(): void {
    const raw = this.lastRaw();
    this.justEvaluated.set(false);
    this.lastExpression.set(null);
    this.expression.set(raw === null ? '' : String(raw));
  }

  private afterInput(): void {
    this.error.set(null);
  }

  // ---------------------------------------------------------------- keyboard

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    // Let focused buttons handle Enter/Space natively to avoid double input.
    if (tag === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
      return;
    }
    if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      this.themeService.toggle();
      return;
    }
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      this.history.clear();
      return;
    }
    const id = Calculator.keyIdForKey(event.key);
    if (id === null) {
      return;
    }
    event.preventDefault();
    this.handleKey(id);
  }

  /** Map a physical keyboard key onto a keypad key. Exposed for testing. */
  static keyIdForKey(key: string): KeyId | null {
    if (/^[0-9]$/.test(key)) {
      return key as KeyId;
    }
    switch (key) {
      case '.':
      case ',':
        return '.';
      case '+':
        return '+';
      case '-':
        return '-';
      case '*':
      case 'x':
      case 'X':
        return '*';
      case '/':
        return '/';
      case '%':
        return '%';
      case '(':
        return '(';
      case ')':
        return ')';
      case 'Enter':
      case '=':
        return 'equals';
      case 'Backspace':
        return 'backspace';
      case 'Escape':
      case 'Delete':
      case 'c':
      case 'C':
        return 'all-clear';
      case 's':
      case 'S':
        return 'sign';
      default:
        return null;
    }
  }

  // ----------------------------------------------------------------- actions

  protected async copyResult(): Promise<void> {
    const text = this.copyText();
    if (text === '') {
      return;
    }
    const ok = await this.clipboard.copy(text);
    if (!ok) {
      return;
    }
    this.copied.set(true);
    if (this.copyTimer !== undefined) {
      clearTimeout(this.copyTimer);
    }
    this.copyTimer = setTimeout(() => this.copied.set(false), COPY_FEEDBACK_MS);
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected reuseEntry(entry: HistoryEntry): void {
    this.expression.set(entry.expression);
    this.error.set(null);
    this.lastResult.set(null);
    this.lastRaw.set(null);
    this.lastExpression.set(null);
    this.justEvaluated.set(false);
  }
}
