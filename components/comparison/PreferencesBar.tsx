"use client";

import type { Preferences, Priority, Transport } from "@/types/optimization";
import { LIMITS } from "@/lib/validation/schemas";
import { Segmented } from "@/components/ui/Segmented";

interface PreferencesBarProps {
  prefs: Preferences;
  onChange: (prefs: Preferences) => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "cheapest", label: "Cheapest" },
  { value: "balanced", label: "Best balance" },
  { value: "fewest-stores", label: "Fewest stores" },
  { value: "closest", label: "Closest" },
];

const TRANSPORT_OPTIONS: { value: Transport; label: string }[] = [
  { value: "walk", label: "Walk" },
  { value: "bike", label: "Bike" },
  { value: "bus", label: "Bus" },
  { value: "car", label: "Car" },
];

const MILES_TO_METERS = 1609.34;
const RADIUS_MILES = [1, 3, 5, 10] as const;
const RADIUS_OPTIONS: { value: number; label: string }[] = RADIUS_MILES.map((miles) => ({
  value: Math.min(LIMITS.maxRadiusMeters, Math.round(miles * MILES_TO_METERS)),
  label: `${miles} mi`,
}));

const MAX_STORES_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "1 store" },
  { value: 2, label: "2 stores" },
  { value: 3, label: "3 stores" },
];

/** Priority, transport, max-stores and radius controls — changes re-run the compare. */
export function PreferencesBar({ prefs, onChange }: PreferencesBarProps) {
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        legend="Priority"
        options={PRIORITY_OPTIONS}
        value={prefs.priority}
        onChange={(priority) => onChange({ ...prefs, priority })}
      />
      <Segmented
        legend="Getting there"
        options={TRANSPORT_OPTIONS}
        value={prefs.transport}
        onChange={(transport) => onChange({ ...prefs, transport })}
      />
      <Segmented
        legend="Max stores"
        options={MAX_STORES_OPTIONS}
        value={prefs.maxStores}
        onChange={(maxStores) => onChange({ ...prefs, maxStores })}
      />
      <Segmented
        legend="Search radius"
        options={RADIUS_OPTIONS}
        value={Math.min(LIMITS.maxRadiusMeters, prefs.maxDistanceMeters)}
        onChange={(maxDistanceMeters) => onChange({ ...prefs, maxDistanceMeters })}
      />
    </div>
  );
}
