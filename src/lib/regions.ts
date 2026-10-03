export const regions = {
  US: { name: "United States", currency: "USD", locale: "en-US", short: "US" },
  TR: { name: "Turkey", currency: "TRY", locale: "tr-TR", short: "TR" },
  IN: { name: "India", currency: "INR", locale: "en-IN", short: "IN" },
  JP: { name: "Japan", currency: "JPY", locale: "ja-JP", short: "JP" },
} as const;
export type Market = keyof typeof regions;
export const markets = Object.keys(regions) as Market[];
export type Currency = (typeof regions)[Market]["currency"];
