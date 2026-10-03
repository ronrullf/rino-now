import type { ApiEnvelope } from "@/lib/contracts";
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.data;
}
