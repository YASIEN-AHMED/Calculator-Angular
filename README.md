# 🧮 Calculator Angular

A modern, fully-featured calculator built with **Angular 21** — designed with clean architecture, a stateless calculation engine, and a polished UI supporting both light and dark themes.

---

## ✨ Features

- **Full arithmetic support** — addition, subtraction, multiplication, division
- **Advanced operations** — percentage (`%`), parentheses `()`, sign toggle (`±`), decimal input
- **Smart percent logic** — context-aware: `200 + 5%` computes as `200 + 10` (5% of 200)
- **Live expression preview** — see the result before pressing `=`
- **Calculation history** — browse and reuse previous expressions
- **Light / Dark theme** — toggle with a click or press `T`
- **Clipboard copy** — copy results with one click, with visual feedback
- **Full keyboard support** — use the numpad or keyboard naturally
- **Error handling** — clear messages for divide-by-zero, overflow, and invalid expressions
- **Floating-point correction** — mitigates classic JS precision issues (e.g. `0.1 + 0.2`)

---

## 🏗️ Architecture

```
src/app/
├── core/
│   ├── calculator-engine.service.ts   # Stateless parsing & evaluation engine (tokenizer → RPN → result)
│   ├── history.service.ts             # Manages calculation history (signal-based)
│   ├── clipboard.service.ts           # Clipboard abstraction
│   ├── theme.service.ts               # Light/dark theme management
│   └── models.ts                      # Shared domain types & error codes
└── features/
    └── calculator/
        ├── calculator.ts              # Main UI state machine (routes input → engine)
        ├── display.ts                 # Expression & result display component
        └── history-panel.ts          # Collapsible calculation history panel
```

The `CalculatorEngine` is a **pure, stateless service** — it never stores state. All UI state is managed in the `Calculator` component using Angular **Signals**.

---

## 🚀 Getting Started

### Prerequisites

- Node.js `>=18`
- npm `>=10`

### Install & Run

```bash
npm install
npm start
```

Open your browser at `http://localhost:4200`.

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `0–9` | Digit input |
| `+ - * /` | Operators |
| `.` or `,` | Decimal point |
| `%` | Percentage |
| `( )` | Parentheses |
| `Enter` or `=` | Evaluate |
| `Backspace` | Delete last character |
| `Escape` / `Delete` / `C` | All clear |
| `S` | Toggle sign (±) |
| `T` | Toggle light/dark theme |
| `H` | Clear history |

---

## 🛠️ Tech Stack

| Technology | Version |
|-----------|---------|
| Angular | ^21.2.0 |
| TypeScript | ~5.9.2 |
| RxJS | ~7.8.0 |
| Vitest | ^4.0.8 |
| Prettier | ^3.8.1 |

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
