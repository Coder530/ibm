import type { RetailerAdapter } from "@/types/products";
import type { RetailerId } from "@/types/retailers";
import { adapter as tesco } from "@/data/retailers/tesco";
import { adapter as sainsburys } from "@/data/retailers/sainsburys";
import { adapter as asda } from "@/data/retailers/asda";
import { adapter as morrisons } from "@/data/retailers/morrisons";
import { adapter as aldi } from "@/data/retailers/aldi";
import { adapter as lidl } from "@/data/retailers/lidl";
import { adapter as waitrose } from "@/data/retailers/waitrose";
import { adapter as coop } from "@/data/retailers/coop";
import { adapter as iceland } from "@/data/retailers/iceland";
import { adapter as mands } from "@/data/retailers/mands";
import { adapter as ocado } from "@/data/retailers/ocado";

export const ADAPTERS: Record<RetailerId, RetailerAdapter> = {
  tesco,
  sainsburys,
  asda,
  morrisons,
  aldi,
  lidl,
  waitrose,
  coop,
  iceland,
  mands,
  ocado,
};

export function getAdapter(id: RetailerId): RetailerAdapter {
  return ADAPTERS[id];
}
