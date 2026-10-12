import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Calculator, type KeyId } from './calculator';

function mainText(fixture: { nativeElement: unknown }): string {
  const root = fixture.nativeElement as HTMLElement;
  return root.querySelector('.display-main')?.textContent?.trim() ?? '';
}

function topLine(fixture: { nativeElement: unknown }): string {
  const root = fixture.nativeElement as HTMLElement;
  return root.querySelector('.display-expression')?.textContent?.trim() ?? '';
}

const KEY_LABELS: Record<KeyId, string> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '+': '+', '-': '−', '*': '×', '/': '÷', '.': '.',
  '%': '%', '(': '(', ')': ')', equals: '=', 'all-clear': 'AC',
  'clear-entry': 'C', backspace: '⌫', sign: '±',
};

type CalculatorFixture = ReturnType<typeof TestBed.createComponent<Calculator>>;

/** Press keypad buttons through the real DOM, exercising template bindings. */
function press(fixture: CalculatorFixture, ...ids: KeyId[]): void {
  const root = fixture.nativeElement as HTMLElement;
  const buttons = Array.from(root.querySelectorAll('.keypad .key'));
  for (const id of ids) {
    const label = KEY_LABELS[id];
    const button = buttons.find(
      (candidate): candidate is HTMLButtonElement =>
        candidate instanceof HTMLButtonElement && candidate.textContent?.trim() === label,
    );
    if (button === undefined) {
      throw new Error(`Keypad button "${label}" not found`);
    }
    button.click();
  }
  fixture.detectChanges();
}

describe('Calculator', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Calculator],
    }).compileComponents();
  });

  function setup(): { fixture: ReturnType<typeof TestBed.createComponent<Calculator>> } {
    const fixture = TestBed.createComponent(Calculator);
    fixture.detectChanges();
    return { fixture };
  }

  it('creates the component showing zero', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance).toBeTruthy();
    expect(mainText(fixture)).toBe('0');
  });

  it('shows a live preview while typing', () => {
    const { fixture } = setup();
    press(fixture, '1', '2', '+', '3');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('15');
    expect(topLine(fixture)).toBe('12+3');
  });

  it('evaluates on equals and records history', () => {
    const { fixture } = setup();
    press(fixture, '2', '+', '3', 'equals');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('5');
    expect(topLine(fixture)).toBe('2+3 =');
    const historyItems = fixture.nativeElement.querySelectorAll('.history-item');
    expect(historyItems.length).toBe(1);
  });

  it('continues calculating from the previous result', () => {
    const { fixture } = setup();
    press(fixture, '2', '+', '3', 'equals', '*', '4', 'equals');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('20');
  });

  it('starts a fresh entry when a digit follows evaluation', () => {
    const { fixture } = setup();
    press(fixture, '2', '+', '3', 'equals', '7');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('7');
  });

  it('shows a friendly error for division by zero', () => {
    const { fixture } = setup();
    press(fixture, '5', '/', '0', 'equals');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('Cannot divide by zero');
  });

  it('shows a friendly error for incomplete expressions', () => {
    const { fixture } = setup();
    press(fixture, '5', '/', 'equals');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('Invalid expression');
  });

  it('clears the error as soon as input resumes', () => {
    const { fixture } = setup();
    press(fixture, '5', '/', '0', 'equals', 'all-clear');
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('0');
  });

  it('supports backspace and clear entry', () => {
    const { fixture } = setup();
    press(fixture, '1', '2', 'backspace');
    fixture.detectChanges();
    expect(topLine(fixture)).toBe('1');
    press(fixture, '+', '3', '4', 'clear-entry');
    fixture.detectChanges();
    expect(topLine(fixture)).toBe('1+');
  });

  it('toggles the sign of the current entry', () => {
    const { fixture } = setup();
    press(fixture, '5', 'sign');
    fixture.detectChanges();
    expect(topLine(fixture)).toBe('−5');
  });

  it('reuses a history entry when clicked', () => {
    const { fixture } = setup();
    press(fixture, '2', '+', '3', 'equals');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const reuse = root.querySelector('.history-reuse');
    expect(reuse).not.toBeNull();
    (reuse as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(topLine(fixture)).toBe('2+3');
  });

  it('maps keyboard keys onto keypad keys', () => {
    expect(Calculator.keyIdForKey('Enter')).toBe('equals');
    expect(Calculator.keyIdForKey('=')).toBe('equals');
    expect(Calculator.keyIdForKey('Escape')).toBe('all-clear');
    expect(Calculator.keyIdForKey('Backspace')).toBe('backspace');
    expect(Calculator.keyIdForKey('x')).toBe('*');
    expect(Calculator.keyIdForKey(',')).toBe('.');
    expect(Calculator.keyIdForKey('s')).toBe('sign');
    expect(Calculator.keyIdForKey('q')).toBeNull();
    expect(Calculator.keyIdForKey('5')).toBe('5');
  });

  it('handles real keyboard events end to end', () => {
    const { fixture } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(mainText(fixture)).toBe('4');
  });
});
