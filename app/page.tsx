import { ReceiptApp } from "@/components/ReceiptApp";
import { TornEdge } from "@/components/ui/TornEdge";
import { Stamp } from "@/components/ui/Stamp";

const PRINTED_LINES: { name: string; price: string; delay: number }[] = [
  { name: "2 pints milk", price: "£1.45", delay: 0.5 },
  { name: "6 eggs", price: "£1.65", delay: 0.75 },
  { name: "500g beef mince", price: "£3.20", delay: 1.0 },
  { name: "loaf of bread", price: "£0.99", delay: 1.25 },
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 pt-14 pb-10 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pt-28">
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Where your shopping list costs least, today.
          </h1>
          <p className="max-w-prose text-lg text-ink-soft">
            Tell Receipt your postcode and your list. It checks nearby supermarkets and prints out the
            cheapest way to buy it all — one store, or a split only when the saving is worth the trip.
          </p>
          <a
            href="#start"
            className="inline-flex min-h-11 w-fit items-center border border-ink px-5 text-sm font-medium tracking-wide text-ink transition-colors duration-150 hover:bg-ink hover:text-receipt"
          >
            Start with your postcode
          </a>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          {/* O1/O5: this illustration shows made-up prices for layout only —
              it's aria-hidden with a short text alternative below, so screen
              readers get an honest one-line summary instead of fake numbers. */}
          <span className="sr-only">Example of a Receipt result</span>
          <div aria-hidden="true">
            <div className="rounded-sm bg-ink px-4 py-2">
              <p className="receipt-label text-center text-paper/70">Example receipt</p>
            </div>
            <div className="relative overflow-hidden bg-receipt px-5 pt-4 pb-6 animate-feed">
              <p className="receipt-label mb-3 border-b border-dotted border-rule pb-2">Your cheapest shop</p>
              <ul className="flex flex-col gap-1.5 font-mono text-sm text-ink">
                {PRINTED_LINES.map((line) => (
                  <li
                    key={line.name}
                    className="flex items-baseline gap-2 opacity-0 animate-print"
                    style={{ animationDelay: `${line.delay}s`, animationFillMode: "forwards" }}
                  >
                    <span>{line.name}</span>
                    <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-rule" />
                    <span className="tabular-nums">{line.price}</span>
                  </li>
                ))}
              </ul>
              <div
                className="mt-3 flex items-baseline justify-between border-t border-rule pt-3 font-mono text-lg font-semibold text-ink opacity-0 animate-print"
                style={{ animationDelay: "1.5s", animationFillMode: "forwards" }}
              >
                <span className="text-sm font-normal tracking-wide uppercase">Total</span>
                <span className="tabular-nums">£7.29</span>
              </div>
              <div
                className="mt-4 opacity-0 animate-print"
                style={{ animationDelay: "1.8s", animationFillMode: "forwards" }}
              >
                <Stamp className="text-xs">Saves £2.10 — example</Stamp>
              </div>
              <p
                className="mt-3 text-xs text-ink-soft opacity-0 animate-print"
                style={{ animationDelay: "2s", animationFillMode: "forwards" }}
              >
                Illustrative prices — not a real quote
              </p>
              <TornEdge edge="bottom" className="absolute right-0 bottom-0 left-0 translate-y-1/2" />
            </div>
          </div>
        </div>
      </section>

      <div id="start">
        <ReceiptApp />
      </div>

      <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-ink-faint sm:px-6">
        <p className="mb-1">Store locations © OpenStreetMap contributors, ODbL.</p>
        <p className="mb-1">Postcode lookups by postcodes.io.</p>
        <p>Prices shown are demo data for this preview — not live retailer prices.</p>
      </footer>
    </main>
  );
}
