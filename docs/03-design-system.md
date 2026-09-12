# RepoLens — Design System

_Phase 3 output (UI/Visual Designer), revised in the frontend redesign pass._

## Direction

Serious, dense, calm. The interface should read like a tool an engineer keeps open all day, not a
marketing surface. Principles extracted (not copied) from strong developer products:

- **Linear:** one neutral scale does nearly all the work; borders are lighter than text; radii stay
  tight; the accent appears on links, focus and the active navigation marker and almost nowhere
  else.
- **GitHub:** dense lists and tables with generous line height; monospace wherever an identifier,
  path or number appears.
- **Vercel:** near-monochrome surfaces, strong typographic hierarchy, black primary buttons.
- **Sentry / Datadog:** semantic colour reserved for severity and health; charts on quiet grids.
- **Raycast:** the command palette is a first-class navigation primitive.

What we deliberately avoid: decorative gradients, glassmorphism, oversized rounded cards, floating
cards for everything, drop shadows on static content, blobs and illustrations, rainbow category
colours, giant dashboard headings, and unbounded whitespace.

## Typography

- **UI:** `Inter` (variable) with system fallback (`ui-sans-serif, system-ui`).
- **Code, paths, identifiers, table numbers:** `JetBrains Mono` with `ui-monospace` fallback.
  `font-variant-numeric: tabular-nums` (`.tabular`) wherever numbers align.
- Scale (px / line-height): 11/16 `2xs` captions and eyebrows, 12/18 `xs` metadata and table
  cells, 13/20 `sm` body (default), 14/22 `base` landing copy, 16/24 `lg` panel titles, 20/28 `xl`
  page titles, 24/30 `2xl` figures, 32/36 `3xl`, 44/48 `4xl` hero and health score.
  Weights 400, 500, 600 only.
- Letter spacing: -0.01em on titles from 20px, -0.02em on the hero and the health number. Uppercase
  labels (`.eyebrow`) are 11px, +0.06em, `--fg-tertiary`.
- Page titles are 20px. Content should start high on the screen; no page needs a 32px heading.

## Spacing and layout

4px base. Application shell: 48px top bar, 224px left sidebar (collapses into a sheet below
`lg`), content column max 1280px with 16/24/32px gutters at `sm`/`md`/`lg`. Marketing pages use a
1120px column.

Lists inside panels are hairline-divided rows (`.hairlines`), 8px vertical padding, 16px horizontal.
Panel headers are 40px. Tables use 8px 12px cells and a `--bg-subtle` header.

## Colour

One neutral scale, both themes first-class. Tokens live in `apps/web/src/app/globals.css` and are
exposed to Tailwind through `@theme inline` (`bg-bg`, `text-fg-secondary`, `border-border`, …).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #ffffff | #0e0e10 | page and panels |
| `--bg-subtle` | #fafafa | #121214 | sidebar, table headers, code blocks |
| `--bg-muted` | #f4f4f5 | #19191d | hover, inline code, skeletons |
| `--bg-emphasis` | #ededef | #222227 | pressed segments, bar tracks |
| `--border` | #e6e6e9 | #26262c | hairlines and panel borders |
| `--border-strong` | #d4d4d9 | #38383f | inputs, selects, emphasised borders |
| `--fg` | #18181b | #ededf0 | primary text, primary buttons |
| `--fg-secondary` | #5f5f6b | #a3a3ae | secondary text |
| `--fg-tertiary` | #8a8a96 | #71717c | captions, eyebrows, disabled |
| `--accent` | #3b50c9 | #9aabff | links, focus ring, active nav marker, trend line |
| `--accent-subtle` | #eef0fb | #1d2242 | accent tint for badges and selection |

Semantic colours carry meaning only; every one has a `-subtle` tint for badges and highlighted
rows.

| Token | Light | Dark | Meaning |
| --- | --- | --- | --- |
| `--critical` | #c22c2c | #f27d7d | severity critical, score < 50 |
| `--high` | #c2560f | #f0a06a | severity high, score 50–64 |
| `--medium` | #a8720b | #e2c15a | severity medium, score 65–79 |
| `--low` | #4b6ea8 | #8fb0e6 | severity low |
| `--info` | #6f6f7b | #9a9aa6 | informational |
| `--good` | #1f7a45 | #6fcf8f | score ≥ 80, improved, resolved |

Score status words: ≥ 90 Excellent, ≥ 80 Good, ≥ 65 Fair, ≥ 50 Poor, below Critical.

Chart palette (categorical, ordered): `--chart-1` (accent) … `--chart-6`. Charts are used only
where a shape carries information (health over time, commits per week); everything else is a
number in a row with a thin proportional bar.

## Shape

Radii: 3px chips and kbd, 4px controls and inputs, 6px panels and popovers, 8px dialogs. Borders
1px. Shadows only on floating layers (`--shadow-sm` inputs, `--shadow-md` menus, `--shadow-lg`
sheets and dialogs); the dark theme replaces the ambient shadow with a 1px ring.

## Primitives (`apps/web/src/components/ui`)

- **Button** (`button.tsx`): sizes sm 28px, md 32px, lg 36px, icon variants; variants `primary`
  (fg on inverse), `secondary` (bg + border-strong), `ghost`, `destructive`, `link`. `asChild`
  for anchors; `loading` swaps the icon for a spinner.
- **Badge** (`badge.tsx`): neutral, outline, accent and semantic tones; `SeverityDot` (6px),
  `SeverityLabel` (dot + word), `SeverityBadge` (uppercase tinted pill, used once per detail view),
  `StatusBadge`, `StepBadge`, `DemoBadge`.
- **Panel** (`panel.tsx`): bordered container with `PanelHeader` (title, muted description, action)
  and optional footer. Not a card: no shadow, no padding by default; contents are lists or tables.
- **Metric** (`metric.tsx`): `MetricList` and `MetricRow` (label, hint, tabular value, tone)
  replace stat tiles; `Figure` for one headline number; `Bar` for proportional bars.
- **Score** (`score.tsx`): `HealthScore` (44px number, status word, delta, thin bar; announced as
  "Health score: 82 of 100, Good"), `ScoreRow` (label, delta, score, bar), `ScoreText`, `Delta`,
  `Sparkline`. There is no gauge or ring.
- **Table** (`table.tsx`): `--bg-subtle` header, 12px uppercase column labels, numeric columns
  right-aligned and tabular, interactive rows on hover.
- **Inputs** (`input.tsx`): `Input`, `NativeSelect` (with chevron), `Checkbox` (row with count),
  `SegmentedControl` (fieldset of `aria-pressed` buttons), `Kbd`.
- **Code** (`code.tsx`): dependency-free tokenizer for TS/JS with `.tok-*` classes; `CodeBlock`
  with line numbers and a highlighted line; `InlineCode`; `FilePath` (directory muted, file name
  emphasised, optional `:line`).
- **Feedback** (`feedback.tsx`): `Skeleton`, `SkeletonText`, `SkeletonRows` (shapes match the
  final content), `EmptyState`, `ErrorState` (message, request id, retry), `InlineSpinner`.
- **Page** (`page.tsx`): `PageHeader` (20px title, description, meta line, actions) and
  `SplitLayout`.
- **Overlay** (`overlay.tsx`): `Tooltip`, `Dialog`, `SheetContent` (right-hand detail panel, 640px,
  48px header), dropdown menu, popover.
- **Command palette** (`layout/command-palette.tsx`): pages, repository sections, repositories.

## Application shell

Top bar: logo, repository breadcrumb, primary navigation (Demo, Repositories), search trigger,
theme toggle, account menu or "Connect GitHub". Sidebar: Overview, Findings (with count),
Architecture, Dependencies, Testing, Complexity, Git history, Analyses, followed by the "Viewing"
block (analysis selector, commit date, "Switch to latest", in-progress chip) and the analyze
button for owners. The active item has a 2px `--fg` marker on the left edge and a muted background.

## Iconography

`lucide-react`, 16px in controls, 14px inline with text, stroke 1.75. No coloured icons outside
status indicators. No brand icons from lucide; GitHub uses a local SVG.

## Motion

120ms ease-out for hover and focus, 180ms for sheets and menus (`anim-fade`, `anim-rise`,
`anim-slide`), none for data updates so tables never jitter. `prefers-reduced-motion` disables all
animation and transitions.

## Voice

Sentences, not slogans. Numbers with units. Errors say what happened and what to do next. Panel
descriptions are lower-case fragments after the title ("most severe first", "newest first").
