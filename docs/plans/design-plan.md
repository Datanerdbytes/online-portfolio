# Design Plan — Roel Somido Resume & Portfolio

## Brief
**Subject:** Roel Somido — Data Analytics & Data Engineering Candidate, Claveria, Misamis Oriental (Philippines). B.S. IT graduate transitioning from technical support to data engineering/analytics (Medallion pipelines, dbt, BigQuery/Snowflake, SQL Server/PostgreSQL, Python, Tableau/Plotly Dash).
**Audience:** Hiring managers, recruiters, technical leads evaluating a data candidate.
**Primary job:** Communicate skills, experience, and contact options clearly; establish credibility through precise, structured presentation — not decoration.

## Design direction
Data engineering is about precision, structure, and transforming raw inputs into trusted outputs. The visual identity should reflect that: restrained, structured, legible, with a single memorable element (the hero typography). Everything else stays quiet and disciplined.

Avoid the listed AI defaults: warm-cream + terracotta, near-black + acid-green accent, ALL-CAPS tracked-out eyebrows, monospace face for small data labels, "→" appended to links, and identical rounded SaaS cards. Numbered workflow markers (01/INGEST …) are kept because the hero illustration is genuinely a sequence (ingest → transform → understand).

## Color — 6 named hex values

| Role | Name | Hex (light) | Hex (dark) |
| --- | --- | --- | --- |
| Background | `paper` | `#F7F5F0` | `#14110E` |
| Foreground | `ink` | `#231B17` | `#EAE6DC` |
| Primary (accent) | `teal` | `#0E4D64` | `#7FB6C8` |
| Primary foreground | `teal-ink` | `#FFFFFF` | `#0B2A35` |
| Muted | `dusk` | `#7A746C` | `#AEA698` |
| Border | `shell` | `#D9D4C9` | `#3A332E` |

Rationale: warm paper + deep ink is legible and distinctive (not cream #F4F1EA). Deep teal reads as data/flow without being the generic "data green" or acid-green dark-mode cliché. One accent color only; boldness spent in the hero, everything else quiet.

## Type
Two families, clearly distinct:
- **Geist Sans** (already loaded via next/font): UI, headings, body. Deliberate scale with tight display sizes and readable body.
- **Geist Mono** (already loaded): used sparingly, only where it encodes information (the hero workflow labels). Not used as a default for small data labels.

Type scale (clamped for responsiveness):
- `h1` hero name: `clamp(40px, 5vw, 60px)`, weight 700, `letter-spacing: -0.05em`, line-height 1.1
- `h2` section headings: `clamp(26px, 3vw, 34px)`, weight 700
- `h3`: `17px`, weight 600
- `body`: `15px`, line-height 1.7, max width ~75 ch
- `eyebrow`: `11px`, weight 600, sentence case, modest letter-spacing, NOT all-caps, NOT tracked-out
- `small`: `11px`–`12px`, sans-serif

## Layout
- Keep the fixed left sidebar (a deliberate, non-default layout choice), recolored to the ink/teal palette.
- All prose left-aligned (resume content reads best left-aligned; not centered or justified).
- Line lengths constrained below ~80 characters for body text.
- Content width `min(100% - 96px, 1120px)` retained.
- Section padding retained; tinted sections reduced to a subtle shell wash.

## Principles
1. One memorable element: bold hero typography + data-workflow illustration.
2. Visual structure encodes information, not decoration.
3. Motion minimal and reduced-motion respected (already handled).
4. Visible keyboard focus, accessible contrast, responsive down to mobile.
5. Copy: sentence case, plain language, each element one job; placeholder/sample content explicitly labeled.
