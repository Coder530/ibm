# Project: Local Grocery Price Optimizer

## Product Overview
A polished web app that takes the user's location and shopping list and finds the cheapest practical way to buy everything nearby.

Flow: user shares location (geolocation or postcode) → enters a shopping list (free text or items) → app matches items to real products → finds nearby stores/prices → compares basket cost across stores → recommends the cheapest option (single- or multi-store), showing distance, travel time, availability confidence, and substitutions.

**Primary goal:** "I have this shopping list — where can I buy it for the least money near me?" Minimize `groceries + meaningful travel cost/time + inconvenience`. Never recommend a multi-store split for trivial savings.

**Target users:** UK-based students, families, and budget shoppers doing a weekly shop. Architect for other countries/currencies later. Relevant retailers: Tesco, Sainsbury's, Asda, Morrisons, Aldi, Lidl, Waitrose, Co-op, Iceland, M&S Food, Ocado — but don't assume all have accessible real-time pricing; build the data layer so sources are swappable.

## Tech Direction
Use the existing stack if established; otherwise prefer Next.js, TypeScript, Tailwind, modern React, server actions/API routes, Postgres/Supabase if persistence is needed, a mapping/geocoding provider, and a legally permitted pricing data source. Avoid unnecessary infrastructure. Deployable to Vercel.

## Core UX

- **Landing page:** immediate value prop ("Find the cheapest way to do your shop"), no account required to try it.
- **Location:** "Use my location" (geolocation, permission requested only on intentional action, never on load) or manual postcode/address entry. Show resolved area before continuing. Don't store precise location unless the user opts in; allow changing/removing it; never leak precise coords into URLs.
- **Shopping list input:** accept free-form lines or natural language, parse into structured items:
  ```ts
  type ShoppingItem = { id: string; name: string; quantity: number; unit?: string; size?: string; category?: string }
  ```
  Let the user edit parsed items before comparing.
- **Product matching:** match user wording to real retailer products using semantic similarity, category, quantity, size/unit, brand, dietary needs, and availability — never treat materially different products as identical. Support modes: cheapest, closest match, brand-specific, own-brand allowed.
- **Unit normalization:** compute comparable unit prices (£/kg, £/litre, £/100g, £/item) — watch for multipacks, variable-weight items, promotions, meal deals, deposits, and loyalty pricing.

## Retailer Data Layer
Abstract retailer integrations behind adapters (`/data/retailers/{tesco,sainsburys,...}.ts`), not hard-coded logic. Core types:
```ts
interface Retailer { id: string; name: string; logo?: string }
interface ProductOffer { retailerId: string; productId: string; productName: string; price: number; currency: string; size?: string; unitPrice?: number; unit?: string; availability?: 'available'|'unavailable'|'unknown'; url?: string; confidence: number }
interface StoreLocation { retailerId: string; name: string; latitude: number; longitude: number; address: string; distanceMeters?: number }
```
Only use permitted data sources (no ToS-violating scraping). If pricing isn't live, label it (estimated/cached). Never fabricate prices.

## Store Discovery & Basket Optimization
Find stores within a configurable radius (default 5mi/8km, expandable), ranked by relevance/distance, with travel time where supported.

Core algorithm: for each item, find matching products/offers per store, compute single-store basket totals, then compare against multi-store splits. Only recommend splitting stores when savings clear a threshold (e.g. `MIN_MULTI_STORE_SAVING`, `MAX_RECOMMENDED_STORES`) after accounting for travel cost/time and inconvenience:
```
effectiveCost = basketCost + travelCost + inconveniencePenalty
```
Keep this formula isolated in an optimization layer so it's tunable. Consider availability confidence, transport mode, and user preferences (max distance, max stores, priority: cheapest/best-balance/fewest-stores/closest, brand preference, substitution policy).

## Results Page
Lead with the cheapest recommendation (total, store(s), distance, savings vs. next-best), then 2–3 alternative cards (best overall, cheapest single store, closest) — don't show every combination. Always include a full basket breakdown (item, store, price, qty, unit price, substitutions) and a plain-English savings explanation. Show confidence/freshness indicators (live/cached/stale) rather than implying real-time data when it isn't. Handle empty/error states explicitly: no location, no stores nearby, item not found, price unavailable (never invent a price — exclude and flag), partial baskets (state what's missing).

Use progressive loading (e.g. "Searching Tesco... ✓") rather than a long blank spinner.

## Design & Accessibility
Premium, fast, trustworthy, clean, data-driven — avoid generic AI gradients, glassmorphism, and gimmicks. Mobile-first (large touch targets, sticky basket summary, easy store switching); richer comparison views on desktop. Follow standard accessibility practices (semantic HTML, keyboard nav, focus states, contrast, reduced motion, no color-only signaling).

Use maps only when they materially aid the decision — basket comparison stays the primary experience.

## Auth & Monetization
No auth required for first comparison; design so saved lists/recurring shops/price history/alerts can be added later without gating the MVP. Monetize via affiliate/partnership/premium features — never let sponsored placements masquerade as the cheapest option; the optimizer must stay trustworthy.

## Architecture
```
app/            page.tsx, compare/, results/
components/     location/ shopping-list/ stores/ basket/ comparison/ maps/ ui/
lib/            location/ products/ retailers/ pricing/ optimization/ units/ validation/
data/retailers/
types/          shopping.ts products.ts retailers.ts optimization.ts
```
Keep business logic out of components; keep the optimization engine pure, independently testable, and typed (avoid `any`).

Preferred data flow: `Browser → Comparison API → Retailer adapters → Normalized offers → Optimization engine → Results` — don't have the browser call retailers directly. Use caching, parallel retailer queries, and request dedup server-side.

## Security & Trust
Validate/sanitize all input, rate-limit expensive comparisons, keep API keys server-side, treat external product/price data as untrusted, avoid storing location unless needed.

Never: fabricate a price, claim stock without evidence, present cached data as live, hide missing items from the total, let sponsorship bias the "cheapest" result, or silently substitute materially different products. If data is incomplete, say so.

## MVP Scope
- **P0:** location + postcode entry, list input/parsing, store discovery, product matching, price comparison, single-store basket, transparent breakdown, mobile UI, loading/error states.
- **P1:** multi-store optimization, travel consideration, substitutions, unit pricing, retailer/distance/store-count filters.
- **P2 (don't let this block MVP):** accounts, saved/recurring lists, price history, alerts, delivery integrations, affiliate links, personalization.

## Development Rules for Claude
Before coding: inspect the existing repo/architecture, reuse existing components, don't replace working infra needlessly.

While coding: strongly typed TypeScript (avoid `any`), focused components, data fetching separate from presentation, pure/testable optimization logic, real error handling. Never hard-code fake prices or present fake API responses as real — clearly mark mock data used only for pre-integration UI work.

UI must be production-quality (not a wireframe): hierarchy, spacing, typography, responsive/empty/loading/error states, accessibility, and purposeful micro-interactions only.

Testing: cover cheapest single-/two-store basket selection, marginal multi-store savings (should NOT split), missing/unavailable products, quantity & unit handling, duplicates, distance filtering, and preference changes.

**Definition of done:** happy path works, errors handled, loading states exist, mobile works, accessibility considered, business logic tested, no fake data presented as real, and a normal consumer can understand the cheapest way to buy their list within seconds of results loading.
