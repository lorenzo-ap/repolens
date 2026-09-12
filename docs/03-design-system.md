# RepoLens — Design System

_Phase 3 output (UI/Visual Designer)._

## Direction

Premium, technical, calm. Principles extracted (not copied) from strong developer products:

- **GitHub:** dense tables with generous line height; monospace where identifiers appear.
- **Linear:** one neutral scale doing most of the work; borders lighter than text; tight radii.
- **Vercel:** near-monochrome surfaces, strong typographic hierarchy, restraint with colour.
- **Sentry / Datadog:** semantic colour reserved for severity and health; charts on quiet grids.
- **Raycast:** command palette as a first-class navigation primitive.

What we avoid: gradients as decoration, glassmorphism, oversized rounded cards, emoji, purple
accents, hero illustrations, and unbounded whitespace.

## Typography

- **UI:** `Inter` (variable) with system fallback (`ui-sans-serif, system-ui`).
- **Code / identifiers / numbers in tables:** `JetBrains Mono` with `ui-monospace` fallback,
  `font-variant-numeric: tabular-nums` everywhere numbers align.
- Scale (px / line-height): 11/16 caption, 12/16 small, 13/20 body (default), 14/20 body-lg,
  16/24 h3, 20/28 h2, 28/34 h1, 40/44 display. Weights: 400, 500, 600 only.
- Letter spacing: -0.01em at ≥20px; uppercase labels at 11px use +0.04em.

## Spacing and layout

4px base. Scale: 1(4) 2(8) 3(12) 4(16) 5(20) 6(24) 8(32) 10(40) 12(48) 16(64).
Content max width 1440px; page gutter 24px (16px on mobile). Cards pad 16px; table cells 8px 12px.

## Colour

Neutral scale is the backbone. Light and dark are both first-class; tokens are defined for both.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #fafafa | #0a0a0b | page |
| `--surface` | #ffffff | #111113 | cards, panels |
| `--surface-2` | #f4f4f5 | #18181b | table headers, hover |
| `--border` | #e4e4e7 | #27272a | default border |
| `--border-strong` | #d4d4d8 | #3f3f46 | inputs, emphasised |
| `--fg` | #18181b | #fafafa | primary text |
| `--fg-muted` | #52525b | #a1a1aa | secondary text |
| `--fg-subtle` | #71717a | #71717a | captions |
| `--accent` | #2563eb | #3b82f6 | actions, links, focus |
| `--accent-fg` | #ffffff | #ffffff | on accent |

Semantic (same in both themes, tuned per theme for contrast):

| Token | Light | Dark | Meaning |
| --- | --- | --- | --- |
| `--critical` | #b91c1c | #f87171 | severity critical, score < 40 |
| `--high` | #c2410c | #fb923c | severity high, score 40–59 |
| `--medium` | #a16207 | #facc15 | severity medium, score 60–79 |
| `--low` | #1d4ed8 | #60a5fa | severity low |
| `--info` | #52525b | #a1a1aa | informational |
| `--good` | #15803d | #4ade80 | score ≥ 80, resolved |

Each semantic colour has a `-bg` variant at 10% alpha for badges.

Chart palette (categorical, ordered): accent, `#0891b2`, `#7c3aed`, `#db2777`, `#65a30d`, `#ea580c`.
Sequential (graph node density): neutral → `--medium` → `--critical`.

## Shape

Radii: 4px controls, 6px cards/inputs, 8px dialogs, full for pills. Borders 1px. Shadows only on
floating layers: `0 1px 2px rgb(0 0 0 / .06)` (popover), `0 8px 24px rgb(0 0 0 / .12)` (dialog).
Dark theme uses borders instead of shadows to separate surfaces.

## Components

- **Button:** sizes sm(28px) md(32px) lg(36px); variants primary (accent), secondary (surface +
  border), ghost, destructive. Icon-only buttons are square and require `aria-label`.
- **Input / Select / Combobox:** 32px, border-strong, focus ring 2px accent at 40% alpha outside.
- **Badge:** 20px, 11px uppercase for severity (`CRIT HIGH MED LOW INFO`); sentence case for others.
- **Card:** surface, border, 6px radius, optional header row with title (13px/600) and action.
- **Table:** sticky header on surface-2, 36px rows, zebra off, row hover surface-2, selected row
  accent-bg at 8%. Monospace for paths and numbers.
- **Score ring:** 96px SVG ring with grade letter; stroke colour from score band.
- **Stat tile:** label (11px uppercase muted), value (20px/600 tabular), delta chip.
- **Tabs:** underline style, 2px accent indicator, 36px tall.
- **Dialog / Sheet:** 8px radius, 24px padding, title 16px/600, focus trapped.
- **Command palette:** 560px wide, grouped results (Pages, Repositories, Findings), keyboard hints.
- **Code block:** monospace 12px/18px, surface-2 background, line numbers muted, highlighted line
  with `--medium-bg`.
- **Skeleton:** surface-2 blocks with a slow 1.6s shimmer; shapes match final content.
- **Toast:** bottom-right, 320px, title + description, auto-dismiss 5s, never for errors that need
  action (those render inline).
- **Charts (Recharts):** no 3D, no gradients; 1px grid lines at `--border`; tooltips on surface with
  border; axis labels 11px muted; line charts 1.5px stroke; area fills at 12% alpha.
- **Graph (xyflow):** nodes are 6px-radius rectangles with monospace label; edges 1px `--border-strong`,
  cycle edges `--critical` dashed; selected node accent outline.

## Iconography

`lucide-react`, 16px in controls, 14px inline with text, stroke 1.75. No coloured or filled icons
outside status indicators.

## Motion

120ms ease-out for hover/focus, 180ms for panel open/close, none for data updates (values swap
without animating, so tables never jitter). Respect `prefers-reduced-motion`.

## Voice

Sentences, not slogans. Numbers with units. Errors say what happened and what to do next.
