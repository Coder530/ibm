"use client";

import { useState, type FormEvent } from "react";
import type { ResolvedLocation } from "@/components/useCompareFlow";
import { normalisePostcode } from "@/lib/location/postcode";
import { postGeocode } from "@/components/location/postGeocode";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

interface LocationStepProps {
  location: ResolvedLocation | null;
  onResolved: (location: ResolvedLocation) => void;
  onClear: () => void;
}

type GeoDenialReason = "denied" | "unavailable" | "timeout" | "unsupported";

const GEO_ERROR_COPY: Record<GeoDenialReason, string> = {
  denied: "Location access was denied. Enter your postcode instead.",
  unavailable: "Your location couldn't be determined. Enter your postcode instead.",
  timeout: "Finding your location took too long. Enter your postcode instead.",
  unsupported: "This browser doesn't support location lookup. Enter your postcode instead.",
};

function geoErrorReason(err: GeolocationPositionError): GeoDenialReason {
  if (err.code === err.PERMISSION_DENIED) return "denied";
  if (err.code === err.TIMEOUT) return "timeout";
  return "unavailable";
}

/**
 * Resolves the shopper's approximate area — "Use my location" (geolocation
 * requested only on click, never on mount) or a postcode. Precise
 * coordinates never leave React state (P5): no URL, no storage.
 */
export function LocationStep({ location, onResolved, onClear }: LocationStepProps) {
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"geo" | "postcode" | null>(null);

  const handleUseLocation = (): void => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError(GEO_ERROR_COPY.unsupported);
      return;
    }
    setLoading("geo");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          try {
            const result = await postGeocode({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            if (result.ok) {
              onResolved({
                latitude: result.latitude,
                longitude: result.longitude,
                area: result.area,
                postcode: result.postcode,
              });
            } else {
              setGeoError(result.message);
            }
          } finally {
            setLoading(null);
          }
        })();
      },
      (err) => {
        setLoading(null);
        setGeoError(GEO_ERROR_COPY[geoErrorReason(err)]);
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const handlePostcodeSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalised = normalisePostcode(postcode);
    if (!normalised) {
      setPostcodeError("That doesn't look like a UK postcode.");
      return;
    }
    setPostcodeError(null);
    setLoading("postcode");
    void (async () => {
      try {
        const result = await postGeocode({ postcode: normalised });
        if (result.ok) {
          onResolved({
            latitude: result.latitude,
            longitude: result.longitude,
            area: result.area,
            postcode: result.postcode,
          });
        } else {
          setPostcodeError(result.message);
        }
      } finally {
        setLoading(null);
      }
    })();
  };

  if (location) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm text-ink">
          <span className="text-ink-soft">Shopping near</span>{" "}
          <span className="font-semibold">{location.area}</span>
          {location.postcode ? <span className="text-ink-soft"> · {location.postcode}</span> : null}
        </p>
        <Button variant="ghost" className="px-2" onClick={onClear}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button onClick={handleUseLocation} disabled={loading !== null} className="w-full sm:w-auto">
          {loading === "geo" ? "Finding you…" : "Use my location"}
        </Button>
        {geoError ? (
          <p role="alert" className="text-xs text-tomato-ink">
            {geoError}
          </p>
        ) : (
          <p className="text-xs text-ink-soft">We only ask for this when you tap the button.</p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
      </div>

      <form onSubmit={handlePostcodeSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Postcode"
            autoComplete="postal-code"
            placeholder="SW1A 1AA"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            error={postcodeError ?? undefined}
            maxLength={12}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading !== null}>
          {loading === "postcode" ? "Looking up…" : "Find my area"}
        </Button>
      </form>
    </div>
  );
}
