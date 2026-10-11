import { CatalogBrowser } from "@/components/catalog-browser";

export const metadata = {
  title: "Master Store Catalog — All Games & Regional Prices",
  description:
    "Browse every game across the United States, Turkey, India, and Japan with synchronized regional prices, currency equivalents, and direct store links.",
};

export default function CatalogPage() {
  return <CatalogBrowser />;
}
