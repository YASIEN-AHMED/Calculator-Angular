import { beforeEach, describe, expect, it } from 'vitest';
import { CalculatorEngine } from './calculator-engine.service';

describe('CalculatorEngine', () => {
  let engine: CalculatorEngine;

  beforeEach(() => {
    engine = new CalculatorEngine();
  });

  function valueOf(expression: string): number {
    const result = engine.evaluate(expression);
    expect(result.ok).toBe(true);
    if (result.ok) {
      return result.value;
    }
    throw new Error('unreachable');
  }

  function errorOf(expression: string): string {
    const result = engine.evaluate(expression);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      return result.error;
    }
    throw new Error('unreachable');
  }

  describe('basic arithmetic', () => {
    it('adds, subtracts, multiplies and divides', () => {
      expect(valueOf('2+3')).toBe(5);
      expect(valueOf('10-4')).toBe(6);
      expect(valueOf('6*7')).toBe(42);
      expect(valueOf('8/2')).toBe(4);
    });

    it('handles multi-digit operands', () => {
      expect(valueOf('123+456')).toBe(579);
      expect(valueOf('1000-1')).toBe(999);
    });
  });

  describe('operator precedence', () => {
    it('multiplies/divides before adding/subtracting', () => {
      expect(valueOf('2+3*4')).toBe(14);
      expect(valueOf('10-2/2')).toBe(9);
      expect(valueOf('2*3+4*5')).toBe(26);
    });

    it('respects parentheses', () => {
      expect(valueOf('(2+3)*4')).toBe(20);
      expect(valueOf('((1+2)*(3+4))/7')).toBe(3);
      expect(valueOf('-(2+3)')).toBe(-5);
    });

    it('evaluates left-associative chains', () => {
      expect(valueOf('100-10-5')).toBe(85);
      expect(valueOf('100/10/2')).toBe(5);
    });
  });

  describe('decimals', () => {
    it('adds decimal fractions without float artefacts', () => {
      expect(valueOf('0.1+0.2')).toBe(0.3);
      expect(valueOf('1.5*2')).toBe(3);
      expect(valueOf('2.5-0.5')).toBe(2);
    });

    it('accepts leading-dot and trailing-dot numbers', () => {
      expect(valueOf('.5+.5')).toBe(1);
      expect(valueOf('5.+3')).toBe(8);
    });
  });

  describe('negative numbers', () => {
    it('supports leading negatives and unary minus', () => {
      expect(valueOf('-5+3')).toBe(-2);
      expect(valueOf('5*-3')).toBe(-15);
      expect(valueOf('(-5)*2')).toBe(-10);
      expect(valueOf('--5')).toBe(5);
    });

    it('negates parenthesized groups', () => {
      expect(valueOf('-(2+3)*2')).toBe(-10);
    });
  });

  describe('percentage', () => {
    it('treats a lone percent as division by 100', () => {
      expect(valueOf('50%')).toBe(0.5);
      expect(valueOf('50%*200')).toBe(100);
    });

    it('computes percent-of-base after + and -', () => {
      expect(valueOf('200+10%')).toBe(220);
      expect(valueOf('200-10%')).toBe(180);
    });

    it('treats percent as /100 after * and /', () => {
      expect(valueOf('200*10%')).toBe(20);
      expect(valueOf('200/10%')).toBe(2000);
    });

    it('supports percent of a parenthesized base', () => {
      expect(valueOf('(2+3)+10%')).toBe(5.5);
    });

    it('supports percent of a group target', () => {
      expect(valueOf('(2+3)%')).toBe(0.05);
    });
  });

  describe('division by zero', () => {
    it('reports DIVIDE_BY_ZERO', () => {
      expect(errorOf('5/0')).toBe('DIVIDE_BY_ZERO');
      expect(errorOf('0/0')).toBe('DIVIDE_BY_ZERO');
      expect(errorOf('10/(5-5)')).toBe('DIVIDE_BY_ZERO');
    });
  });

  describe('invalid expressions', () => {
    it('rejects empty and incomplete input', () => {
      expect(errorOf('')).toBe('INVALID_EXPRESSION');
      expect(errorOf('5+')).toBe('INVALID_EXPRESSION');
      expect(errorOf('+')).toBe('INVALID_EXPRESSION');
      expect(errorOf('*5')).toBe('INVALID_EXPRESSION');
    });

    it('rejects unbalanced parentheses', () => {
      expect(errorOf('(2+3')).toBe('INVALID_EXPRESSION');
      expect(errorOf('2+3)')).toBe('INVALID_EXPRESSION');
      expect(errorOf('()')).toBe('INVALID_EXPRESSION');
    });

    it('rejects malformed numbers and operators', () => {
      expect(errorOf('5..3')).toBe('INVALID_EXPRESSION');
      expect(errorOf('5/*3')).toBe('INVALID_EXPRESSION');
      expect(errorOf('abc')).toBe('INVALID_EXPRESSION');
      expect(errorOf('2&3')).toBe('INVALID_EXPRESSION');
      expect(errorOf('2(3)')).toBe('INVALID_EXPRESSION');
    });

    it('ignores whitespace', () => {
      expect(valueOf('2 3')).toBe(23);
      expect(valueOf(' 2 + 3 ')).toBe(5);
    });

    it('rejects misplaced percent signs', () => {
      expect(errorOf('%')).toBe('INVALID_EXPRESSION');
      expect(errorOf('5+%')).toBe('INVALID_EXPRESSION');
    });

    it('never throws for hostile input', () => {
      const hostile = ['(', ')', '%', '.', '-', '+', '((((', '))))', '%'.repeat(10)];
      for (const input of hostile) {
        expect(() => engine.evaluate(input)).not.toThrow();
      }
    });
  });

  describe('overflow and extremes', () => {
    it('reports OVERFLOW for non-finite literals and results', () => {
      expect(errorOf('1e999')).toBe('OVERFLOW');
      expect(errorOf('1e308*10')).toBe('OVERFLOW');
    });

    it('formats very large and very small results exponentially', () => {
      expect(engine.formatResult(1e21)).toContain('e');
      expect(engine.formatResult(0.000000000123)).toContain('e');
    });

    it('rounds repeating decimals for display', () => {
      expect(engine.formatResult(valueOf('1/3'))).toBe('0.3333333333');
    });

    it('normalizes zero', () => {
      expect(engine.formatResult(-0)).toBe('0');
      expect(engine.formatResult(0)).toBe('0');
    });

    it('evaluates scientific-notation operands', () => {
      expect(valueOf('1e3+2')).toBe(1002);
      expect(valueOf('1.5e-3*1000')).toBe(1.5);
    });
  });

  describe('input editing', () => {
    it('replaces consecutive binary operators', () => {
      expect(engine.inputOperator('5+', '-')).toBe('5-');
      expect(engine.inputOperator('5-', '+')).toBe('5+');
    });

    it('allows a unary minus after * and /', () => {
      expect(engine.inputOperator('5*', '-')).toBe('5*-');
      expect(engine.inputOperator('5*-', '+')).toBe('5+');
    });

    it('restricts operators at the start and after (', () => {
      expect(engine.inputOperator('', '+')).toBe('');
      expect(engine.inputOperator('', '-')).toBe('-');
      expect(engine.inputOperator('(', '+')).toBe('(');
      expect(engine.inputOperator('(', '-')).toBe('(-');
    });

    it('appends operators after values', () => {
      expect(engine.inputOperator('12', '+')).toBe('12+');
      expect(engine.inputOperator('(2+3)', '*')).toBe('(2+3)*');
      expect(engine.inputOperator('50%', '+')).toBe('50%+');
    });

    it('allows a single decimal point per number', () => {
      expect(engine.inputDecimal('12')).toBe('12.');
      expect(engine.inputDecimal('12.3')).toBe('12.3');
      expect(engine.inputDecimal('')).toBe('0.');
      expect(engine.inputDecimal('5+')).toBe('5+0.');
      expect(engine.inputDecimal('(2+3)')).toBe('(2+3)*0.');
    });

    it('prevents leading zeros', () => {
      expect(engine.inputDigit('0', '5')).toBe('5');
      expect(engine.inputDigit('-0', '5')).toBe('-5');
      expect(engine.inputDigit('10', '5')).toBe('105');
    });

    it('inserts implicit multiplication', () => {
      expect(engine.inputDigit('(2+3)', '2')).toBe('(2+3)*2');
      expect(engine.inputDigit('50%', '2')).toBe('50%*2');
      expect(engine.inputParen('2', '(')).toBe('2*(');
    });

    it('balances parentheses', () => {
      expect(engine.inputParen('(2+3', ')')).toBe('(2+3)');
      expect(engine.inputParen('2+3', ')')).toBe('2+3');
      expect(engine.inputParen('(2+', ')')).toBe('(2+');
    });

    it('accepts percent only after a value', () => {
      expect(engine.inputPercent('50')).toBe('50%');
      expect(engine.inputPercent('(2+3)')).toBe('(2+3)%');
      expect(engine.inputPercent('5+')).toBe('5+');
      expect(engine.inputPercent('')).toBe('');
    });

    it('toggles the sign of the trailing number', () => {
      expect(engine.toggleSign('5')).toBe('-5');
      expect(engine.toggleSign('-5')).toBe('5');
      expect(engine.toggleSign('12+5')).toBe('12+-5');
      expect(engine.toggleSign('')).toBe('-');
    });

    it('toggles the sign of parenthesized groups', () => {
      expect(engine.toggleSign('(2+3)')).toBe('-(2+3)');
      expect(engine.toggleSign('-(2+3)')).toBe('(2+3)');
      expect(engine.toggleSign('12+(-5)')).toBe('12+(5)');
    });

    it('deletes and clears entry', () => {
      expect(engine.deleteLast('123')).toBe('12');
      expect(engine.deleteLast('')).toBe('');
      expect(engine.clearEntry('12+34')).toBe('12+');
      expect(engine.clearEntry('12+')).toBe('12+');
      expect(engine.clearEntry('')).toBe('');
    });

    it('detects complete expressions', () => {
      expect(engine.isComplete('5')).toBe(true);
      expect(engine.isComplete('(2+3)')).toBe(true);
      expect(engine.isComplete('50%')).toBe(true);
      expect(engine.isComplete('5.')).toBe(true);
      expect(engine.isComplete('.')).toBe(false);
      expect(engine.isComplete('5+')).toBe(false);
      expect(engine.isComplete('')).toBe(false);
      expect(engine.isComplete('5*-')).toBe(false);
    });
  });

  describe('display helpers', () => {
    it('maps operators to display symbols', () => {
      expect(engine.toDisplaySymbols('5*3-2/4')).toBe('5×3−2÷4');
    });

    it('normalizes display symbols for evaluation', () => {
      expect(valueOf(engine.normalize('5×3÷2−1'))).toBe(6.5);
    });
  });
});
