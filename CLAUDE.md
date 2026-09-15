Project: Local Grocery Price Optimizer

Product Overview

Build a polished web application that uses the user's location and shopping list to find nearby grocery stores and determine the cheapest practical way to buy everything on the list.

The core user journey is:

User allows location access or enters a postcode/location manually.

User enters a shopping list, either as free-form text or individual items.

The app identifies the grocery products/items requested.

The app finds relevant nearby stores and available prices.

The app compares the total basket cost across stores.

The app recommends the cheapest option, while also showing distance, estimated travel time, product availability/confidence, and any important substitutions.

If buying from multiple stores saves a meaningful amount, the app can show an optimized multi-store basket and explain whether the extra travel is worth it.

The product should feel like a serious consumer utility, not a generic AI demo.

Primary Goal

Optimize for:

"I have this shopping list. Where can I buy it for the least money near me?"

The application should minimize the user's total effective cost:

groceries + meaningful travel cost/time + inconvenience

Do not blindly recommend the mathematically cheapest basket if it requires visiting several distant stores for tiny savings.

Target Users

Primary:

Students

Families

Budget-conscious shoppers

People comparing supermarkets

Users doing a weekly grocery shop

Initial market:

UK

Design the architecture so other countries/currencies can be supported later.

UK supermarkets that may be relevant include:

Tesco

Sainsbury's

Asda

Morrisons

Aldi

Lidl

Waitrose

Co-op

Iceland

M&S Food

Ocado

Do not assume every retailer has accessible real-time pricing. Build the data layer so sources can be swapped or added without rewriting the UI.

Tech Direction

Use the existing project stack if one is already established.

If starting from scratch, prefer:

Next.js

TypeScript

Tailwind CSS

Modern React

Server-side API routes/server actions where appropriate

PostgreSQL/Supabase if persistent storage is required

A mapping/geolocation provider for coordinates, distance and routing

A product/retailer pricing data source that is legally and technically permitted

Avoid unnecessary infrastructure.

The application should be deployable to a mainstream platform such as Vercel.

Core UX

Landing Page

The homepage should immediately communicate the value proposition.

Suggested headline:

Find the cheapest way to do your shop.

Supporting copy:

Enter your shopping list and location. We'll compare nearby stores and work out where your basket costs the least.

Primary CTA:

Start comparing

The user should not have to create an account before trying the core experience.

Location Flow

Support two primary methods:

1. Use my location

Use the browser Geolocation API.

Ask for permission only after the user takes an intentional action such as:

Use my location

Never request location permission automatically on page load.

After receiving coordinates:

reverse geocode them into a useful human-readable area

search for nearby grocery stores

allow the user to change the location

2. Enter a location

Provide a postcode/address/search field.

For the UK, postcode should be a first-class input.

Example:

BS1 4DJ

Show the resolved area before continuing.

Privacy

Location should be handled carefully.

Do not permanently store precise location unless the user explicitly chooses to save it.

Prefer approximate coordinates when exact precision is unnecessary.

Clearly explain why location is needed.

Allow users to change/remove the selected location.

Never expose precise user coordinates in URLs or public client-side state unnecessarily.

Shopping List Input

The shopping list should be extremely easy to use.

Support:

Free-form input

Example:

milk
2 loaves of bread
bananas
12 eggs
chicken breast 500g
pasta
tomato sauce

Also support natural language:

I need milk, 2 loaves of bread, 12 eggs, 500g chicken breast, pasta and tomato sauce.

The application should parse this into structured items.

Each item should ideally contain:

type ShoppingItem = {
  id: string
  name: string
  quantity: number
  unit?: string
  size?: string
  category?: string
}

Examples:

Milk → quantity 1, size unknown
12 eggs → quantity 1, size "12"
500g chicken breast → quantity 1, size "500g"
2 loaves of bread → quantity 2

Allow the user to edit parsed items before comparison.

Product Matching

This is one of the most important parts of the application.

The user's wording will not necessarily match retailer product names.

Example:

User:
milk

Possible products:

Tesco British Semi Skimmed Milk 2 Pints

Sainsbury's Semi Skimmed Milk 2 Pints

Aldi British Semi Skimmed Milk 2.272L

The matching system should consider:

semantic similarity

product category

quantity

weight/volume

unit

brand

dietary requirements

product availability

package size

Never compare obviously different products as if they are identical.

Product Matching Modes

Provide a user preference:

Cheapest

Find the cheapest suitable product.

Closest match

Prefer the product most closely matching the user's request.

Brand-specific

If the user explicitly requests a brand, respect it.

Own-brand allowed

Allow supermarket own-brand alternatives unless the user specifically requests a brand.

Unit Normalization

Where possible, calculate comparable unit prices.

Examples:

£/kg

£/litre

£/100g

£/item

For example:

500g chicken for £4.00
= £8.00/kg

This helps users understand whether a larger pack is genuinely better value.

Be careful with:

multipacks

variable-weight meat

promotions

meal deals

deposit charges

loyalty pricing

clubcard/member prices

Retailer Data Layer

Create an abstraction so retailer integrations are independent.

Example:

interface Retailer {
  id: string
  name: string
  logo?: string
}

interface ProductOffer {
  retailerId: string
  productId: string
  productName: string
  price: number
  currency: string
  size?: string
  unitPrice?: number
  unit?: string
  availability?: 'available' | 'unavailable' | 'unknown'
  url?: string
  confidence: number
}

interface StoreLocation {
  retailerId: string
  name: string
  latitude: number
  longitude: number
  address: string
  distanceMeters?: number
}

Create retailer adapters rather than hard-coding retailer-specific logic throughout the application.

For example:

/data/retailers
  tesco.ts
  sainsburys.ts
  asda.ts
  morrisons.ts
  aldi.ts
  lidl.ts

Only use data sources that are permitted by their terms, APIs, licenses, or other applicable rules. Do not build scraping functionality that violates a retailer's terms or bypasses technical protections.

If live pricing is unavailable, the UI must clearly label prices as estimated, cached, or otherwise non-real-time.

Never fabricate prices.

Store Discovery

Once the user location is known:

Find grocery stores within a configurable radius.

Rank by relevance and distance.

Include supermarkets and grocery stores where useful.

Calculate approximate travel distance/time when supported.

Default search radius:

5 miles / 8 km

Allow expansion if insufficient results exist.

Store results should include:

store name

retailer

address

distance

estimated travel time

opening status where reliable

basket availability/confidence

Basket Optimization

This is the core algorithm.

For each shopping item:

Find suitable products.

Find available offers.

Determine which stores can satisfy the item.

Calculate basket totals.

Then compare:

Single-store basket

Example:

Store

Basket

Tesco

£47.80

Asda

£45.20

Sainsbury's

£49.10

Morrisons

£46.90

Recommendation:

Asda — £45.20

Multi-store basket

Example:

Aldi
£31.40
8 items

Tesco
£6.20
2 items

Total groceries
£37.60

Estimated extra travel
+ £2.00

Effective total
£39.60

Compare that with:

Tesco only
£41.20

Recommendation:

Aldi + Tesco saves approximately £1.60.

Multi-Store Optimization Rules

Do not automatically recommend visiting multiple stores.

Introduce configurable thresholds.

Example:

const MIN_MULTI_STORE_SAVING = 5
const MAX_RECOMMENDED_STORES = 2

If a second store saves only £0.80, recommend the single-store option.

The algorithm should consider:

total grocery price

number of stores

additional distance

estimated travel time

user-selected transport mode

optional travel cost

product availability confidence

Possible objective:

effectiveCost =
  basketCost
  + travelCost
  + inconveniencePenalty

The exact formula should be isolated in the optimization layer so it can be tuned later.

User Preferences

Allow users to configure:

Maximum distance

Examples:

1 mile

3 miles

5 miles

10 miles

Maximum number of stores

Examples:

1

2

3

Optimization priority

Options:

Cheapest
Best balance
Fewest stores
Closest

Brand preference

Any brand

Own-brand preferred

Specific brands

Substitutions

Allow substitutions

Ask before substitutions

Exact products only

Results Page

The results page should be the strongest part of the product.

Top section:

Your cheapest shop

Example:

£42.18

Tesco
2.4 miles away

Save £6.72 vs the next cheapest single-store option.

Show a clear CTA:

View basket

Results Comparison

Show cards for each meaningful option.

Example:

Best overall

Aldi + Tesco

£42.18

2 stores
£6.72 saved

[View basket]

Cheapest single store

Asda

£45.90

1 store
3.1 miles

[View basket]

Closest

Co-op

£49.40

0.7 miles

[View basket]

Do not overwhelm the user with every possible combination.

Basket Breakdown

For every recommendation show:

Milk
Tesco
£1.65

Eggs
Tesco
£2.10

Chicken Breast
Aldi
£5.49

Pasta
Aldi
£0.95

Show:

product

store

price

quantity

unit price where useful

substitutions if applicable

The user should understand exactly how the total was calculated.

Savings Explanation

Always explain the recommendation in plain English.

Example:

Shopping at Aldi and Tesco costs £42.18, which is £3.22 cheaper than doing the whole shop at Tesco. It requires visiting two stores.

Avoid unexplained optimization decisions.

Confidence & Data Freshness

Price comparison is only useful if users understand how reliable the information is.

Every result should have a confidence/freshness indicator where appropriate.

Examples:

Price checked recently

Price from cached data

Price may have changed

Availability unknown

Do not pretend to have real-time information if the underlying source does not provide it.

Empty / Error States

Handle these properly.

No location

Explain how to provide a location.

No stores nearby

Offer to expand the search radius.

Item not found

Say:

We couldn't find a suitable match for "X".

Allow the user to manually choose a product.

Price unavailable

Do not invent a price.

Show:

Price unavailable

and exclude the item from exact optimization or clearly mark the basket as incomplete.

Partial basket

Example:

We found prices for 9 of 10 items. The total below excludes the missing item.

This is much better than presenting a misleading total.

Loading Experience

Price comparison may involve several data sources.

Do not show a generic spinner for a long time.

Use progressive loading:

Finding nearby stores...
✓ Location found

Searching Tesco...
✓

Searching Sainsbury's...
✓

Searching Aldi...
...

Optimizing your basket...

The final optimization should happen after the necessary data is available.

Design Direction

The design should feel:

premium

fast

trustworthy

practical

clean

data-driven

consumer-friendly

Avoid:

generic AI gradients

excessive glassmorphism

unnecessary animations

cluttered dashboards

gimmicky illustrations

The user should feel:

"This saves me money."

The interface should make the savings visually obvious.

Responsive Design

Mobile-first.

A large percentage of users will use the product while shopping.

Mobile UX must support:

quick item entry

large touch targets

sticky basket summary

easy store switching

simple map/list interaction

Desktop should provide richer comparison views.

Accessibility

Follow strong accessibility practices:

semantic HTML

keyboard navigation

visible focus states

sufficient contrast

accessible labels

screen-reader-friendly controls

do not rely only on color to communicate savings/errors

respect reduced-motion preferences

Maps

Use maps only when they materially improve the decision.

A map can show:

user location

nearby stores

recommended stores

route/distance

But the primary experience should remain the basket comparison, not a map application.

Authentication

Do not require authentication for the first comparison.

Potential future features:

saved shopping lists

recurring weekly shops

price history

favorite stores

saved locations

household profiles

Build the architecture so these can be added later without making authentication a prerequisite for the MVP.

Monetization

Do not compromise the primary user experience with intrusive advertising.

Potential future models:

affiliate/referral revenue

retailer partnerships

premium price tracking

price alerts

grocery delivery integrations

sponsored placements, clearly labeled

Never allow sponsored results to masquerade as the cheapest option.

The optimization engine must remain trustworthy.

Data Model

A future database could contain:

users
locations
shopping_lists
shopping_list_items
retailers
stores
products
product_offers
price_history
basket_results

Price history can eventually enable:

"This item is 18% cheaper than its typical price."

But do not build price-history features before reliable historical data exists.

API Structure

Keep APIs clean and separated by responsibility.

Potential endpoints:

GET /api/stores
POST /api/shopping-list/parse
POST /api/products/search
POST /api/compare
POST /api/optimize
GET /api/prices

Prefer server-side handling for API keys and retailer credentials.

Never expose secret API keys to the browser.

Security

Important:

Validate all user input.

Sanitize free-form shopping list input.

Rate-limit expensive comparison operations.

Keep API keys server-side.

Do not expose precise location unnecessarily.

Avoid storing location unless needed.

Validate external product/price data before displaying it.

Treat external data as untrusted.

Performance

The comparison process may be expensive.

Use:

caching

parallel retailer queries

request deduplication

server-side processing

sensible search-radius limits

pagination where needed

Do not make the browser call every retailer individually.

Prefer:

Browser
   ↓
Comparison API
   ↓
Retailer adapters
   ↓
Normalized product offers
   ↓
Optimization engine
   ↓
Results

Architecture

Recommended high-level structure:

app/
  page.tsx
  compare/
    page.tsx
  results/
    page.tsx

components/
  location/
  shopping-list/
  stores/
  basket/
  comparison/
  maps/
  ui/

lib/
  location/
  products/
  retailers/
  pricing/
  optimization/
  units/
  validation/

data/
  retailers/

types/
  shopping.ts
  products.ts
  retailers.ts
  optimization.ts

Keep business logic out of React components.

Optimization Engine

The optimization engine should be independently testable.

Example input:

{
  items: [...],
  stores: [...],
  offers: [...],
  preferences: {
    maxStores: 2,
    maxDistanceMiles: 5,
    priority: 'best-value'
  }
}

Example output:

{
  recommendation: {
    stores: [...],
    items: [...],
    groceryTotal: 42.18,
    estimatedTravelCost: 0,
    effectiveTotal: 42.18,
    savingsVsSingleStore: 3.22
  },
  alternatives: [...]
}

Important Edge Cases

Handle:

duplicate shopping items

quantities greater than one

pack sizes

different units

products unavailable at one store

products available only at distant stores

loyalty-card prices

promotions

multi-buy offers

weighted products

substitutions

stores temporarily closed

duplicate store listings

incomplete pricing data

missing product sizes

ambiguous product names

multiple stores from the same retailer

user changing location after results load

Trust Principles

This product lives or dies on trust.

Never:

fabricate a price

claim a store has stock without evidence

claim a price is live when it is cached

hide missing products from the total

manipulate the cheapest result because of sponsorship

silently substitute materially different products

Always make the calculation understandable.

If data is incomplete, say so.

MVP Scope

Prioritize the following:

P0 — Must have

location permission

postcode/location search

shopping list input

shopping list parsing

nearby grocery store discovery

product matching

price comparison

single-store basket calculation

cheapest basket recommendation

transparent basket breakdown

mobile-responsive UI

loading/error states

P1 — Important

multi-store optimization

distance/travel consideration

substitutions

unit price comparison

retailer filtering

max distance preference

maximum store count

P2 — Later

accounts

saved lists

recurring shops

price history

alerts

delivery integrations

affiliate integrations

personalized recommendations

Do not let P2 features slow down the MVP.

Development Rules for Claude

Before coding

Inspect the existing repository.

Understand the current architecture.

Do not replace working infrastructure unnecessarily.

Identify available environment variables and APIs.

Check whether the project already has design-system components.

Reuse existing components where appropriate.

While coding

TypeScript should be strongly typed.

Avoid any unless genuinely unavoidable.

Keep components focused.

Keep data fetching separate from presentation.

Keep optimization logic pure and testable.

Add useful error handling.

Do not hard-code fake production prices.

Do not create fake API responses and present them as real data.

Use clearly marked mock data only when building UI before the real integration exists.

UI

Build polished production-quality UI.

Do not stop at a wireframe.

Prioritize:

hierarchy

spacing

typography

responsive behavior

empty states

loading states

error states

accessibility

micro-interactions that improve clarity

Avoid adding animations just for decoration.

Testing

Test the most important business logic.

At minimum test:

Cheapest single-store basket.

Cheapest two-store basket.

Multi-store option that is only marginally cheaper.

Missing product.

Unavailable product.

Quantity handling.

Unit conversion.

Duplicate items.

Store distance filtering.

User preference changes.

Example:

Given:
Milk = £2 at Store A
Milk = £1.50 at Store B
Eggs = £3 at Store A
Eggs = £4 at Store B

The optimizer should choose:
Store A total = £5
Store B total = £5.50
Therefore Store A wins for single-store shopping.

Product Philosophy

The application should answer three questions immediately:

1. What should I buy?

The user's requested list.

2. Where should I buy it?

The best nearby store or combination of stores.

3. How much will I save?

A clear comparison against alternatives.

The interface should never make the user perform the analysis themselves.

Definition of Done

A feature is not finished simply because the code compiles.

It is finished when:

the happy path works

errors are handled

loading states exist

mobile layout works

accessibility has been considered

business logic is tested where appropriate

no fake production data is presented as real

the UI clearly communicates what is happening

the result is understandable to a normal consumer

The ultimate test:

A user enters their postcode and a grocery list and can understand the cheapest practical way to buy those groceries within a few seconds of the results loading.