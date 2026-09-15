import { RETAILERS, RETAILER_IDS } from "@/types/retailers";

export interface CanonicalProduct {
  key: string;
  names: string[];
  category: string;
  /** Material qualifiers intrinsic to this product (e.g. 'oat' for milk-oat). */
  qualifiers?: string[];
}

/**
 * Canonical products for a UK weekly shop. Names are matched as contiguous
 * token sequences (after plural stemming); the longest matching name wins.
 * Builder C's demo catalog uses these keys as `productKey` — do not rename.
 */
export const CANONICAL_PRODUCTS: readonly CanonicalProduct[] = [
  // Dairy
  { key: "milk-semi", names: ["milk", "semi skimmed milk", "semi skimmed", "semi skim milk", "semi"], category: "dairy", qualifiers: ["semi-skimmed"] },
  { key: "milk-whole", names: ["whole milk", "full fat milk"], category: "dairy", qualifiers: ["whole"] },
  { key: "milk-skimmed", names: ["skimmed milk", "skim milk", "skimmed"], category: "dairy", qualifiers: ["skimmed"] },
  { key: "milk-oat", names: ["oat milk", "oat drink", "oatly"], category: "dairy", qualifiers: ["oat"] },
  { key: "milk-soya", names: ["soya milk", "soy milk", "soya drink", "soy drink", "alpro"], category: "dairy", qualifiers: ["soya"] },
  { key: "butter", names: ["butter", "salted butter", "block butter"], category: "dairy" },
  { key: "spread", names: ["spread", "margarine", "marg", "butter spread", "spreadable butter", "flora", "lurpak spreadable"], category: "dairy" },
  { key: "cheddar", names: ["cheddar", "cheddar cheese", "cheese", "mature cheddar"], category: "dairy" },
  { key: "mozzarella", names: ["mozzarella", "mozzarella cheese"], category: "dairy" },
  { key: "cream-cheese", names: ["cream cheese", "soft cheese", "philadelphia"], category: "dairy" },
  { key: "parmesan", names: ["parmesan", "parmigiano reggiano", "grana padano"], category: "dairy" },
  { key: "feta", names: ["feta", "feta cheese"], category: "dairy" },
  { key: "halloumi", names: ["halloumi"], category: "dairy" },
  { key: "yoghurt-greek", names: ["greek yoghurt", "greek style yoghurt", "greek yogurt", "greek style yogurt"], category: "dairy" },
  { key: "yoghurt-natural", names: ["natural yoghurt", "plain yoghurt", "yoghurt", "natural yogurt", "plain yogurt", "yogurt"], category: "dairy" },
  { key: "eggs", names: ["eggs"], category: "dairy" },
  { key: "cream-double", names: ["double cream", "cream"], category: "dairy" },
  { key: "cream-single", names: ["single cream"], category: "dairy" },
  { key: "creme-fraiche", names: ["creme fraiche"], category: "dairy" },
  { key: "sour-cream", names: ["sour cream", "soured cream"], category: "dairy" },

  // Bakery
  { key: "bread-white", names: ["bread", "white bread", "white loaf", "loaf", "sliced white bread"], category: "bakery" },
  { key: "bread-wholemeal", names: ["wholemeal bread", "wholemeal loaf", "brown bread", "wholemeal"], category: "bakery" },
  { key: "bread-rolls", names: ["bread rolls", "rolls", "baps", "white rolls"], category: "bakery" },
  { key: "bagels", names: ["bagels"], category: "bakery" },
  { key: "wraps", names: ["wraps", "tortilla wraps", "tortillas"], category: "bakery" },
  { key: "pitta", names: ["pitta", "pitta bread"], category: "bakery" },
  { key: "crumpets", names: ["crumpets"], category: "bakery" },
  { key: "croissants", names: ["croissants"], category: "bakery" },

  // Fruit
  { key: "bananas", names: ["bananas"], category: "fruit" },
  { key: "apples", names: ["apples", "eating apples", "gala apples", "braeburn apples"], category: "fruit" },
  { key: "oranges", names: ["oranges"], category: "fruit" },
  { key: "satsumas", names: ["satsumas", "easy peelers", "clementines", "mandarins"], category: "fruit" },
  { key: "grapes", names: ["grapes", "red grapes", "green grapes", "seedless grapes", "white grapes"], category: "fruit" },
  { key: "strawberries", names: ["strawberries"], category: "fruit" },
  { key: "blueberries", names: ["blueberries"], category: "fruit" },
  { key: "raspberries", names: ["raspberries"], category: "fruit" },
  { key: "lemons", names: ["lemons"], category: "fruit" },
  { key: "limes", names: ["limes"], category: "fruit" },
  { key: "avocados", names: ["avocados"], category: "fruit" },
  { key: "pears", names: ["pears"], category: "fruit" },
  { key: "pineapple", names: ["pineapple"], category: "fruit" },
  { key: "melon", names: ["melon"], category: "fruit" },

  // Vegetables
  { key: "tomatoes", names: ["tomatoes", "salad tomatoes", "vine tomatoes", "tomatoes on the vine"], category: "vegetables" },
  { key: "tomatoes-cherry", names: ["cherry tomatoes"], category: "vegetables" },
  { key: "cucumber", names: ["cucumber"], category: "vegetables" },
  { key: "lettuce", names: ["lettuce", "iceberg lettuce", "romaine lettuce", "little gem lettuce", "little gem"], category: "vegetables" },
  { key: "onions", names: ["onions", "brown onions", "white onions"], category: "vegetables" },
  { key: "onions-red", names: ["red onions"], category: "vegetables" },
  { key: "spring-onions", names: ["spring onions", "salad onions"], category: "vegetables" },
  { key: "garlic", names: ["garlic", "garlic bulb"], category: "vegetables" },
  { key: "ginger", names: ["ginger", "root ginger"], category: "vegetables" },
  { key: "potatoes", names: ["potatoes", "spuds", "white potatoes", "maris piper potatoes", "baking potatoes"], category: "vegetables" },
  { key: "sweet-potatoes", names: ["sweet potatoes"], category: "vegetables" },
  { key: "carrots", names: ["carrots"], category: "vegetables" },
  { key: "parsnips", names: ["parsnips"], category: "vegetables" },
  { key: "broccoli", names: ["broccoli"], category: "vegetables" },
  { key: "cauliflower", names: ["cauliflower"], category: "vegetables" },
  { key: "cabbage", names: ["cabbage"], category: "vegetables" },
  { key: "courgettes", names: ["courgettes", "zucchini"], category: "vegetables" },
  { key: "leeks", names: ["leeks"], category: "vegetables" },
  { key: "celery", names: ["celery"], category: "vegetables" },
  { key: "green-beans", names: ["green beans", "fine beans"], category: "vegetables" },
  { key: "peppers", names: ["peppers", "bell peppers", "mixed peppers", "red peppers", "green peppers", "yellow peppers"], category: "vegetables" },
  { key: "mushrooms", names: ["mushrooms", "closed cup mushrooms", "button mushrooms", "chestnut mushrooms"], category: "vegetables" },
  { key: "spinach", names: ["spinach", "baby spinach"], category: "vegetables" },

  // Meat & fish
  { key: "chicken-breast", names: ["chicken breast", "chicken fillets", "chicken breast fillets", "chicken"], category: "meat" },
  { key: "chicken-thighs", names: ["chicken thighs"], category: "meat" },
  { key: "chicken-whole", names: ["whole chicken"], category: "meat", qualifiers: ["whole"] },
  { key: "beef-mince", names: ["beef mince", "mince", "minced beef"], category: "meat" },
  { key: "turkey-mince", names: ["turkey mince", "minced turkey"], category: "meat" },
  { key: "pork-sausages", names: ["sausages", "pork sausages", "bangers"], category: "meat" },
  { key: "bacon", names: ["bacon", "back bacon", "bacon rashers", "smoked bacon", "unsmoked bacon", "smoked back bacon", "unsmoked back bacon"], category: "meat" },
  { key: "ham", names: ["ham", "sliced ham", "cooked ham", "ham slices", "honey roast ham"], category: "meat" },
  { key: "salmon-fillets", names: ["salmon", "salmon fillets"], category: "fish" },
  { key: "salmon-smoked", names: ["smoked salmon"], category: "fish" },
  { key: "cod-fillets", names: ["cod", "cod fillets"], category: "fish" },
  { key: "prawns", names: ["prawns", "king prawns", "cooked prawns"], category: "fish" },
  { key: "tuna-tin", names: ["tuna", "tinned tuna", "canned tuna", "tuna chunks"], category: "fish" },

  // Pantry
  { key: "pasta-dried", names: ["pasta", "dried pasta", "penne", "fusilli", "pasta shells", "penne pasta", "fusilli pasta"], category: "pantry" },
  { key: "spaghetti", names: ["spaghetti"], category: "pantry" },
  { key: "noodles", names: ["noodles", "egg noodles"], category: "pantry" },
  { key: "rice-basmati", names: ["rice", "basmati rice", "basmati"], category: "pantry" },
  { key: "oats", names: ["oats", "porridge oats", "rolled oats", "porridge"], category: "breakfast" },
  { key: "cornflakes", names: ["cornflakes", "corn flakes"], category: "breakfast" },
  { key: "baked-beans", names: ["baked beans", "beans"], category: "pantry" },
  { key: "chopped-tomatoes", names: ["chopped tomatoes", "tinned tomatoes", "canned tomatoes", "tinned chopped tomatoes"], category: "pantry" },
  { key: "chickpeas", names: ["chickpeas"], category: "pantry" },
  { key: "lentils", names: ["lentils", "red lentils"], category: "pantry" },
  { key: "sweetcorn", names: ["sweetcorn"], category: "pantry" },
  { key: "pasta-sauce", names: ["pasta sauce", "bolognese sauce", "tomato pasta sauce"], category: "pantry" },
  { key: "ketchup", names: ["ketchup", "tomato ketchup"], category: "pantry" },
  { key: "mayonnaise", names: ["mayonnaise", "mayo"], category: "pantry" },
  { key: "peanut-butter", names: ["peanut butter"], category: "pantry" },
  { key: "jam", names: ["jam", "strawberry jam"], category: "pantry" },
  { key: "honey", names: ["honey"], category: "pantry" },
  { key: "stock-cubes", names: ["stock cubes", "oxo cubes", "chicken stock cubes", "vegetable stock cubes"], category: "pantry" },
  { key: "flour-plain", names: ["flour", "plain flour"], category: "pantry" },
  { key: "flour-self-raising", names: ["self raising flour"], category: "pantry" },
  { key: "sugar", names: ["sugar", "granulated sugar", "white sugar"], category: "pantry" },
  { key: "salt", names: ["salt", "table salt"], category: "pantry" },
  { key: "black-pepper", names: ["black pepper", "ground black pepper", "peppercorns"], category: "pantry" },
  { key: "olive-oil", names: ["olive oil", "extra virgin olive oil"], category: "pantry" },
  { key: "vegetable-oil", names: ["vegetable oil", "sunflower oil", "rapeseed oil", "cooking oil"], category: "pantry" },

  // Drinks
  { key: "coffee-instant", names: ["coffee", "instant coffee", "nescafe"], category: "drinks" },
  { key: "coffee-ground", names: ["ground coffee", "coffee beans", "filter coffee"], category: "drinks" },
  { key: "tea-bags", names: ["tea", "tea bags", "teabags", "pg tips", "yorkshire tea"], category: "drinks" },
  { key: "orange-juice", names: ["orange juice", "oj"], category: "drinks" },
  { key: "apple-juice", names: ["apple juice"], category: "drinks" },
  { key: "squash", names: ["squash", "orange squash", "cordial"], category: "drinks" },
  { key: "water-still", names: ["water", "still water", "bottled water", "mineral water", "spring water"], category: "drinks" },
  { key: "water-sparkling", names: ["sparkling water", "fizzy water"], category: "drinks", qualifiers: ["sparkling"] },
  { key: "cola", names: ["cola", "coke", "coca cola", "pepsi"], category: "drinks" },
  { key: "lemonade", names: ["lemonade"], category: "drinks" },

  // Household
  { key: "toilet-roll", names: ["toilet roll", "loo roll", "toilet paper", "bog roll", "toilet tissue"], category: "household" },
  { key: "kitchen-roll", names: ["kitchen roll", "kitchen towel", "paper towels"], category: "household" },
  { key: "washing-up-liquid", names: ["washing up liquid", "fairy liquid", "dish soap"], category: "household" },
  { key: "laundry-detergent", names: ["laundry detergent", "washing powder", "laundry liquid", "washing capsules"], category: "household" },
  { key: "bin-bags", names: ["bin bags", "bin liners"], category: "household" },

  // Frozen
  { key: "frozen-peas", names: ["frozen peas", "peas", "garden peas"], category: "frozen", qualifiers: ["frozen"] },
  { key: "chips-frozen", names: ["chips", "oven chips", "frozen chips", "french fries"], category: "frozen", qualifiers: ["frozen"] },
  { key: "pizza-frozen", names: ["pizza", "frozen pizza", "margherita pizza"], category: "frozen", qualifiers: ["frozen"] },
  { key: "fish-fingers", names: ["fish fingers"], category: "frozen", qualifiers: ["frozen"] },
  { key: "ice-cream", names: ["ice cream", "vanilla ice cream"], category: "frozen" },

  // Snacks
  { key: "crisps", names: ["crisps", "ready salted crisps"], category: "snacks" },
  { key: "chocolate", names: ["chocolate", "milk chocolate", "chocolate bar", "dairy milk"], category: "snacks" },
  { key: "chocolate-dark", names: ["dark chocolate"], category: "snacks" },
  { key: "biscuits", names: ["biscuits", "digestives", "digestive biscuits", "rich tea biscuits"], category: "snacks" },
];

/**
 * Products bought by count: "6 bananas" means six bananas (one pack of six),
 * never six packs.
 */
export const COUNTABLE_KEYS: ReadonlySet<string> = new Set<string>([
  "eggs",
  "bananas",
  "apples",
  "oranges",
  "lemons",
  "avocados",
  "onions",
  "peppers",
  "croissants",
  "bagels",
  "wraps",
  "cucumber",
  "lettuce",
  "toilet-roll",
  "tea-bags",
  "potatoes",
  "carrots",
  "tomatoes",
]);

/**
 * Typical single-item weight in grams for produce sold loose or by the bag.
 * Used only to estimate how many weight-sold packs cover a count ("12 bananas"
 * against a 1kg bag); such matches are always flagged as estimated.
 */
export const APPROX_ITEM_GRAMS: ReadonlyMap<string, number> = new Map<string, number>([
  ["bananas", 120],
  ["apples", 150],
  ["oranges", 180],
  ["lemons", 100],
  ["onions", 150],
  ["peppers", 160],
  ["potatoes", 200],
  ["carrots", 70],
  ["tomatoes", 90],
  ["avocados", 200],
]);

/**
 * Words that start a trailing description ("orange juice WITH bits"): the
 * product's head noun is the last meaningful word before the first of these.
 */
export const CONNECTOR_WORDS: ReadonlySet<string> = new Set<string>(["with", "without", "in", "from", "no"]);

/**
 * Names too ambiguous to price on their own ("pepper": bell pepper or black
 * pepper?). Matched against the whole normalised item name only.
 */
export const AMBIGUOUS_NAMES: readonly string[] = ["pepper"];

/** Canonical material qualifiers: any of these changes what the product is. */
export const MATERIAL_QUALIFIERS: readonly string[] = [
  "oat",
  "soya",
  "almond",
  "coconut",
  "lactose-free",
  "dairy-free",
  "vegan",
  "vegetarian",
  "gluten-free",
  "decaf",
  "organic",
  "diet",
  "zero",
  "sugar-free",
  "low-fat",
  "skimmed",
  "semi-skimmed",
  "whole",
  "unsalted",
  "unsmoked",
  "frozen",
  "sparkling",
];

const MATERIAL_QUALIFIER_SET: ReadonlySet<string> = new Set(MATERIAL_QUALIFIERS);

/** Phrase (normalised tokens joined by a space) → canonical qualifier. */
const QUALIFIER_ALIASES: Readonly<Record<string, string>> = {
  oat: "oat",
  soya: "soya",
  soy: "soya",
  almond: "almond",
  coconut: "coconut",
  "lactose free": "lactose-free",
  "dairy free": "dairy-free",
  vegan: "vegan",
  "plant based": "vegan",
  vegetarian: "vegetarian",
  veggie: "vegetarian",
  "meat free": "vegetarian",
  quorn: "vegetarian",
  "gluten free": "gluten-free",
  decaf: "decaf",
  decaffeinated: "decaf",
  "caffeine free": "decaf",
  organic: "organic",
  "free range": "free-range",
  diet: "diet",
  zero: "zero",
  "zero sugar": "zero",
  "sugar free": "sugar-free",
  "no sugar": "sugar-free",
  "no added sugar": "sugar-free",
  "low fat": "low-fat",
  "reduced fat": "low-fat",
  "fat free": "low-fat",
  "half fat": "low-fat",
  light: "low-fat",
  lite: "low-fat",
  skimmed: "skimmed",
  skim: "skimmed",
  "semi skimmed": "semi-skimmed",
  "semi skim": "semi-skimmed",
  semi: "semi-skimmed",
  whole: "whole",
  "full fat": "whole",
  unsalted: "unsalted",
  unsmoked: "unsmoked",
  frozen: "frozen",
  sparkling: "sparkling",
  fizzy: "sparkling",
};

const MAX_QUALIFIER_PHRASE_TOKENS = 3;

/** Words that describe packaging/size/origin but never change the product. */
const NOISE_WORDS = new Set<string>([
  "a", "an", "the", "of", "some", "for", "with", "and", "in", "on", "x",
  "pack", "pk", "packet", "bag", "loaf", "loaves", "tin", "can", "bottle", "box",
  "jar", "carton", "tub", "punnet", "bunch", "head", "bar", "multipack", "tray",
  "fresh", "large", "small", "medium", "big", "british", "loose", "sliced", "value",
  "standard", "regular", "family", "size", "mature", "mild", "extra", "virgin", "ripe",
  "style", "finest", "essential", "everyday",
  "pint", "pt", "g", "kg", "ml", "l", "cl", "litre", "liter", "gram", "dozen",
]);

const RETAILER_WORDS: ReadonlySet<string> = new Set<string>([
  ...RETAILER_IDS,
  ...Object.values(RETAILERS).flatMap((r) => tokenize(r.name)),
]);

/** Lowercase, strip accents/apostrophes, split on anything non-alphanumeric. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Minimal English plural stemmer, applied identically to both sides of a comparison. */
export function stemToken(token: string): string {
  if (/\d/.test(token) || token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes")) return token.slice(0, -2);
  if (/(?:ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us")) {
    return token.slice(0, -1);
  }
  return token;
}

/** True for tokens that carry no product identity (packaging, sizes, retailer names). */
export function isNoiseToken(token: string): boolean {
  if (/\d/.test(token)) return true;
  const stem = stemToken(token);
  return (
    NOISE_WORDS.has(token) ||
    NOISE_WORDS.has(stem) ||
    RETAILER_WORDS.has(token) ||
    RETAILER_WORDS.has(stem)
  );
}

/** Maps any spelling of a qualifier ('Semi Skimmed', 'free_range') to its canonical form. */
export function normaliseQualifier(q: string): string {
  const tokens = tokenize(q);
  const alias = QUALIFIER_ALIASES[tokens.join(" ")];
  return alias ?? tokens.join("-");
}

const PRODUCTS_BY_KEY: ReadonlyMap<string, CanonicalProduct> = new Map(
  CANONICAL_PRODUCTS.map((p) => [p.key, p])
);

export function getCanonicalProduct(key: string): CanonicalProduct | undefined {
  return PRODUCTS_BY_KEY.get(key);
}

/** Canonical qualifiers intrinsic to a product key (empty for unknown keys). */
export function intrinsicQualifiers(key: string): string[] {
  return (PRODUCTS_BY_KEY.get(key)?.qualifiers ?? []).map(normaliseQualifier);
}

const NAME_INDEX: readonly { product: CanonicalProduct; stems: string[] }[] =
  CANONICAL_PRODUCTS.flatMap((product) =>
    product.names.map((name) => ({ product, stems: tokenize(name).map(stemToken) }))
  );

interface QualifierScan {
  /**
   * Material qualifiers only. Non-material aliases (e.g. 'free range') still
   * consume their tokens so they count as explained words.
   */
  qualifiers: string[];
  /** Token indices consumed by any qualifier phrase. */
  qualifierTokens: Set<number>;
  /** Token indices consumed by multi-token qualifier phrases (e.g. 'sugar free'). */
  phraseTokens: Set<number>;
}

function scanQualifiers(tokens: readonly string[]): QualifierScan {
  const found = new Set<string>();
  const qualifierTokens = new Set<number>();
  const phraseTokens = new Set<number>();
  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (let len = Math.min(MAX_QUALIFIER_PHRASE_TOKENS, tokens.length - i); len >= 1; len--) {
      const alias = QUALIFIER_ALIASES[tokens.slice(i, i + len).join(" ")];
      if (alias !== undefined) {
        found.add(alias);
        for (let j = i; j < i + len; j++) {
          qualifierTokens.add(j);
          if (len > 1) phraseTokens.add(j);
        }
        consumed = len;
        break;
      }
    }
    i += consumed > 0 ? consumed : 1;
  }
  return {
    qualifiers: [...found].filter((q) => MATERIAL_QUALIFIER_SET.has(q)).sort(),
    qualifierTokens,
    phraseTokens,
  };
}

function findSequence(haystack: readonly string[], needle: readonly string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Resolves free text to a canonical product. `key` is only returned when every
 * meaningful word is explained by the matched name, a qualifier, or packaging
 * noise — so "strawberry yoghurt" does NOT resolve to natural yoghurt.
 */
export function canonicalise(name: string): {
  key: string | null;
  category: string | null;
  qualifiers: string[];
} {
  const tokens = tokenize(name);
  const stems = tokens.map(stemToken);
  const scan = scanQualifiers(tokens);

  let best: { product: CanonicalProduct; start: number; length: number; effective: number } | null =
    null;
  for (const entry of NAME_INDEX) {
    const start = findSequence(stems, entry.stems);
    if (start < 0) continue;
    const length = entry.stems.length;
    let effective = 0;
    for (let j = start; j < start + length; j++) {
      if (!scan.phraseTokens.has(j)) effective++;
    }
    if (
      best === null ||
      effective > best.effective ||
      (effective === best.effective && length > best.length)
    ) {
      best = { product: entry.product, start, length, effective };
    }
  }

  if (best === null) {
    return { key: null, category: null, qualifiers: scan.qualifiers };
  }

  const matched = best;
  const allExplained = tokens.every(
    (token, i) =>
      (i >= matched.start && i < matched.start + matched.length) ||
      scan.qualifierTokens.has(i) ||
      isNoiseToken(token)
  );

  if (!allExplained) {
    return { key: null, category: null, qualifiers: scan.qualifiers };
  }
  return {
    key: matched.product.key,
    category: matched.product.category,
    qualifiers: scan.qualifiers,
  };
}

/** Stemmed identity words: excludes packaging/size noise and qualifier phrases. */
export function meaningfulStems(text: string): string[] {
  const tokens = tokenize(text);
  const scan = scanQualifiers(tokens);
  return tokens
    .filter((token, i) => !scan.qualifierTokens.has(i) && !isNoiseToken(token))
    .map(stemToken);
}
