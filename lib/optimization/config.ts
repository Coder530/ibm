import type { OptimizerConfig, Preferences } from "@/types/optimization";

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  minMultiStoreSavingMinor: 150,
  maxRecommendedStores: 3,
  inconveniencePerExtraStoreMinor: 100,
  transport: {
    walk: { costPerKmMinor: 0, speedKmh: 4.8, valuePerMinuteMinor: 3 },
    bike: { costPerKmMinor: 0, speedKmh: 15, valuePerMinuteMinor: 3 },
    // Bus fare is a flat per-trip charge added in travel.ts.
    bus: { costPerKmMinor: 0, speedKmh: 18, valuePerMinuteMinor: 3 },
    car: { costPerKmMinor: 25, speedKmh: 30, valuePerMinuteMinor: 3 },
  },
};

/** Applies user preferences on top of a base config. Never mutates `base`. */
export function resolveConfig(
  prefs: Preferences,
  base: OptimizerConfig = DEFAULT_OPTIMIZER_CONFIG
): OptimizerConfig {
  const maxRecommendedStores = Math.min(base.maxRecommendedStores, prefs.maxStores) as 1 | 2 | 3;
  return {
    ...base,
    maxRecommendedStores,
    transport: {
      walk: { ...base.transport.walk },
      bike: { ...base.transport.bike },
      bus: { ...base.transport.bus },
      car: { ...base.transport.car },
    },
  };
}
