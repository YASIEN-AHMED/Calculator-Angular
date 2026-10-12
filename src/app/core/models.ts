/** Shared domain types for the calculator application. */

export type BinaryOperator = '+' | '-' | '*' | '/';

export type CalculatorErrorCode =
  | 'DIVIDE_BY_ZERO'
  | 'INVALID_EXPRESSION'
  | 'OVERFLOW';

export type EvaluateResult =
  | { ok: true; value: number }
  | { ok: false; error: CalculatorErrorCode };

export interface HistoryEntry {
  id: string;
  expression: string;
  displayExpression: string;
  result: string;
  createdAt: number;
}

export type Theme = 'light' | 'dark';

/** User-friendly messages for every calculation error code. */
export const CALCULATOR_ERROR_MESSAGES: Record<CalculatorErrorCode, string> = {
  DIVIDE_BY_ZERO: 'Cannot divide by zero',
  INVALID_EXPRESSION: 'Invalid expression',
  OVERFLOW: 'Result too large',
};
