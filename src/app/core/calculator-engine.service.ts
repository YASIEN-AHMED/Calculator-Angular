import { Injectable } from '@angular/core';
import type { BinaryOperator, CalculatorErrorCode, EvaluateResult } from './models';

/**
 * Stateless calculation engine. All parsing, validation and input-editing
 * rules live here so the UI component stays thin and no logic is duplicated
 * between button, keyboard and programmatic input paths.
 *
 * Expressions are plain strings using ASCII operators: + - * / % ( ) .
 * Display symbols (× ÷ −) are converted via `toDisplaySymbols` only for
 * rendering, never for evaluation.
 */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'operator'; op: BinaryOperator }
  | { kind: 'unary'; op: '+' | '-' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const BINARY_OPS: readonly BinaryOperator[] = ['+', '-', '*', '/'];
const MAX_EXPRESSION_LENGTH = 100;
const MAX_DECIMALS = 10;

function isBinaryOpChar(ch: string): ch is BinaryOperator {
  return (BINARY_OPS as readonly string[]).includes(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

@Injectable({ providedIn: 'root' })
export class CalculatorEngine {
  // ---------------------------------------------------------------- evaluate

  /** Parse and evaluate an expression. Never throws for user input. */
  evaluate(expression: string): EvaluateResult {
    try {
      const tokens = this.tokenize(expression);
      if (tokens === null || tokens.length === 0) {
        return { ok: false, error: 'INVALID_EXPRESSION' };
      }
      const withPercent = this.applyPercent(tokens);
      if (withPercent === null) {
        return { ok: false, error: 'INVALID_EXPRESSION' };
      }
      const rpn = this.toRpn(withPercent);
      if (rpn === null) {
        return { ok: false, error: 'INVALID_EXPRESSION' };
      }
      return this.evaluateRpn(rpn);
    } catch {
      return { ok: false, error: 'INVALID_EXPRESSION' };
    }
  }

  /** Normalize UI/keyboard symbols to canonical ASCII operators. */
  normalize(raw: string): string {
    return raw
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\s+/g, '');
  }

  private tokenize(rawExpression: string): Token[] | null {
    const expression = this.normalize(rawExpression);
    if (expression.length === 0 || expression.length > MAX_EXPRESSION_LENGTH) {
      return null;
    }
    if (!/^[0-9+\-*/.%()eE]*$/.test(expression)) {
      return null;
    }

    const tokens: Token[] = [];
    let i = 0;
    /** True when the next +/- must be read as a unary sign. */
    let expectUnary = true;

    while (i < expression.length) {
      const ch = expression[i];

      if (isDigit(ch) || ch === '.') {
        // Mantissa with an optional scientific exponent (e.g. "1.5e-7",
        // which is how very large/small continued results are stored).
        const match = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(expression.slice(i));
        if (match === null || match[0].length === 0) {
          return null; // lone '.' or otherwise malformed number
        }
        const raw = match[0];
        const value = Number.parseFloat(raw);
        if (Number.isNaN(value)) {
          return null;
        }
        // Non-finite literals (e.g. "1e999") flow through so evaluation
        // reports OVERFLOW instead of crashing or misreporting.
        tokens.push({ kind: 'number', value });
        i += raw.length;
        expectUnary = false;
        continue;
      }

      if (ch === '+' || ch === '-') {
        if (expectUnary) {
          tokens.push({ kind: 'unary', op: ch });
        } else {
          tokens.push({ kind: 'operator', op: ch });
          expectUnary = true;
        }
        i += 1;
        continue;
      }

      if (ch === '*' || ch === '/') {
        if (expectUnary) {
          return null; // expression cannot start with * or / , nor follow an operator
        }
        tokens.push({ kind: 'operator', op: ch });
        expectUnary = true;
        i += 1;
        continue;
      }

      if (ch === '(') {
        tokens.push({ kind: 'lparen' });
        expectUnary = true;
        i += 1;
        continue;
      }

      if (ch === ')') {
        tokens.push({ kind: 'rparen' });
        expectUnary = false;
        i += 1;
        continue;
      }

      if (ch === '%') {
        // Postfix percent marker, resolved in applyPercent().
        this.pushPercentMarker(tokens);
        i += 1;
        expectUnary = false;
        continue;
      }

      return null;
    }

    return tokens;
  }

  /** Token marker for the postfix percent sign. Kept private to the engine. */
  private pushPercentMarker(tokens: Token[]): void {
    (tokens as Array<Token | { kind: 'percent' }>).push({ kind: 'percent' });
  }

  /**
   * Resolve postfix '%' operators.
   *
   * - `N%`                    → N / 100
   * - `A + B%` / `A - B%`     → A + (A*B/100) / A - (A*B/100)  ("B percent of A")
   * - `A * B%` / `A / B%`     → A * (B/100) / A / (B/100)
   * - `(group)%`              → (group) / 100
   * The base `A` may itself be a parenthesized group.
   */
  private applyPercent(tokens: Token[]): Token[] | null {
    const extended = tokens as Array<Token | { kind: 'percent' }>;
    const out: Array<Token | { kind: 'percent' }> = [];

    for (const token of extended) {
      if (token.kind !== 'percent') {
        out.push(token);
        continue;
      }
      const target = out.pop();
      if (target === undefined || (target.kind !== 'number' && target.kind !== 'rparen')) {
        return null; // '%' must directly follow a value
      }

      const beforeOp = out[out.length - 1];
      const beforeBase = out[out.length - 2];
      const isAdaptivePosition =
        beforeOp !== undefined &&
        beforeOp.kind === 'operator' &&
        (beforeOp.op === '+' || beforeOp.op === '-') &&
        beforeBase !== undefined &&
        (beforeBase.kind === 'number' || beforeBase.kind === 'rparen');

      if (!isAdaptivePosition) {
        if (target.kind === 'number') {
          out.push({ kind: 'number', value: target.value / 100 });
        } else {
          // (group)%  →  (group) / 100
          out.push(target);
          out.push({ kind: 'operator', op: '/' });
          out.push({ kind: 'number', value: 100 });
        }
        continue;
      }

      // Adaptive case: B% of base A  →  (A * B / 100).
      if (target.kind === 'number') {
        const baseValue = this.staticValueOf(out, out.length - 2);
        if (baseValue !== null) {
          out.push({ kind: 'number', value: (baseValue * target.value) / 100 });
          continue;
        }
      }
      // Fallback for group targets or non-constant bases: rewrite
      // `A op B%` into `A op (A_tokens * B_tokens / 100)`.
      // Note: `out` still ends with the `op`; the base ends at length - 2.
      const baseStart = this.findBaseStart(out, out.length - 2);
      if (baseStart === null) {
        return null;
      }
      const baseTokens = out.slice(baseStart, out.length - 1);
      const percentValue: Array<Token | { kind: 'percent' }> =
        target.kind === 'number'
          ? [{ kind: 'number', value: target.value }]
          : [target];
      out.push({ kind: 'lparen' });
      out.push(...baseTokens);
      out.push({ kind: 'operator', op: '*' });
      out.push(...percentValue);
      out.push({ kind: 'operator', op: '/' });
      out.push({ kind: 'number', value: 100 });
      out.push({ kind: 'rparen' });
    }

    return out as Token[];
  }

  /** Constant value of a number token, honouring a leading unary minus. */
  private staticValueOf(tokens: Array<Token | { kind: 'percent' }>, index: number): number | null {
    const token = tokens[index];
    if (token === undefined || token.kind !== 'number') {
      return null;
    }
    const sign = tokens[index - 1];
    if (sign !== undefined && sign.kind === 'unary' && sign.op === '-') {
      return -token.value;
    }
    return token.value;
  }

  /** Start index of the base operand (number with optional sign, or full group). */
  private findBaseStart(
    tokens: Array<Token | { kind: 'percent' }>,
    baseIndex: number,
  ): number | null {
    const base = tokens[baseIndex];
    if (base === undefined) {
      return null;
    }
    if (base.kind === 'number') {
      const sign = tokens[baseIndex - 1];
      if (sign !== undefined && sign.kind === 'unary') {
        return baseIndex - 1;
      }
      return baseIndex;
    }
    if (base.kind === 'rparen') {
      let depth = 0;
      for (let i = baseIndex; i >= 0; i -= 1) {
        const current = tokens[i];
        if (current.kind === 'rparen') {
          depth += 1;
        } else if (current.kind === 'lparen') {
          depth -= 1;
          if (depth === 0) {
            const sign = tokens[i - 1];
            if (sign !== undefined && sign.kind === 'unary') {
              return i - 1;
            }
            return i;
          }
        }
      }
    }
    return null;
  }

  /** Shunting-yard conversion to Reverse Polish Notation. */
  private toRpn(tokens: Token[]): Token[] | null {
    const output: Token[] = [];
    const stack: Token[] = [];

    const precedence = (token: Token): number => {
      if (token.kind === 'unary') {
        return 3;
      }
      if (token.kind === 'operator') {
        return token.op === '*' || token.op === '/' ? 2 : 1;
      }
      return 0;
    };

    for (const token of tokens) {
      if (token.kind === 'number') {
        output.push(token);
      } else if (token.kind === 'unary') {
        stack.push(token);
      } else if (token.kind === 'operator') {
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (
            (top.kind === 'operator' || top.kind === 'unary') &&
            (precedence(top) > precedence(token) ||
              (precedence(top) === precedence(token) && token.kind === 'operator'))
          ) {
            const popped = stack.pop();
            if (popped !== undefined) {
              output.push(popped);
            }
          } else {
            break;
          }
        }
        stack.push(token);
      } else if (token.kind === 'lparen') {
        stack.push(token);
      } else if (token.kind === 'rparen') {
        let foundOpen = false;
        while (stack.length > 0) {
          const top = stack.pop();
          if (top === undefined) {
            break;
          }
          if (top.kind === 'lparen') {
            foundOpen = true;
            break;
          }
          output.push(top);
        }
        if (!foundOpen) {
          return null; // unbalanced closing parenthesis
        }
      }
    }

    while (stack.length > 0) {
      const top = stack.pop();
      if (top === undefined) {
        break;
      }
      if (top.kind === 'lparen' || top.kind === 'rparen') {
        return null; // unbalanced opening parenthesis
      }
      output.push(top);
    }

    return output;
  }

  private evaluateRpn(rpn: Token[]): EvaluateResult {
    const stack: number[] = [];

    for (const token of rpn) {
      if (token.kind === 'number') {
        stack.push(token.value);
      } else if (token.kind === 'unary') {
        const value = stack.pop();
        if (value === undefined) {
          return { ok: false, error: 'INVALID_EXPRESSION' };
        }
        stack.push(token.op === '-' ? -value : value);
      } else if (token.kind === 'operator') {
        const right = stack.pop();
        const left = stack.pop();
        if (left === undefined || right === undefined) {
          return { ok: false, error: 'INVALID_EXPRESSION' };
        }
        const result = this.applyOperator(left, right, token.op);
        if (result === null) {
          return { ok: false, error: 'DIVIDE_BY_ZERO' };
        }
        if (!Number.isFinite(result)) {
          return { ok: false, error: 'OVERFLOW' };
        }
        stack.push(result);
      } else {
        return { ok: false, error: 'INVALID_EXPRESSION' };
      }
    }

    if (stack.length !== 1) {
      return { ok: false, error: 'INVALID_EXPRESSION' };
    }
    const value = stack[0];
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'OVERFLOW' };
    }
    if (Number.isNaN(value)) {
      return { ok: false, error: 'INVALID_EXPRESSION' };
    }
    return { ok: true, value: this.correctFloat(value) };
  }

  private applyOperator(left: number, right: number, op: BinaryOperator): number | null {
    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (right === 0) {
          return null;
        }
        return left / right;
    }
  }

  /** Reduce binary floating-point artefacts (e.g. 0.1 + 0.2). */
  private correctFloat(value: number): number {
    if (!Number.isFinite(value) || Number.isInteger(value)) {
      return value;
    }
    const corrected = Number.parseFloat(value.toPrecision(12));
    return Number.isFinite(corrected) ? corrected : value;
  }

  // ---------------------------------------------------------------- formatting

  /** Format a finite result for display, using exponent form for extremes. */
  formatResult(value: number): string {
    if (!Number.isFinite(value)) {
      return 'Overflow';
    }
    if (Number.isNaN(value)) {
      return 'Invalid';
    }
    const corrected = this.correctFloat(value);
    if (corrected === 0) {
      return '0';
    }
    const abs = Math.abs(corrected);
    if (abs >= 1e12 || abs < 1e-9) {
      return this.trimExponential(corrected.toExponential(6));
    }
    const rounded = Number.parseFloat(corrected.toFixed(MAX_DECIMALS));
    const plain = String(rounded);
    if (plain.length > 14) {
      return this.trimExponential(corrected.toExponential(6));
    }
    return plain;
  }

  private trimExponential(text: string): string {
    return text.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
  }

  /** Map canonical operators to pretty display symbols. */
  toDisplaySymbols(expression: string): string {
    return expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
  }

  // ------------------------------------------------------------ input editing
  // Each method takes the current expression and returns the next expression.
  // Invalid keystrokes are ignored (input returned unchanged) so the UI can
  // never construct a malformed expression from buttons or the keyboard.

  inputDigit(expression: string, digit: string): string {
    if (!/^[0-9]$/.test(digit)) {
      return expression;
    }
    if (expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    const last = expression[expression.length - 1];
    if (last === ')' || last === '%') {
      return `${expression}*${digit}`;
    }
    const segment = this.trailingNumberSegment(expression);
    if (segment === '0') {
      return `${expression.slice(0, -1)}${digit}`;
    }
    if (segment === '-0' || segment === '(-0') {
      return `${expression.slice(0, -1)}${digit}`;
    }
    return `${expression}${digit}`;
  }

  inputOperator(expression: string, op: BinaryOperator): string {
    if (expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    if (expression.length === 0) {
      // A leading '-' starts a negative number; other operators are meaningless.
      return op === '-' ? '-' : expression;
    }
    const last = expression[expression.length - 1];

    if (isDigit(last) || last === ')' || last === '%' || last === '.') {
      const base = last === '.' ? expression.slice(0, -1) : expression;
      if (base.length === 0) {
        return expression;
      }
      return `${base}${op}`;
    }

    if (last === '(') {
      // Only a unary minus may directly follow an opening parenthesis.
      return op === '-' ? `${expression}-` : expression;
    }

    if (isBinaryOpChar(last)) {
      if (op === '-' && (last === '*' || last === '/')) {
        return `${expression}-`; // e.g. "5*" + "-" → "5*-" (negative operand)
      }
      // Collapse a dangling unary minus before replacing, e.g. "5*-" + "+" → "5+".
      const withoutUnary = this.stripTrailingUnaryMinus(expression);
      return `${withoutUnary.slice(0, -1)}${op}`;
    }

    if (last === '-') {
      // Trailing unary minus: replace the whole operator tail.
      const withoutUnary = this.stripTrailingUnaryMinus(expression);
      if (withoutUnary.length === 0) {
        return op === '-' ? '-' : expression;
      }
      const prev = withoutUnary[withoutUnary.length - 1];
      if (prev !== undefined && isBinaryOpChar(prev)) {
        return `${withoutUnary.slice(0, -1)}${op}`;
      }
      return expression;
    }

    return expression;
  }

  inputDecimal(expression: string): string {
    if (expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    const last = expression[expression.length - 1];
    if (last === ')' || last === '%') {
      return `${expression}*0.`;
    }
    const segment = this.trailingNumberSegment(expression);
    if (segment.includes('.') || /[eE]/.test(segment)) {
      return expression; // one decimal point per number; never inside an exponent
    }
    if (segment === '' || segment === '-') {
      return `${expression}0.`;
    }
    return `${expression}.`;
  }

  inputPercent(expression: string): string {
    if (expression.length === 0 || expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    const last = expression[expression.length - 1];
    if (isDigit(last) || last === ')' || last === '%') {
      return `${expression}%`;
    }
    return expression;
  }

  inputParen(expression: string, paren: '(' | ')'): string {
    if (expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    if (paren === '(') {
      const last = expression[expression.length - 1];
      if (expression.length === 0 || last === undefined) {
        return '(';
      }
      if (isDigit(last) || last === ')' || last === '%' || last === '.') {
        return `${expression}*(`; // implicit multiplication: "2(" → "2*("
      }
      return `${expression}(`;
    }
    // Closing parenthesis: requires a matching opener and a value before it.
    const last = expression[expression.length - 1];
    if (!isDigit(last) && last !== ')' && last !== '%') {
      return expression;
    }
    if (this.openParenBalance(expression) <= 0) {
      return expression;
    }
    return `${expression})`;
  }

  /** Toggle the sign of the trailing number or parenthesized group. */
  toggleSign(expression: string): string {
    if (expression.length === 0) {
      return '-';
    }
    if (expression.length >= MAX_EXPRESSION_LENGTH) {
      return expression;
    }
    const last = expression[expression.length - 1];

    if (isDigit(last)) {
      const segment = this.trailingNumberSegment(expression);
      const start = expression.length - segment.length;
      const before = expression.slice(0, start);
      if (segment.startsWith('-')) {
        return `${before}${segment.slice(1)}`;
      }
      // A leading digit run without an explicit sign: negate it.
      if (before.endsWith('(-')) {
        return `${before.slice(0, -1)}${segment}`;
      }
      return `${before}-${segment}`;
    }

    if (last === ')') {
      const openIndex = this.findMatchingOpenParen(expression, expression.length - 1);
      if (openIndex === null) {
        return expression;
      }
      // A unary minus directly inside negates the group: removing it toggles.
      if (expression[openIndex + 1] === '-') {
        return expression.slice(0, openIndex + 1) + expression.slice(openIndex + 2);
      }
      const signIndex = openIndex - 1;
      if (expression[signIndex] === '-' && this.isUnaryPosition(expression, signIndex)) {
        return expression.slice(0, signIndex) + expression.slice(openIndex);
      }
      return `${expression.slice(0, openIndex)}-${expression.slice(openIndex)}`;
    }

    if (last === '(' || (isBinaryOpChar(last) && last !== '-')) {
      return `${expression}-`;
    }

    if (last === '-') {
      // Remove a dangling unary minus, otherwise replace a binary minus.
      const withoutUnary = this.stripTrailingUnaryMinus(expression);
      if (withoutUnary.length < expression.length) {
        return withoutUnary;
      }
      return `${expression.slice(0, -1)}+`;
    }

    return expression;
  }

  /** Remove the last character (backspace). */
  deleteLast(expression: string): string {
    if (expression.length === 0) {
      return expression;
    }
    return expression.slice(0, -1);
  }

  /** Clear the number currently being typed (clear-entry). */
  clearEntry(expression: string): string {
    if (expression.length === 0) {
      return expression;
    }
    const segment = this.trailingNumberSegment(expression);
    if (segment.length === 0 || !/[0-9]/.test(segment)) {
      return expression;
    }
    return expression.slice(0, expression.length - segment.length);
  }

  /** True when the expression ends with a complete, evaluable value. */
  isComplete(expression: string): boolean {
    if (expression.length === 0) {
      return false;
    }
    const last = expression[expression.length - 1];
    if (isDigit(last) || last === ')' || last === '%') {
      return true;
    }
    // A trailing dot is evaluable ("5." means 5), so '=' accepts it.
    if (last === '.') {
      return this.isComplete(expression.slice(0, -1));
    }
    return false;
  }

  // ------------------------------------------------------------------ helpers

  /** Digits (and exponent) of the number currently being typed. */
  private trailingNumberSegment(expression: string): string {
    const match = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.exec(expression);
    if (match === null) {
      return '';
    }
    let start = match.index;
    // Include a unary sign that belongs to this number.
    if (
      start > 0 &&
      expression[start - 1] === '-' &&
      this.isUnaryPosition(expression, start - 1)
    ) {
      start -= 1;
    }
    return expression.slice(start);
  }

  /** True when position `index` holds a unary sign rather than subtraction. */
  private isUnaryPosition(expression: string, index: number): boolean {
    if (index === 0) {
      return true;
    }
    const prev = expression[index - 1];
    return prev === '(' || isBinaryOpChar(prev);
  }

  /** Remove one dangling unary minus at the end (e.g. "5*-" → "5*"). */
  private stripTrailingUnaryMinus(expression: string): string {
    if (!expression.endsWith('-')) {
      return expression;
    }
    const index = expression.length - 1;
    if (this.isUnaryPosition(expression, index)) {
      return expression.slice(0, -1);
    }
    return expression;
  }

  private openParenBalance(expression: string): number {
    let balance = 0;
    for (const ch of expression) {
      if (ch === '(') {
        balance += 1;
      } else if (ch === ')') {
        balance -= 1;
      }
    }
    return balance;
  }

  private findMatchingOpenParen(expression: string, closeIndex: number): number | null {
    let depth = 0;
    for (let i = closeIndex; i >= 0; i -= 1) {
      if (expression[i] === ')') {
        depth += 1;
      } else if (expression[i] === '(') {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return null;
  }

  get maxExpressionLength(): number {
    return MAX_EXPRESSION_LENGTH;
  }

  get errorForEmptyInput(): CalculatorErrorCode {
    return 'INVALID_EXPRESSION';
  }
}
