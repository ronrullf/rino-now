import { ProductComparison } from "@/components/product-comparison";
import { productId } from "@/lib/security/inputs";
import { notFound } from "next/navigation";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId: id } = await params;
  try {
    productId(id);
  } catch {
    notFound();
  }
  return <ProductComparison id={id.toUpperCase()} />;
}
