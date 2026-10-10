"use client";

import type { Comparison, Product } from "./contracts";
import type { BasketEntry } from "./pricing/basket";

const STORAGE_KEY = "xbox_team_basket";
const EVENT_NAME = "xbox-basket-updated";

export function getBasket(): BasketEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveBasket(items: BasketEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore quota errors
  }
}

export function addToBasket(product: Product, comparison: Comparison | null = null): void {
  const current = getBasket();
  if (current.some((item) => item.product.id === product.id)) {
    // Update comparison if newer
    const updated = current.map((item) =>
      item.product.id === product.id ? { ...item, comparison: comparison ?? item.comparison } : item,
    );
    saveBasket(updated);
    return;
  }
  const next: BasketEntry[] = [
    ...current,
    {
      product,
      comparison,
      addedAt: new Date().toISOString(),
    },
  ];
  saveBasket(next);
}

export function removeFromBasket(productId: string): void {
  const current = getBasket();
  saveBasket(current.filter((item) => item.product.id !== productId));
}

export function clearBasket(): void {
  saveBasket([]);
}

export function isInBasket(productId: string): boolean {
  return getBasket().some((item) => item.product.id === productId);
}

export function subscribeBasket(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}
