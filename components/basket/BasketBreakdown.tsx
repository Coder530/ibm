import type { BasketLine, BasketPlan } from "@/types/optimization";
import { formatMinor } from "@/lib/units/money";

interface BasketBreakdownProps {
  plan: BasketPlan;
  id?: string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

interface LineStatus {
  text: string;
  tone: string;
  icon: string;
}

function statusFor(line: BasketLine): LineStatus {
  if (line.status === "missing") {
    return { text: "Not priced — excluded from total", tone: "text-tomato-ink", icon: "✕" };
  }
  if (line.status === "unavailable") {
    return { text: "Unavailable — excluded from total", tone: "text-tomato-ink", icon: "✕" };
  }
  // Estimated quantities are flagged on their own: the product match is right,
  // but the pack count came from typical item weights (e.g. 12 bananas ≈ 2 × 1kg).
  if (line.offer?.quantityEstimated) {
    return { text: "Quantity estimated — check pack count", tone: "text-amber", icon: "≈" };
  }
  if (line.offer && line.offer.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { text: "Low confidence match", tone: "text-amber", icon: "!" };
  }
  return { text: "Priced", tone: "text-sage", icon: "✓" };
}

function matchedProductText(line: BasketLine): string {
  if (!line.offer) return "No match found";
  return line.offer.size ? `${line.offer.productName} · ${line.offer.size}` : line.offer.productName;
}

/** Full itemised breakdown: semantic table ≥md, stacked receipt lines on mobile. */
export function BasketBreakdown({ plan, id }: BasketBreakdownProps) {
  return (
    <div id={id} tabIndex={-1}>
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">
          Basket breakdown for {plan.stores.map((s) => s.name).join(" and ")}
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="receipt-label py-2 pr-2 font-normal">
              Item
            </th>
            <th scope="col" className="receipt-label py-2 pr-2 text-right font-normal">
              Qty
            </th>
            <th scope="col" className="receipt-label py-2 pr-2 font-normal">
              Matched product
            </th>
            <th scope="col" className="receipt-label py-2 pr-2 font-normal">
              Store
            </th>
            <th scope="col" className="receipt-label py-2 pr-2 text-right font-normal">
              Price
            </th>
            <th scope="col" className="receipt-label py-2 pr-2 text-right font-normal">
              Unit price
            </th>
            <th scope="col" className="receipt-label py-2 font-normal">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.lines.map((line) => {
            const status = statusFor(line);
            return (
              <tr key={line.itemId} className="border-b border-dotted border-rule align-top">
                <td className="py-2 pr-2 text-ink">{line.itemName}</td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums text-ink">{line.quantity}</td>
                <td className="py-2 pr-2 text-ink-soft">{matchedProductText(line)}</td>
                <td className="py-2 pr-2 text-ink-soft">{line.store?.name ?? "—"}</td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums text-ink">
                  {line.status === "priced" ? formatMinor(line.lineTotalMinor) : "—"}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums text-ink-soft">
                  {line.offer?.unitPriceMinor !== undefined
                    ? `${formatMinor(line.offer.unitPriceMinor)}/${line.offer.unit}`
                    : "—"}
                </td>
                <td className={`py-2 text-xs font-medium whitespace-nowrap ${status.tone}`}>
                  <span aria-hidden="true">{status.icon}</span> {status.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="flex flex-col md:hidden">
        {plan.lines.map((line) => {
          const status = statusFor(line);
          return (
            <li key={line.itemId} className="border-b border-dotted border-rule py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-ink">
                  {line.quantity}× {line.itemName}
                </span>
                <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-rule" />
                <span className="font-mono text-sm tabular-nums text-ink">
                  {line.status === "priced" ? formatMinor(line.lineTotalMinor) : "—"}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {matchedProductText(line)}
                {line.store ? ` · ${line.store.name}` : ""}
              </p>
              <p className={`text-xs font-medium ${status.tone}`}>
                <span aria-hidden="true">{status.icon}</span> {status.text}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
