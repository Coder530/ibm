export type Measure =
  | { kind: "mass"; grams: number }
  | { kind: "volume"; ml: number }
  | { kind: "count"; count: number };

const UK_PINT_ML = 568;

const MASS_UNITS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

const VOLUME_UNITS: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
  pt: UK_PINT_ML,
  pint: UK_PINT_ML,
  pints: UK_PINT_ML,
};

const NUM = "(\\d+(?:\\.\\d+)?)";

function toMassGrams(value: number, unit: string): number | null {
  const factor = MASS_UNITS[unit.toLowerCase()];
  return factor == null ? null : value * factor;
}

function toVolumeMl(value: number, unit: string): number | null {
  const factor = VOLUME_UNITS[unit.toLowerCase()];
  return factor == null ? null : value * factor;
}

/**
 * Parses a free-text size/quantity string into a normalised Measure.
 * Returns null when the text does not match any recognised pattern.
 */
export function parseSize(text: string): Measure | null {
  const input = text.trim();
  if (!input) return null;

  // Compound: "4 x 400g" / "4x400ml" — count of sub-units of mass or volume.
  const compound = new RegExp(
    `^${NUM}\\s*x\\s*${NUM}\\s*([a-zA-Z]+)$`,
    "i"
  ).exec(input);
  if (compound) {
    const count = Number(compound[1]);
    const subValue = Number(compound[2]);
    const unit = compound[3] ?? "";
    const grams = toMassGrams(subValue, unit);
    if (grams != null) {
      return { kind: "mass", grams: count * grams };
    }
    const ml = toVolumeMl(subValue, unit);
    if (ml != null) {
      return { kind: "volume", ml: count * ml };
    }
    return null;
  }

  // Simple mass: "500g", "1.5kg"
  const mass = new RegExp(`^${NUM}\\s*([a-zA-Z]+)$`, "i").exec(input);
  if (mass) {
    const value = Number(mass[1]);
    const unit = mass[2] ?? "";
    const grams = toMassGrams(value, unit);
    if (grams != null) {
      return { kind: "mass", grams };
    }
    const ml = toVolumeMl(value, unit);
    if (ml != null) {
      return { kind: "volume", ml };
    }
  }

  // "6 pack" — plain count pack
  const pack = /^(\d+)\s*(?:pack|pk)$/i.exec(input);
  if (pack) {
    return { kind: "count", count: Number(pack[1]) };
  }

  // "x12" — multiplier count
  const xCount = /^x\s*(\d+)$/i.exec(input);
  if (xCount) {
    return { kind: "count", count: Number(xCount[1]) };
  }

  // "dozen" / "2 dozen"
  const dozen = /^(?:(\d+(?:\.\d+)?)\s*)?dozen$/i.exec(input);
  if (dozen) {
    const multiplier = dozen[1] != null ? Number(dozen[1]) : 1;
    return { kind: "count", count: multiplier * 12 };
  }

  return null;
}
