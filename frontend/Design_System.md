# FinanceOS — Design System & UI Guidelines

> **Version:** 1.0  
> **Last Updated:** 2026-04-02  
> **Status:** Active — reference this document before making any UI changes  
> **Stack:** React · Chart.js · Tailwind (or plain CSS with the tokens below)

---

## 1. Philosophy

Every screen in FinanceOS follows three principles:

1. **Consistency over cleverness** — use the established tokens and patterns. New components should feel like they were always there.
2. **Data first** — the UI exists to surface numbers clearly. Decoration serves data, never the other way around.
3. **Dark, calm, professional** — this is a personal finance tool. The aesthetic should feel trustworthy and focused, not flashy.

---

## 2. Color Tokens

These are the only colors used anywhere in the application. Reference them as CSS variables or Tailwind config values.

### Background Layer

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0B0D16` | Page/app background |
| `--bg-sidebar` | `#0E1020` | Left navigation sidebar |
| `--bg-card` | `#141826` | All cards, panels, modals |
| `--bg-input` | `#1A1F30` | Form inputs, dropdowns |
| `--bg-hover` | `rgba(255,255,255,0.04)` | Hover state on nav items and rows |
| `--bg-tooltip` | `#1E2435` | Chart tooltips and popovers |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#F1F5F9` | Headings, values, primary labels |
| `--text-secondary` | `#94A3B8` | Body text, descriptions |
| `--text-muted` | `#475569` | Meta info, dates, sub-labels |
| `--text-hint` | `#5E6E85` | Placeholder text, inactive nav items |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--border-default` | `0.5px solid rgba(255,255,255,0.07)` | Cards, panels |
| `--border-subtle` | `0.5px solid rgba(255,255,255,0.05)` | Table row dividers |
| `--border-sidebar` | `0.5px solid rgba(255,255,255,0.06)` | Sidebar right edge |
| `--border-emphasis` | `0.5px solid rgba(255,255,255,0.1)` | Active inputs, chart tooltips |

### Semantic Colors (Meaning-Driven)

These colors are **reserved for their specific semantic meaning** and must not be used decoratively.

| Role | Color | Hex | Opacity variants |
|---|---|---|---|
| Income / Success / Primary CTA | **Green** | `#10B981` | `rgba(16,185,129,0.12)` for badge bg / `0.06` for chart fill |
| Expense / Warning / Over-budget | **Orange** | `#F97316` | `rgba(249,115,22,0.12)` for badge bg / `0.05` for chart fill |
| Debt / Danger / Critical | **Red** | `#EF4444` | `rgba(239,68,68,0.12)` for badge bg |
| Savings / Goals | **Purple** | `#A78BFA` | `rgba(167,139,250,0.12)` for badge bg |
| Information / Bank / Transfer | **Blue** | `#38BDF8` | `rgba(56,189,248,0.12)` for badge bg |
| Neutral / Disabled / Other | **Slate** | `#475569` | `rgba(71,85,105,0.15)` for badge bg |

### Category Colors (Charts & Budget)

Always use these exact colors for spending categories, in this order, for consistency across charts:

| Category | Color |
|---|---|
| Housing / Rent | `#6366F1` |
| Food & Dining | `#10B981` |
| Transport | `#F97316` |
| Shopping | `#38BDF8` |
| Health | `#A78BFA` |
| Other | `#475569` |

If new categories are added, extend the list using the next unused semantic color before introducing custom hex values.

---

## 3. Typography

**Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`  
No external fonts are loaded. The system font stack ensures fast load times.

### Type Scale

Only these sizes are used in the application. No exceptions.

| Role | Size | Weight | Color | Usage |
|---|---|---|---|---|
| Page title | `21px` | `600` | `--text-primary` | Top of every view ("Transactions", "Dashboard") |
| Page subtitle | `13px` | `400` | `--text-hint` | Descriptor below page title |
| Section header | `14px` | `500` | `--text-primary` | Card/panel titles |
| Body | `13px` | `400` | `--text-primary` | Table rows, list items, descriptions |
| Meta / label | `11px` | `400` | `--text-muted` | Dates, methods, secondary context |
| KPI value | `20–22px` | `600` | `--text-primary` | Big numbers in stat cards |
| KPI label | `11px` | `400` | `--text-hint` | Label above a KPI value (`letter-spacing: 0.5px`) |
| Badge / pill | `11–12px` | `500` | semantic | Status badges, filter pills |
| Chart axis | `11px` | `400` | `--text-hint` | Chart.js axis ticks |

### Letter Spacing

- Page titles and KPI values: `letter-spacing: -0.5px` (tighter, feels premium)
- KPI labels and column headers: `letter-spacing: 0.5px` (wider, feels structured)
- All other text: default

---

## 4. Layout & Spacing

### Application Shell

```
┌─────────────────────────────────────────────────────┐
│  SIDEBAR (210px fixed)  │  MAIN AREA (flex: 1)      │
│  bg: #0E1020            │  bg: #0B0D16              │
│  border-right: --border-sidebar                      │
│                         │  overflow-y: auto          │
│  Logo (22px top pad)    │  padding: 28px             │
│  ─────────────────      │                            │
│  Nav items              │  [Page Header]             │
│  ─────────────────      │  [Summary Cards Row]       │
│  User avatar (bottom)   │  [Main Content Grid]       │
└─────────────────────────────────────────────────────┘
```

### Page Padding

Every view uses `padding: 28px` on all sides inside the main area. Never vary this.

### Grid System

Use CSS Grid with `minmax(0, Nfr)` columns to prevent overflow:

| Layout | Columns | Gap |
|---|---|---|
| KPI stat cards | `repeat(4, minmax(0, 1fr))` | `12px` |
| Two-column (chart + secondary) | `minmax(0, 1.9fr) minmax(0, 1fr)` | `12px` |
| Even two-column | `repeat(2, minmax(0, 1fr))` | `12px` |
| Summary stat row (3 cards) | `repeat(3, minmax(0, 1fr))` | `12px` |
| Savings goals | `repeat(3, minmax(0, 1fr))` | `14px` |

### Spacing Scale

| Value | Usage |
|---|---|
| `4px` | Icon-to-label gap, tight internal padding |
| `6px` | Dot-to-label gap in legends and category rows |
| `8px` | Gap inside filter pill groups, small internal margins |
| `10px` | Nav item vertical padding, row spacing |
| `12px` | Card gap (grid), form element gaps |
| `14px` | Card internal padding for compact panels |
| `16px` | Standard margin between sections inside a card |
| `18px` | Section header margin-bottom |
| `20px` | Card padding (standard) |
| `24px` | Between major sections on a page |
| `28px` | Page outer padding |
| `48px` | Empty state / placeholder top padding |

---

## 5. Components

### 5.1 Card

The single reusable surface. Used for every panel, stat block, and data section.

```css
.card {
  background: #141826;
  border-radius: 12px;
  border: 0.5px solid rgba(255, 255, 255, 0.07);
  padding: 20px;
}
```

**Rules:**
- No shadow on cards — border only
- No hover state on static cards
- Nested cards are not allowed
- Padding is always `20px` unless explicitly `18px` for compact stat cards

### 5.2 KPI Stat Card

Used in the 4-column row at the top of the dashboard and in the 3-column summary row on sub-pages.

```
┌─────────────────────────────┐
│ NET BALANCE          [icon] │  ← 11px, #5E6E85, letter-spacing 0.5px
│                             │
│ $5,502.45                   │  ← 20–22px, weight 600, #F1F5F9
│                             │
│ ▲ 12.5%  vs last month      │  ← 11px, green/orange + #475569
└─────────────────────────────┘
```

The delta indicator uses `▲` (green, `#10B981`) for positive and `▼` (orange, `#F97316`) for negative. The suffix "vs last month" is always `#475569`.

### 5.3 Navigation Item

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  font-size: 13px;
  color: #5E6E85;
  cursor: pointer;
  border-right: 2px solid transparent;
  transition: color 0.15s, background 0.15s;
}

.nav-item:hover {
  color: #CBD5E1;
  background: rgba(255, 255, 255, 0.04);
}

.nav-item.active {
  color: #10B981;
  background: rgba(16, 185, 129, 0.08);
  border-right-color: #10B981;
}
```

- Icon: 15×15px SVG, `stroke-width: 1.6`, inherits color
- Badge (for alerts count): `background: #EF4444`, `color: #fff`, `font-size: 10px`, `padding: 1px 6px`, `border-radius: 10px`

### 5.4 Status Badge / Pill

```
Paid     → bg: rgba(16,185,129,0.12)  text: #10B981
Unpaid   → bg: rgba(71,85,105,0.15)   text: #94A3B8
Due soon → bg: rgba(249,115,22,0.12)  text: #F97316
Overdue  → bg: rgba(239,68,68,0.12)   text: #EF4444
Income   → bg: rgba(16,185,129,0.12)  text: #10B981
Expense  → bg: rgba(249,115,22,0.10)  text: #F97316
```

Always: `padding: 2px 8px`, `border-radius: 10px`, `font-size: 11px`, `font-weight: 500`.  
Never use borders on badges.

### 5.5 Filter / Period Pill

Used for period selectors (This month / Last month / …) and tab filters on the Transactions page.

```css
.pill {
  background: transparent;
  border: none;
  color: #5E6E85;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.pill.active {
  background: #10B981;
  color: #022c22;
  font-weight: 500;
}

.pill:hover:not(.active) {
  color: #CBD5E1;
  background: rgba(255, 255, 255, 0.06);
}
```

The pill group container: `background: #141826`, `padding: 4px`, `border-radius: 22px`, `border: 0.5px solid rgba(255,255,255,0.07)`.

### 5.6 Progress Bar

Used on Budget and Savings Goal views.

```
Container: background rgba(255,255,255,0.06), border-radius 4–6px, height 5–8px
Fill:       category color (or #F97316 if over budget)
```

- Budget bars: `height: 5–7px`, `border-radius: 4px`
- Savings goal bars: `height: 8px`, `border-radius: 6px` (slightly bigger to indicate importance)
- Never animate on first render in production — use CSS `transition: width 0.3s` for contribution updates

### 5.7 Transaction / List Row

```css
.tx-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.05);
  cursor: default;
  transition: background 0.12s, padding 0.12s;
  border-radius: 6px;
}

.tx-row:hover {
  background: rgba(255, 255, 255, 0.03);
  padding-left: 4px;
  padding-right: 4px;
}
```

**Avatar / Initials Circle:**
- Size: `34–36px` diameter, `border-radius: 50%`
- Background: `rgba(accent, 0.13)` — e.g. `#1E2E3D` for blue, `#2D1B1B` for red
- Text: `font-size: 10px`, `font-weight: 700`, color = accent
- Initials: max 2 characters, uppercase

**Amount color:** positive amounts use `#10B981` (green), negative use `#F1F5F9` (default white — not red, as expenses are normal).

### 5.8 Action Buttons

| Type | Style |
|---|---|
| Primary CTA (add, save) | `background: #10B981`, `color: #022c22`, `font-weight: 500`, `border: none`, `padding: 8px 14px`, `border-radius: 8px` |
| Secondary (import, export) | `background: #141826`, `border: 0.5px solid rgba(255,255,255,0.1)`, `color: #CBD5E1`, `padding: 8px 14px`, `border-radius: 8px` |
| Ghost / "View all" link | No background, no border, `color: #10B981`, `font-size: 12px`, `cursor: pointer` |

### 5.9 Page Header Pattern

Every view in the app uses this exact header structure:

```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
  <div>
    <h1>Page Title</h1>          {/* 21px, weight 600 */}
    <p>Short description</p>     {/* 13px, color #5E6E85 */}
  </div>
  <button className="btn-primary">+ Add item</button>   {/* optional */}
</div>
```

---

## 6. Charts (Chart.js)

### Global Defaults

Set once in your app entry point (`main.jsx` or `App.jsx`):

```javascript
import { Chart, defaults } from 'chart.js';

defaults.color = '#5E6E85';
defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
defaults.font.size = 11;
```

### Tooltip Style (apply to all charts)

```javascript
tooltip: {
  backgroundColor: '#1E2435',
  titleColor: '#F1F5F9',
  bodyColor: '#94A3B8',
  borderColor: 'rgba(255, 255, 255, 0.1)',
  borderWidth: 0.5,
  padding: 10,
}
```

### Grid Lines (all charts with axes)

```javascript
scales: {
  x: {
    grid: { color: 'rgba(255, 255, 255, 0.04)' },
    border: { color: 'rgba(255, 255, 255, 0.06)' },
  },
  y: {
    grid: { color: 'rgba(255, 255, 255, 0.04)' },
    border: { color: 'rgba(255, 255, 255, 0.06)' },
  }
}
```

### Chart Legends

**Never use Chart.js built-in legends** (`legend: { display: false }` on all charts).  
Instead, build custom legends above the chart using the dot + label pattern:

```jsx
<div style={{ display: 'flex', gap: '14px' }}>
  <span><Dot color="#10B981" /> Income</span>
  <span><Dot color="#F97316" /> Expenses</span>
</div>
```

Dot: `width: 8px`, `height: 8px`, `border-radius: 50%`, inline-block.

### Chart Configs by Type

**Line / Area Chart (Overview)**
```javascript
{
  type: 'line',
  data: {
    datasets: [{
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.06)',  // subtle fill
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#10B981',
      pointBorderWidth: 0,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    // + tooltip and grid styles above
  }
}
```

**Doughnut Chart (Category Breakdown)**
```javascript
{
  type: 'doughnut',
  options: {
    cutout: '70%',
    plugins: { legend: { display: false } },
    // height container: 130–140px
  }
}
```

**Bar Chart (Budget / Activity)**
```javascript
{
  type: 'bar',
  data: {
    datasets: [{
      backgroundColor: categoryColor,  // or semantic color
      borderRadius: 4,
      barPercentage: 0.7,
    }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } } }  // no vertical grid lines on bar charts
  }
}
```

### Chart Container Heights

| Chart | Height |
|---|---|
| Overview line chart | `200px` |
| Expense donut | `130–140px` |
| Budget bar chart | `180px` |
| Debt payoff area chart | `220px` |
| Spending trends line chart | `200px` |

Always wrap in `<div style={{ height: 'Npx', position: 'relative' }}>` and pass `responsive: true, maintainAspectRatio: false` to Chart.js.

---

## 7. Views & Content Structure

Each view follows the same three-zone layout:

```
Zone 1: Page Header    (title + subtitle + optional CTA button)
Zone 2: Summary Cards  (3-column stat row — key numbers for this view)
Zone 3: Main Content   (cards with tables, charts, progress bars, etc.)
```

### Dashboard

| Zone | Content |
|---|---|
| Header | "Hello, [Name]!" + period selector pills |
| KPIs (4-col) | Net Balance · Income · Expenses · Savings |
| Row 2 (2:1) | Overview line chart · Expense donut + legend |
| Row 3 (1:1) | Budget progress bars · Recent transactions list |

### Transactions

| Zone | Content |
|---|---|
| Header | Title + Import CSV + Add transaction buttons |
| Filters | Pill group: All · Income · Expenses · This month · Last month |
| Table | Avatar · Name+Method · Date · Amount+Type badge |

### Budget

| Zone | Content |
|---|---|
| Header | Title + Set budget button |
| Stats (3-col) | Total planned · Total spent · Over-budget count |
| Main card | Grouped bar chart + per-category progress bar list |

### Bills & Subscriptions

| Zone | Content |
|---|---|
| Header | Title + Add bill button |
| Stats (3-col) | Monthly total · Due this week · Paid this month |
| Table | Name+Frequency · Amount · Due date · Status badge |

### Debt Tracker

| Zone | Content |
|---|---|
| Header | Title + Add debt button |
| Stats (3-col) | Total debt (red) · Monthly minimum · Avg. interest rate (orange) |
| Debt list | Name · Rate · Min payment · Balance · Progress bar |
| Simulator card | Waterfall vs Snowball comparison + extra payment slider |

### Savings Goals

| Zone | Content |
|---|---|
| Header | Title + New goal button |
| Cards (3-col grid) | Per goal: name · target · current · deadline · progress bar · % complete |

### Alerts

| Zone | Content |
|---|---|
| Header | Title + Mark all read button |
| Alert cards | Rule type badge · Message · Triggered time · Dismiss action |

---

## 8. Data Display Rules

### Numbers & Currency

- All currency values: `$X,XXX.XX` format — always 2 decimal places for amounts, none for whole-number KPIs where appropriate
- Percentages: `X.X%` — one decimal place
- Large balances: use `toLocaleString()` for thousands separators (`$27,500` not `$27500`)
- Delta indicators: `▲ 12.5%` or `▼ 8.3%` — always show one decimal

### Empty States

When a view has no data:

```
[Centered container, padding 48px top]
[32px emoji relevant to the section]
[15px "No [items] yet" heading]
[13px #5E6E85 description + suggestion]
[Primary CTA button to add the first item]
```

### Loading States

Use a subtle pulse animation on a `#1A1F30` placeholder block matching the expected content shape. Never show spinners for data that loads in under 500ms.

---

## 9. Icons

All icons are inline SVG, `15×15px`, `stroke-width: 1.6`, `fill: none`, `stroke: currentColor`.  
Icons inherit color from their parent — no hardcoded stroke colors.

| Section | Icon |
|---|---|
| Dashboard | Grid (4 rounded squares) |
| Transactions | Bulleted list |
| Budget | Bar chart (ascending bars) |
| Bills | Calendar |
| Debts | Credit card |
| Savings | Target / bullseye |
| Alerts | Bell |
| Settings | Gear / cog |

Action icons (add, edit, delete, chevron) follow the same style.

---

## 10. Sidebar Structure

```
┌──────────────────────┐
│  [Logo] FinanceOS    │  ← 15px, weight 600, logo accent #10B981
│                      │
│  MAIN MENU           │  ← 10px, #334155, letter-spacing 0.8px
│                      │
│  [ico] Dashboard     │  ← nav items
│  [ico] Transactions  │
│  [ico] Budget        │
│  [ico] Bills & Subs  │
│  [ico] Debt Tracker  │
│  [ico] Savings Goals │
│  [ico] Alerts    [3] │  ← badge for unread alerts
│  [ico] Settings      │
│                      │
│  ──────────────────  │  ← border-top
│  [avatar] Mark       │  ← 32px circle, initials, account type
│           Personal   │
└──────────────────────┘
```

---

## 11. Responsiveness Notes

The current design targets desktop (1200px+). For narrower screens:

- Below `900px`: collapse sidebar to icon-only mode (48px wide, tooltips on hover)
- Below `700px`: stack the 4 KPI cards to 2×2 grid
- Below `600px`: single-column layout for all card grids
- Charts should always use `responsive: true, maintainAspectRatio: false` so they reflow correctly

---

## 12. Do's and Don'ts

### ✅ Do

- Use the established tokens for every new component
- Keep new views within the 3-zone layout (header → stats → content)
- Use green for any positive action or income, orange for warnings and expenses
- Destroy Chart.js instances before re-rendering to avoid memory leaks
- Use `minmax(0, 1fr)` in CSS grid columns to prevent overflow

### ❌ Don't

- Add new colors outside the defined palette without updating this document
- Use Chart.js built-in legends (always build custom legends)
- Add box shadows to cards — border only
- Use font sizes outside the defined type scale
- Nest cards inside cards
- Use `position: fixed` for overlays — use in-flow modal patterns instead
- Use red for regular expense amounts — expenses are `#F1F5F9` (white), only truly negative events (overdue, danger) use red

---

## 13. Changelog

| Date | Version | Change |
|---|---|---|
| 2026-04-02 | 1.0 | Initial design system established from dashboard prototype |

---

*Update this document whenever a new pattern is introduced or an existing one changes. All team members should review this before implementing new UI features.*
