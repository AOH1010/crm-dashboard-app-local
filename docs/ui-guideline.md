# CRM Dashboard: UI Guidelines & Design System

## Core Design Philosophy
The CRM Dashboard has been migrated from a legacy custom theme (Lime/Emerald Green `#B8FF68` with Dark Gray `#1C1D21`) to a **Premium Shadcn Zinc/Blue Theme**. 
All new UI components and feature pages MUST strictly adhere to this design system. We do NOT use hardcoded colors or arbitrary Tailwind utility colors (e.g., `bg-green-500`, `text-[#3c6600]`). Everything must route through our defined CSS variables.

## Figma Parity Reference
The target aesthetics are mapped to the premium **Shadcn UI Figma Library (Zinc & Blue presets)**.
Any "Lime" or "Bright Green" artifacts from older code are strictly considered bugs and should be replaced with the appropriate Shadcn tokens.

## Tailwind CSS Variables & Token Mapping
All custom styles are driven by `src/index.css`. Use the exact Tailwind aliases provided:

### Backgrounds & Containers
- `bg-background`: Main underlying page background.
- `bg-card`: Standard component surface (Cards, Panels, Dialogs).
- `bg-muted`: Soft secondary backgrounds (Hover states, disabled inputs, secondary badges). 
- `shadow-ambient`: Use for floating panels or highlighted cards.

### Text Colors
- `text-foreground`: Primary reading text.
- `text-muted-foreground`: Secondary text, labels, timestamps, and subtitles.
- `text-primary-foreground`: Text sitting on top of `bg-primary` (usually crisp white).

### Interactive & Brand Colors
- `bg-primary`: Our vibrant Shadcn Blue `oklch(0.546 0.245 262.881)`. Used for primary buttons, active states, active user chat bubbles, and progress bars.
- *(Do NOT use old hex codes like `#B8FF68` or `teal-500`).*

### Charting Colors (Monochrome Blue Scale)
We use a 5-step monochrome palette for all Recharts, Heatmaps, and Data Legends:
- `fill-chart-1` to `fill-chart-5` / `stroke-chart-1` to `stroke-chart-5`.
- Maps and Data Tables dynamically mix these variables using modern CSS features, e.g., `backgroundColor: color-mix(in srgb, var(--primary) 50%, transparent)`.

## Dos and Don'ts for Agent Implementations

✅ **DO:** 
- Use standard Shadcn components from `lucide-react` for icons with `text-muted-foreground` or `text-primary`.
- Rely entirely on semantic Tailwind classes (`bg-muted/50`, `text-card-foreground`).
- Extract dynamic colors via `var(--chart-1)` if inline React styles are absolutely necessary (e.g. SVG maps).

❌ **DON'T:**
- Use hardcoded Hex strings (e.g. `#1C1D21`, `#3c6600`, `#B8FF68`) in ANY component.
- Use explicit Tailwind standard palette colors (e.g. `bg-blue-500` or `text-sky-400`) unless mapping directly to Shadcn globals isn't possible.
- Mix legacy green themes. If you encounter `<div className="bg-[#B8FF68]">`, rewrite it immediately to `bg-primary`.
- Use old background opacities like `/65` or `/22`. Stick to standard `/10`, `/20`, `/50`, etc., when using Opacity Modifier Syntax.

## Dark Mode
Our `index.css` is perfectly tuned for Shadcn Dark Mode toggles using the `.dark` class block. Relying on the semantic variables above ensures instant zero-effort Dark Mode compatibility.
