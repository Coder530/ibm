/**
 * Deterministically generates the committed DEMO retailer catalog at
 * data/retailers/demo-catalog.json. All prices here are illustrative only —
 * generated from a base price per product key, a per-retailer multiplier,
 * and a seeded-PRNG jitter — never real retailer prices (see CLAUDE.md
 * "Retailer Data Layer" / "Security & Trust": never fabricate a price
 * presented as real; this data is clearly labelled DEMO throughout).
 *
 * Run with: npx tsx scripts/generate-demo-catalog.ts
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { RETAILER_IDS, RETAILERS, type RetailerId } from "@/types/retailers";
import { CANONICAL_PRODUCTS } from "@/lib/products/synonyms";

// Fixed seed — do not change without regenerating and re-committing the JSON.
const SEED = 20260115;

/** Small deterministic PRNG (mulberry32); good enough for illustrative data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Category =
  | "dairy"
  | "bakery"
  | "produce"
  | "meat"
  | "fish"
  | "pantry"
  | "drinks"
  | "household"
  | "frozen"
  | "snacks";

interface ProductSpec {
  key: string;
  category: Category;
  name: string;
  size: string;
  baseMinor: number;
  qualifiers: string[];
  /** Candidate non-own-brand names. Empty => always generated as own-brand. */
  brands: string[];
}

// Required keys — must match Builder B's CANONICAL_PRODUCTS keys exactly
// (frozen list from the spec).
const PRODUCTS: ProductSpec[] = [
  // Dairy
  { key: "milk-semi", category: "dairy", name: "Semi-Skimmed Milk", size: "4 pints", baseMinor: 145, qualifiers: ["semi-skimmed"], brands: ["Cravendale", "Arla"] },
  { key: "milk-whole", category: "dairy", name: "Whole Milk", size: "4 pints", baseMinor: 150, qualifiers: ["whole"], brands: ["Cravendale", "Arla"] },
  { key: "milk-skimmed", category: "dairy", name: "Skimmed Milk", size: "4 pints", baseMinor: 140, qualifiers: ["skimmed"], brands: ["Cravendale", "Arla"] },
  { key: "milk-oat", category: "dairy", name: "Oat Drink", size: "1l", baseMinor: 165, qualifiers: ["oat", "dairy-free", "plant-based"], brands: ["Oatly", "Alpro"] },
  { key: "milk-soya", category: "dairy", name: "Soya Drink", size: "1l", baseMinor: 120, qualifiers: ["soya", "dairy-free", "plant-based"], brands: ["Alpro", "Provamel"] },
  { key: "butter", category: "dairy", name: "Salted Butter", size: "250g", baseMinor: 230, qualifiers: ["salted"], brands: ["Lurpak", "Anchor"] },
  { key: "spread", category: "dairy", name: "Vegetable Spread", size: "500g", baseMinor: 145, qualifiers: ["dairy-free"], brands: ["Flora", "Vitalite"] },
  { key: "cheddar", category: "dairy", name: "Mature Cheddar", size: "400g", baseMinor: 320, qualifiers: ["mature"], brands: ["Cathedral City", "Pilgrims Choice"] },
  { key: "mozzarella", category: "dairy", name: "Mozzarella", size: "125g", baseMinor: 95, qualifiers: [], brands: ["Galbani"] },
  { key: "yoghurt-greek", category: "dairy", name: "Greek Yoghurt", size: "500g", baseMinor: 180, qualifiers: ["greek"], brands: ["Fage", "Total"] },
  { key: "yoghurt-natural", category: "dairy", name: "Natural Yoghurt", size: "500g", baseMinor: 105, qualifiers: ["natural"], brands: ["Yeo Valley"] },
  { key: "eggs", category: "dairy", name: "Free Range Eggs", size: "6 pack", baseMinor: 210, qualifiers: ["free-range"], brands: ["Happy Egg Co"] },
  { key: "cream-double", category: "dairy", name: "Double Cream", size: "300ml", baseMinor: 175, qualifiers: ["double"], brands: ["Elmlea"] },

  // Bakery
  { key: "bread-white", category: "bakery", name: "White Bread Loaf", size: "800g", baseMinor: 115, qualifiers: ["white"], brands: ["Warburtons", "Hovis"] },
  { key: "bread-wholemeal", category: "bakery", name: "Wholemeal Bread Loaf", size: "800g", baseMinor: 125, qualifiers: ["wholemeal"], brands: ["Warburtons", "Hovis"] },
  { key: "bagels", category: "bakery", name: "Plain Bagels", size: "5 pack", baseMinor: 130, qualifiers: [], brands: ["New York Bakery Co"] },
  { key: "wraps", category: "bakery", name: "Tortilla Wraps", size: "8 pack", baseMinor: 140, qualifiers: [], brands: ["Mission", "Old El Paso"] },
  { key: "croissants", category: "bakery", name: "Butter Croissants", size: "4 pack", baseMinor: 155, qualifiers: ["butter"], brands: ["Jus-Rol"] },

  // Produce
  { key: "bananas", category: "produce", name: "Bananas", size: "1kg", baseMinor: 78, qualifiers: [], brands: ["Chiquita", "Fairtrade"] },
  { key: "apples", category: "produce", name: "Apples", size: "1kg", baseMinor: 195, qualifiers: [], brands: ["Pink Lady", "Gala"] },
  { key: "oranges", category: "produce", name: "Oranges", size: "1kg", baseMinor: 180, qualifiers: [], brands: ["Jaffa"] },
  { key: "grapes", category: "produce", name: "Seedless Grapes", size: "500g", baseMinor: 210, qualifiers: [], brands: [] },
  { key: "strawberries", category: "produce", name: "Strawberries", size: "400g", baseMinor: 250, qualifiers: [], brands: ["Driscoll's"] },
  { key: "lemons", category: "produce", name: "Lemons", size: "5 pack", baseMinor: 130, qualifiers: [], brands: [] },
  { key: "avocados", category: "produce", name: "Avocados", size: "4 pack", baseMinor: 240, qualifiers: [], brands: [] },
  { key: "tomatoes", category: "produce", name: "Tomatoes", size: "6 pack", baseMinor: 145, qualifiers: [], brands: ["Vine"] },
  { key: "cucumber", category: "produce", name: "Cucumber", size: "1 pack", baseMinor: 65, qualifiers: [], brands: [] },
  { key: "lettuce", category: "produce", name: "Iceberg Lettuce", size: "1 pack", baseMinor: 90, qualifiers: [], brands: [] },
  { key: "onions", category: "produce", name: "Onions", size: "1kg", baseMinor: 95, qualifiers: [], brands: [] },
  { key: "garlic", category: "produce", name: "Garlic", size: "3 pack", baseMinor: 75, qualifiers: [], brands: [] },
  { key: "potatoes", category: "produce", name: "Potatoes", size: "2.5kg", baseMinor: 210, qualifiers: [], brands: [] },
  { key: "carrots", category: "produce", name: "Carrots", size: "1kg", baseMinor: 68, qualifiers: [], brands: [] },
  { key: "broccoli", category: "produce", name: "Broccoli", size: "1 pack", baseMinor: 105, qualifiers: [], brands: [] },
  { key: "peppers", category: "produce", name: "Mixed Peppers", size: "3 pack", baseMinor: 155, qualifiers: [], brands: [] },
  { key: "mushrooms", category: "produce", name: "Mushrooms", size: "300g", baseMinor: 115, qualifiers: [], brands: [] },
  { key: "spinach", category: "produce", name: "Baby Spinach", size: "240g", baseMinor: 135, qualifiers: [], brands: [] },

  // Meat / fish
  { key: "chicken-breast", category: "meat", name: "Chicken Breast Fillets", size: "650g", baseMinor: 450, qualifiers: [], brands: ["Red Tractor"] },
  { key: "beef-mince", category: "meat", name: "Beef Mince 5% Fat", size: "500g", baseMinor: 400, qualifiers: ["5% fat"], brands: ["Red Tractor"] },
  { key: "pork-sausages", category: "meat", name: "Pork Sausages", size: "400g", baseMinor: 250, qualifiers: [], brands: ["Richmond"] },
  { key: "bacon", category: "meat", name: "Smoked Bacon Rashers", size: "300g", baseMinor: 280, qualifiers: ["smoked"], brands: ["Richmond", "Danish Crown"] },
  { key: "ham", category: "meat", name: "Cooked Ham", size: "150g", baseMinor: 175, qualifiers: ["cooked"], brands: ["Denny"] },
  { key: "salmon-fillets", category: "fish", name: "Salmon Fillets", size: "2 pack", baseMinor: 450, qualifiers: [], brands: ["Youngs"] },
  { key: "tuna-tin", category: "fish", name: "Tuna Chunks in Brine", size: "4 pack", baseMinor: 320, qualifiers: ["in brine"], brands: ["John West", "Princes"] },

  // Pantry
  { key: "pasta-dried", category: "pantry", name: "Penne Pasta", size: "500g", baseMinor: 85, qualifiers: ["penne"], brands: ["Napolina"] },
  { key: "spaghetti", category: "pantry", name: "Spaghetti", size: "500g", baseMinor: 85, qualifiers: [], brands: ["Napolina"] },
  { key: "rice-basmati", category: "pantry", name: "Basmati Rice", size: "1kg", baseMinor: 195, qualifiers: ["basmati"], brands: ["Tilda", "Uncle Ben's"] },
  { key: "oats", category: "pantry", name: "Porridge Oats", size: "1kg", baseMinor: 145, qualifiers: ["porridge"], brands: ["Quaker", "Scott's"] },
  { key: "cornflakes", category: "pantry", name: "Cornflakes", size: "500g", baseMinor: 165, qualifiers: [], brands: ["Kellogg's"] },
  { key: "baked-beans", category: "pantry", name: "Baked Beans", size: "4 pack", baseMinor: 200, qualifiers: [], brands: ["Heinz", "Branston"] },
  { key: "chopped-tomatoes", category: "pantry", name: "Chopped Tomatoes", size: "4 pack", baseMinor: 160, qualifiers: [], brands: ["Napolina"] },
  { key: "pasta-sauce", category: "pantry", name: "Tomato Pasta Sauce", size: "500g", baseMinor: 130, qualifiers: ["tomato"], brands: ["Dolmio", "Napolina"] },
  { key: "flour-plain", category: "pantry", name: "Plain Flour", size: "1.5kg", baseMinor: 95, qualifiers: ["plain"], brands: ["Allinson's"] },
  { key: "sugar", category: "pantry", name: "Granulated Sugar", size: "1kg", baseMinor: 105, qualifiers: ["granulated"], brands: ["Tate & Lyle"] },
  { key: "olive-oil", category: "pantry", name: "Extra Virgin Olive Oil", size: "500ml", baseMinor: 350, qualifiers: ["extra virgin"], brands: ["Filippo Berio"] },
  { key: "vegetable-oil", category: "pantry", name: "Vegetable Oil", size: "1l", baseMinor: 145, qualifiers: [], brands: ["Crisp 'n Dry"] },

  // Drinks
  { key: "coffee-instant", category: "drinks", name: "Instant Coffee", size: "200g", baseMinor: 425, qualifiers: [], brands: ["Nescafé", "Kenco"] },
  { key: "tea-bags", category: "drinks", name: "Tea Bags", size: "80 pack", baseMinor: 235, qualifiers: ["everyday"], brands: ["Yorkshire Tea", "PG Tips"] },
  { key: "orange-juice", category: "drinks", name: "Orange Juice", size: "1l", baseMinor: 165, qualifiers: ["not from concentrate"], brands: ["Tropicana", "Copella"] },
  { key: "water-still", category: "drinks", name: "Still Water", size: "6 pack", baseMinor: 210, qualifiers: [], brands: ["Highland Spring", "Evian"] },
  { key: "cola", category: "drinks", name: "Cola", size: "2l", baseMinor: 175, qualifiers: [], brands: ["Coca-Cola", "Pepsi"] },

  // Household
  { key: "toilet-roll", category: "household", name: "Toilet Roll", size: "9 pack", baseMinor: 495, qualifiers: [], brands: ["Andrex", "Cushelle"] },
  { key: "washing-up-liquid", category: "household", name: "Washing Up Liquid", size: "780ml", baseMinor: 145, qualifiers: [], brands: ["Fairy"] },

  // Frozen
  { key: "frozen-peas", category: "frozen", name: "Frozen Peas", size: "900g", baseMinor: 145, qualifiers: [], brands: ["Birds Eye"] },
  { key: "chips-frozen", category: "frozen", name: "Oven Chips", size: "1kg", baseMinor: 165, qualifiers: ["oven"], brands: ["McCain"] },
  { key: "pizza-frozen", category: "frozen", name: "Margherita Pizza", size: "1 pack", baseMinor: 275, qualifiers: ["margherita"], brands: ["Chicago Town", "Goodfella's"] },
  { key: "ice-cream", category: "frozen", name: "Vanilla Ice Cream", size: "900ml", baseMinor: 250, qualifiers: ["vanilla"], brands: ["Wall's", "Carte D'Or"] },

  // Snacks
  { key: "crisps", category: "snacks", name: "Crisps", size: "6 pack", baseMinor: 185, qualifiers: [], brands: ["Walkers"] },
  { key: "chocolate", category: "snacks", name: "Chocolate Bar", size: "200g", baseMinor: 220, qualifiers: [], brands: ["Cadbury", "Galaxy"] },
  { key: "biscuits", category: "snacks", name: "Biscuits", size: "300g", baseMinor: 145, qualifiers: [], brands: ["McVitie's"] },
];

// Base multiplier per retailer, tuned so the overall ladder is roughly:
// Aldi≈Lidl < Asda < Tesco≈Sainsbury's≈Morrisons < Co-op < Waitrose≈M&S,
// with Iceland competitive (mid) and Ocado broadest-but-premium.
const RETAILER_MULTIPLIER: Record<RetailerId, number> = {
  aldi: 0.82,
  lidl: 0.83,
  asda: 0.9,
  tesco: 1.0,
  sainsburys: 1.01,
  morrisons: 0.99,
  coop: 1.08,
  waitrose: 1.18,
  mands: 1.2,
  iceland: 0.95,
  ocado: 1.1,
};

// Base probability that a retailer simply doesn't stock a given key.
const BASE_NULL_PROB: Record<RetailerId, number> = {
  aldi: 0.16,
  lidl: 0.16,
  asda: 0.05,
  tesco: 0.03,
  sainsburys: 0.03,
  morrisons: 0.04,
  coop: 0.1,
  waitrose: 0.06,
  mands: 0.1,
  iceland: 0.35,
  ocado: 0.01,
};

const ICELAND_CORE_CATEGORIES: Category[] = ["frozen", "pantry", "household", "dairy", "drinks"];
const ALDI_LIDL_NARROW_CATEGORIES: Category[] = ["fish"];

/** Probability [0,1) that `retailer` does not stock a product in `category`. */
function nullProbability(retailer: RetailerId, category: Category): number {
  if (retailer === "iceland") {
    // Iceland: mostly frozen + basics, much narrower on fresh/specialty.
    return ICELAND_CORE_CATEGORIES.includes(category) ? 0.08 : 0.55;
  }
  if (retailer === "aldi" || retailer === "lidl") {
    if (ALDI_LIDL_NARROW_CATEGORIES.includes(category)) return 0.3;
  }
  return BASE_NULL_PROB[retailer];
}

/** Price multiplier for `retailer` in `category`, layering category-specific discounts. */
function priceMultiplier(retailer: RetailerId, category: Category): number {
  let m = RETAILER_MULTIPLIER[retailer];
  if (category === "frozen" && retailer === "iceland") m *= 0.72; // Iceland: cheap frozen.
  if (category === "frozen" && (retailer === "aldi" || retailer === "lidl")) m *= 0.93;
  if (category === "produce" && (retailer === "aldi" || retailer === "lidl")) m *= 0.88; // cheap fresh.
  return m;
}

function ownBrandProbability(category: Category): number {
  switch (category) {
    case "dairy":
      return 0.7;
    case "bakery":
      return 0.55;
    case "produce":
      return 0.6;
    case "meat":
      return 0.45;
    case "fish":
      return 0.4;
    case "pantry":
      return 0.6;
    case "drinks":
      return 0.35;
    case "household":
      return 0.55;
    case "frozen":
      return 0.4;
    case "snacks":
      return 0.2;
  }
}

interface RawCatalogEntry {
  productName: string;
  brand: string | null;
  isOwnBrand: boolean;
  size: string;
  priceMinor: number;
  available: boolean;
  qualifiers: string[];
}

export interface DemoCatalog {
  _notice: string;
  generatedFor: string;
  products: Record<string, Partial<Record<RetailerId, RawCatalogEntry | null>>>;
}

const AVAILABLE_FALSE_PROB = 0.03;

// Catalog qualifiers must match the matcher's canonical qualifiers for the
// same key — descriptive words (e.g. "salted", "basmati") stay in `name`
// only, never in `qualifiers` (see SPEC F1).
const CANONICAL_QUALIFIERS_BY_KEY: ReadonlyMap<string, string[]> = new Map(
  CANONICAL_PRODUCTS.map((p) => [p.key, p.qualifiers ?? []])
);

/**
 * Pure, deterministic catalog generation: same seed + same iteration order
 * (fixed PRODUCTS/RETAILER_IDS arrays) always produces the identical object.
 */
export function generateCatalog(): DemoCatalog {
  const rand = mulberry32(SEED);
  const products: DemoCatalog["products"] = {};

  for (const spec of PRODUCTS) {
    const perRetailer: Partial<Record<RetailerId, RawCatalogEntry | null>> = {};

    for (const retailerId of RETAILER_IDS) {
      if (rand() < nullProbability(retailerId, spec.category)) {
        perRetailer[retailerId] = null;
        continue;
      }

      const jitter = 0.92 + rand() * 0.16; // +/- 8% per-cell jitter
      const priceMinor = Math.max(1, Math.round(spec.baseMinor * priceMultiplier(retailerId, spec.category) * jitter));
      const available = rand() >= AVAILABLE_FALSE_PROB;
      const isOwnBrand = spec.brands.length === 0 ? true : rand() < ownBrandProbability(spec.category);

      let brand: string | null;
      let productName: string;
      if (isOwnBrand) {
        brand = null;
        productName = `${RETAILERS[retailerId].name} ${spec.name}`;
      } else {
        const pick = spec.brands[Math.floor(rand() * spec.brands.length)] ?? spec.name;
        brand = pick;
        productName = `${pick} ${spec.name}`;
      }

      perRetailer[retailerId] = {
        productName,
        brand,
        isOwnBrand,
        size: spec.size,
        priceMinor,
        available,
        qualifiers: CANONICAL_QUALIFIERS_BY_KEY.get(spec.key) ?? [],
      };
    }

    products[spec.key] = perRetailer;
  }

  return {
    _notice: "DEMO DATA — illustrative prices for UI development only. Not real retailer prices.",
    generatedFor: "pre-integration",
    products,
  };
}

function main(): void {
  const outPath = resolve(process.cwd(), "data/retailers/demo-catalog.json");
  const catalog = generateCatalog();
  writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `Wrote demo catalog (${Object.keys(catalog.products).length} products x ${RETAILER_IDS.length} retailers) to ${outPath}`
  );
}

const invokedDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main();
}
