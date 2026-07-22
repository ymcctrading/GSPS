# Insight 01 — Canonical Product Name

**Type:** Insight / Decision needed
**Priority:** Medium (affects branding, package names, UI headers, marketing)

## Problem
"GSPS" is expanded three different ways across the documents:
- **"Global Scanner & Charting Platform System"** — *7-21-26 prompt Claude code*, *7-21-26 for Claude code*
- **"Gann Strategy & Protocol System"** — *Updates for code 7-21-26* (handover doc)
- **"Gann-Sniper Protocol/Scanner"** — *GSPS v1.5.1.docx* (engine spec)

The *Ideally (GSPS)* doc also calls it "Gann Protocol/GSPS."

## Why it matters
The name shows up in UI headers, repo/package names, the marketing site, and
legal/brand copy. Three names means inconsistent branding and confusion for
anyone joining the project.

## My recommendation
Adopt **"Gann Strategy & Protocol System (GSPS)"** as the canonical product name.

Reasoning: the actual differentiator of this product is the **Gann + Sniper
trading logic** (that's the whole of `v1.5.1`). "Global Scanner & Charting
Platform System" is generic and could describe any charting app; it hides the
one thing that makes GSPS unique. Keep "Gann-Sniper Protocol/Scanner" as the
internal name for the *engine module* specifically, not the whole product.

## Action
- [ ] Confirm the canonical name.
- [ ] Find-and-replace across all docs and UI copy.
- [ ] Reserve it as the product/marketing name.
