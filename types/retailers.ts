export const RETAILER_IDS = [
  "tesco",
  "sainsburys",
  "asda",
  "morrisons",
  "aldi",
  "lidl",
  "waitrose",
  "coop",
  "iceland",
  "mands",
  "ocado",
] as const;

export type RetailerId = (typeof RETAILER_IDS)[number];

export interface Retailer {
  id: RetailerId;
  name: string;
  color: string;
  logo?: string;
}

export const RETAILERS: Record<RetailerId, Retailer> = {
  tesco: { id: "tesco", name: "Tesco", color: "#00539F" },
  sainsburys: { id: "sainsburys", name: "Sainsbury's", color: "#F06C00" },
  asda: { id: "asda", name: "Asda", color: "#78BE20" },
  morrisons: { id: "morrisons", name: "Morrisons", color: "#FFD400" },
  aldi: { id: "aldi", name: "Aldi", color: "#00549F" },
  lidl: { id: "lidl", name: "Lidl", color: "#0050AA" },
  waitrose: { id: "waitrose", name: "Waitrose", color: "#5F9B2D" },
  coop: { id: "coop", name: "Co-op", color: "#00B1E7" },
  iceland: { id: "iceland", name: "Iceland", color: "#E4032E" },
  mands: { id: "mands", name: "M&S Food", color: "#000000" },
  ocado: { id: "ocado", name: "Ocado", color: "#7DC242" },
};

export type Freshness = "live" | "cached" | "demo";

export interface StoreLocation {
  id: string;
  retailerId: RetailerId;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  distanceMeters: number;
}

export interface StoreDiscoveryResult {
  stores: StoreLocation[];
  source: "overpass" | "snapshot";
  freshness: Freshness;
  snapshotDate: string | null;
  attribution: string;
}
