"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Preferences } from "@/types/optimization";
import { streamCompare } from "@/components/compareClient";
import { useCompareFlow } from "@/components/useCompareFlow";
import { LocationStep } from "@/components/location/LocationStep";
import { ListStep } from "@/components/shopping-list/ListStep";
import { PreferencesBar } from "@/components/comparison/PreferencesBar";
import { SearchTicker } from "@/components/comparison/SearchTicker";
import { StoreRadar } from "@/components/stores/StoreRadar";
import { ReceiptHero } from "@/components/basket/ReceiptHero";
import { AlternativeCards } from "@/components/basket/AlternativeCards";
import { BasketBreakdown } from "@/components/basket/BasketBreakdown";
import { StickySummary } from "@/components/basket/StickySummary";
import { Button } from "@/components/ui/Button";

const BREAKDOWN_ID = "basket-breakdown";

/**
 * Flow state machine: location → list → comparing → results (+ error).
 * Each completed step prints as a short summary line above the active one,
 * building one continuous receipt down the page.
 */
export function ReceiptApp() {
  const [state, dispatch] = useCompareFlow();
  const reducedMotion = useReducedMotion();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const comparingHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRegionRef = useRef<HTMLDivElement>(null);

  // U3: move focus to the step-3 heading on entering "comparing", and to the
  // error region (message + retry button) on entering "error" — never on
  // initial mount, since state.step starts at "location" and only reaches
  // these values via a later user-driven transition.
  useEffect(() => {
    const target =
      state.step === "comparing"
        ? comparingHeadingRef.current
        : state.step === "error"
          ? errorRegionRef.current
          : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [state.step, reducedMotion]);

  // Runs (and aborts) the streaming compare request whenever a new one
  // starts — keyed on the snapshot the reducer captured at start time so
  // this effect has exactly one real dependency.
  const activeRequest = state.activeRequest;
  useEffect(() => {
    if (state.step !== "comparing" || !activeRequest) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      for await (const event of streamCompare(activeRequest, { signal: controller.signal })) {
        if (cancelled) return;
        dispatch({ type: "compare/event", event });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeRequest, state.step, dispatch]);

  const handlePrefsChange = (prefs: Preferences): void => {
    dispatch({ type: "prefs/set", prefs });
    if (state.step === "results") {
      dispatch({ type: "compare/start" });
    }
  };

  const widenRadius = (): void => {
    const widened = Math.min(16000, state.prefs.maxDistanceMeters * 2);
    dispatch({ type: "prefs/set", prefs: { ...state.prefs, maxDistanceMeters: widened } });
    dispatch({ type: "compare/start" });
  };

  // Derived, not synced via effect: if the selection doesn't belong to the
  // current result (a fresh compare ran, or nothing was picked yet) this
  // falls back to the recommendation — no setState-in-effect needed.
  const recommended = state.result?.recommended ?? null;
  const alternativePlans = state.result?.alternatives.map((a) => a.plan) ?? [];
  const plan = recommended
    ? ([recommended, ...alternativePlans].find((p) => p.id === selectedPlanId) ?? recommended)
    : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-8 pb-28 sm:px-6 md:pb-16">
      <motion.section layout={!reducedMotion} className="relative bg-receipt p-5 sm:p-6">
        <p className="receipt-label mb-3">Step 1 — Where are you shopping?</p>
        <LocationStep
          location={state.location}
          onResolved={(location) => dispatch({ type: "location/set", location })}
          onClear={() => dispatch({ type: "location/clear" })}
        />
      </motion.section>

      <AnimatePresence initial={false}>
        {state.location ? (
          <motion.section
            key="list"
            layout={!reducedMotion}
            initial={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative bg-receipt p-5 sm:p-6"
          >
            <hr className="perforation absolute -top-3 right-0 left-0" />
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="receipt-label">Step 2 — What&apos;s on your list?</p>
              {state.step !== "list" ? (
                <Button variant="ghost" className="px-2" onClick={() => dispatch({ type: "list/edit" })}>
                  Edit list
                </Button>
              ) : null}
            </div>
            {state.step === "list" || state.items.length === 0 ? (
              <ListStep
                listText={state.listText}
                items={state.items}
                warnings={state.parseWarnings}
                onChange={(listText, items, warnings) =>
                  dispatch({ type: "list/change", listText, items, warnings })
                }
                onCompare={() => dispatch({ type: "compare/start" })}
                comparing={state.step === "comparing"}
              />
            ) : (
              <p className="font-mono text-sm text-ink-soft">
                {state.items.length} {state.items.length === 1 ? "item" : "items"}:{" "}
                {state.items.map((i) => i.name).join(", ")}
              </p>
            )}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {state.step === "comparing" || state.step === "error" ? (
          <motion.section
            key="comparing"
            layout={!reducedMotion}
            initial={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative bg-receipt p-5 sm:p-6"
          >
            <hr className="perforation absolute -top-3 right-0 left-0" />
            <h2 ref={comparingHeadingRef} tabIndex={-1} className="receipt-label mb-3">
              Step 3 — Comparing prices
            </h2>
            {state.step === "error" && state.error ? (
              <div ref={errorRegionRef} tabIndex={-1} className="flex flex-col items-start gap-3">
                <p className="text-sm text-tomato-ink" role="alert">
                  {state.error.message}
                </p>
                <Button variant="secondary" onClick={() => dispatch({ type: "compare/retry" })}>
                  Try again
                </Button>
              </div>
            ) : (
              <SearchTicker
                retailerEvents={state.retailerEvents}
                discovery={state.discovery}
                radiusMeters={state.prefs.maxDistanceMeters}
              />
            )}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {state.step === "results" && state.result ? (
          <motion.section
            key="results"
            layout={!reducedMotion}
            initial={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <hr className="perforation absolute -top-3 right-0 left-0" />
            <div className="grid gap-6 pt-3 lg:grid-cols-12">
              <div className="flex flex-col gap-6 lg:col-span-7">
                <ReceiptHero
                  result={state.result}
                  offersFreshness={state.offersFreshness ?? "demo"}
                  transport={state.prefs.transport}
                  onWidenRadius={widenRadius}
                  onEditList={() => dispatch({ type: "list/edit" })}
                />
                {plan ? <BasketBreakdown plan={plan} id={BREAKDOWN_ID} /> : null}
              </div>

              <div className="flex flex-col gap-6 lg:col-span-5">
                {state.location && state.discovery && state.result.recommended ? (
                  <div className="bg-receipt p-5">
                    <p className="receipt-label mb-3">Nearby stores</p>
                    <StoreRadar
                      origin={state.location}
                      stores={state.discovery.stores}
                      radiusMeters={state.prefs.maxDistanceMeters}
                      recommendedStoreIds={state.result.recommended.stores.map((s) => s.id)}
                    />
                  </div>
                ) : null}

                {state.result.recommended ? (
                  <div className="bg-receipt p-5">
                    <AlternativeCards
                      alternatives={state.result.alternatives}
                      recommended={state.result.recommended}
                      selectedId={selectedPlanId ?? state.result.recommended.id}
                      onSelect={setSelectedPlanId}
                    />
                  </div>
                ) : null}

                <div className="bg-receipt p-5">
                  <p className="receipt-label mb-3">Preferences</p>
                  <PreferencesBar prefs={state.prefs} onChange={handlePrefsChange} />
                </div>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {state.step === "results" && plan ? <StickySummary plan={plan} breakdownId={BREAKDOWN_ID} /> : null}
    </div>
  );
}
