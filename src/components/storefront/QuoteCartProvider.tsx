"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { normalizeQuoteCartImagePath } from "./quoteCartImagePath";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";

export interface CartItem {
  id: number;
  name: string;
  nameEn?: string;
  sku?: string;
  quantity: number;
  category?: string;
  dimensions?: string;
  material?: string;
  color?: string;
  image?: string;
}

export type CartItemDetails = Partial<
  Omit<CartItem, "id" | "name" | "quantity">
>;

export interface QuoteProjectContext {
  spaceType: string;
  targetDate: string;
  budgetBand: string;
  notes: string;
}

export interface CartMutationResult {
  status: "added" | "updated" | "limit" | "invalid";
  quantity: number;
}

interface QuoteCartContextType {
  items: CartItem[];
  addItem: (
    catalogItemId: number,
    name: string,
    quantity?: number,
    details?: CartItemDetails,
  ) => CartMutationResult;
  removeItem: (catalogItemId: number) => void;
  updateQuantity: (catalogItemId: number, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  isLoaded: boolean;
  projectContext: QuoteProjectContext;
  updateProjectContext: (patch: Partial<QuoteProjectContext>) => void;
  resetProjectContext: () => void;
}

const QuoteCartContext = createContext<QuoteCartContextType | undefined>(
  undefined,
);

const CART_STORAGE_KEY = "furniture_quote_cart";
const PROJECT_STORAGE_KEY = "furniture_quote_project_context_v1";
const MAX_CART_ITEMS = 100;
const MAX_QUANTITY = 999;
const STORAGE_VERSION = 2;
const STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredEnvelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

export const EMPTY_PROJECT_CONTEXT: QuoteProjectContext = {
  spaceType: "",
  targetDate: "",
  budgetBand: "",
  notes: "",
};

function clampQuantity(value: number): number {
  return Math.max(1, Math.min(MAX_QUANTITY, Math.round(value) || 1));
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function normalizeStoredCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<number>();
  const normalized: CartItem[] = [];

  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      normalized.length >= MAX_CART_ITEMS
    ) {
      continue;
    }

    const legacy = candidate as Partial<CartItem> & {
      details?: CartItemDetails;
    };
    const id = Number(legacy.id);
    const name = normalizeOptionalText(legacy.name, 180);
    if (!Number.isSafeInteger(id) || id <= 0 || !name || seen.has(id)) {
      continue;
    }

    const merged = { ...legacy.details, ...legacy };
    normalized.push({
      id,
      name,
      quantity: clampQuantity(Number(legacy.quantity)),
      nameEn: normalizeOptionalText(merged.nameEn, 180),
      sku: normalizeOptionalText(merged.sku, 80),
      category: normalizeOptionalText(merged.category, 120),
      dimensions: normalizeOptionalText(merged.dimensions, 180),
      material: normalizeOptionalText(merged.material, 180),
      color: normalizeOptionalText(merged.color, 120),
      image: normalizeQuoteCartImagePath(merged.image),
    });
    seen.add(id);
  }

  return normalized;
}

function normalizeProjectContext(value: unknown): QuoteProjectContext {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_PROJECT_CONTEXT };
  }

  const candidate = value as Partial<QuoteProjectContext>;
  return {
    spaceType: normalizeOptionalText(candidate.spaceType, 80) || "",
    targetDate: normalizeOptionalText(candidate.targetDate, 20) || "",
    budgetBand: normalizeOptionalText(candidate.budgetBand, 80) || "",
    notes: normalizeOptionalText(candidate.notes, 1_200) || "",
  };
}

function unwrapStoredValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const candidate = value as Partial<StoredEnvelope<unknown>>;
  if (candidate.version !== STORAGE_VERSION || typeof candidate.savedAt !== "number") {
    return value;
  }
  if (!Number.isFinite(candidate.savedAt) || Date.now() - candidate.savedAt > STORAGE_TTL_MS) {
    return null;
  }
  return candidate.data;
}

function storedEnvelope<T>(data: T): StoredEnvelope<T> {
  return { version: STORAGE_VERSION, savedAt: Date.now(), data };
}

export function QuoteCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [projectContext, setProjectContext] = useState<QuoteProjectContext>({
    ...EMPTY_PROJECT_CONTEXT,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const itemsRef = useRef<CartItem[]>([]);

  const commitItems = useCallback((nextItems: CartItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
        const savedProject = window.localStorage.getItem(PROJECT_STORAGE_KEY);
        if (savedCart) {
          commitItems(normalizeStoredCart(unwrapStoredValue(JSON.parse(savedCart))));
        }
        if (savedProject) {
          setProjectContext(
            normalizeProjectContext(unwrapStoredValue(JSON.parse(savedProject))),
          );
        }
      } catch (error) {
        console.error("Failed to load the saved project board", error);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [commitItems]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(storedEnvelope(items)),
      );
      window.localStorage.setItem(
        PROJECT_STORAGE_KEY,
        JSON.stringify(storedEnvelope(projectContext)),
      );
    } catch (error) {
      console.error("Failed to save the project board", error);
    }
  }, [items, isLoaded, projectContext]);

  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = window.setTimeout(() => {
      trackStorefrontEvent({
        name: "project_board_snapshot",
        entityType: "project-board",
        entityId: "local-board",
        metadata: {
          itemCount: items.length,
          pieceCount: items.reduce((sum, item) => sum + item.quantity, 0),
          fieldsConfigured: [
            projectContext.spaceType,
            projectContext.targetDate,
            projectContext.budgetBand,
            projectContext.notes,
          ].filter(Boolean).length,
        },
      });
    }, 1_500);
    return () => window.clearTimeout(timeoutId);
  }, [isLoaded, items, projectContext]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      try {
        if (event.key === CART_STORAGE_KEY) {
          commitItems(
            event.newValue
              ? normalizeStoredCart(unwrapStoredValue(JSON.parse(event.newValue)))
              : [],
          );
        }
        if (event.key === PROJECT_STORAGE_KEY) {
          setProjectContext(
            event.newValue
              ? normalizeProjectContext(unwrapStoredValue(JSON.parse(event.newValue)))
              : { ...EMPTY_PROJECT_CONTEXT },
          );
        }
      } catch (error) {
        console.error("Failed to sync the project board", error);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [commitItems]);

  const addItem = useCallback(
    (
      catalogItemId: number,
      name: string,
      quantity = 1,
      details?: CartItemDetails,
    ): CartMutationResult => {
      const normalizedName = normalizeOptionalText(name, 180);
      if (
        !Number.isSafeInteger(catalogItemId) ||
        catalogItemId <= 0 ||
        !normalizedName
      ) {
        return { status: "invalid", quantity: 0 };
      }

      const currentItems = itemsRef.current;
      const existing = currentItems.find((item) => item.id === catalogItemId);
      if (!existing && currentItems.length >= MAX_CART_ITEMS) {
        return { status: "limit", quantity: 0 };
      }

      const increment = clampQuantity(quantity);
      const nextQuantity = existing
        ? Math.min(MAX_QUANTITY, existing.quantity + increment)
        : increment;

      const normalizedDetails: CartItemDetails = {
        nameEn: normalizeOptionalText(details?.nameEn, 180),
        sku: normalizeOptionalText(details?.sku, 80),
        category: normalizeOptionalText(details?.category, 120),
        dimensions: normalizeOptionalText(details?.dimensions, 180),
        material: normalizeOptionalText(details?.material, 180),
        color: normalizeOptionalText(details?.color, 120),
        image: normalizeQuoteCartImagePath(details?.image),
      };
      const nextDetails = Object.fromEntries(
        Object.entries(normalizedDetails).filter(([, value]) => value !== undefined),
      ) as CartItemDetails;

      const nextItems = existing
        ? currentItems.map((item) =>
            item.id === catalogItemId
              ? {
                  ...item,
                  ...nextDetails,
                  name: normalizedName,
                  quantity: nextQuantity,
                }
              : item,
          )
        : [
            ...currentItems,
            {
              id: catalogItemId,
              name: normalizedName,
              quantity: nextQuantity,
              ...nextDetails,
            },
          ];

      commitItems(nextItems);
      trackStorefrontEvent({
        name: existing ? "cart_update" : "cart_add",
        entityType: "catalog-item",
        entityId: catalogItemId,
        metadata: {
          itemId: catalogItemId,
          quantity: nextQuantity,
          itemCount: nextItems.length,
          pieceCount: nextItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });
      return {
        status: existing ? "updated" : "added",
        quantity: nextQuantity,
      };
    },
    [commitItems],
  );

  const removeItem = useCallback(
    (catalogItemId: number) => {
      const removed = itemsRef.current.find((item) => item.id === catalogItemId);
      if (!removed) return;
      const nextItems = itemsRef.current.filter((item) => item.id !== catalogItemId);
      commitItems(nextItems);
      trackStorefrontEvent({
        name: "cart_remove",
        entityType: "catalog-item",
        entityId: catalogItemId,
        metadata: {
          itemId: catalogItemId,
          quantity: removed.quantity,
          itemCount: nextItems.length,
          pieceCount: nextItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });
    },
    [commitItems],
  );

  const updateQuantity = useCallback(
    (catalogItemId: number, quantity: number) => {
      if (!Number.isFinite(quantity)) return;
      if (quantity <= 0) {
        removeItem(catalogItemId);
        return;
      }

      const nextItems = itemsRef.current.map((item) =>
          item.id === catalogItemId
            ? { ...item, quantity: clampQuantity(quantity) }
            : item,
        );
      commitItems(nextItems);
      trackStorefrontEvent({
        name: "cart_update",
        entityType: "catalog-item",
        entityId: catalogItemId,
        metadata: {
          itemId: catalogItemId,
          quantity: clampQuantity(quantity),
          itemCount: nextItems.length,
          pieceCount: nextItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });
    },
    [commitItems, removeItem],
  );

  const clearCart = useCallback(() => {
    const currentItems = itemsRef.current;
    if (currentItems.length > 0) {
      trackStorefrontEvent({
        name: "cart_clear",
        entityType: "project-board",
        entityId: "local-board",
        metadata: {
          itemCount: currentItems.length,
          pieceCount: currentItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });
    }
    commitItems([]);
  }, [commitItems]);

  const updateProjectContext = useCallback(
    (patch: Partial<QuoteProjectContext>) => {
      setProjectContext((current) => ({
        spaceType:
          typeof patch.spaceType === "string"
            ? patch.spaceType.slice(0, 80)
            : current.spaceType,
        targetDate:
          typeof patch.targetDate === "string"
            ? patch.targetDate.slice(0, 20)
            : current.targetDate,
        budgetBand:
          typeof patch.budgetBand === "string"
            ? patch.budgetBand.slice(0, 80)
            : current.budgetBand,
        notes:
          typeof patch.notes === "string"
            ? patch.notes.slice(0, 1_200)
            : current.notes,
      }));
    },
    [],
  );

  const resetProjectContext = useCallback(() => {
    setProjectContext({ ...EMPTY_PROJECT_CONTEXT });
  }, []);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const contextValue = useMemo<QuoteCartContextType>(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      itemCount,
      isLoaded,
      projectContext,
      updateProjectContext,
      resetProjectContext,
    }),
    [
      addItem,
      clearCart,
      isLoaded,
      itemCount,
      items,
      projectContext,
      removeItem,
      resetProjectContext,
      updateProjectContext,
      updateQuantity,
    ],
  );

  return (
    <QuoteCartContext.Provider value={contextValue}>
      {children}
    </QuoteCartContext.Provider>
  );
}

export function useQuoteCart() {
  const context = useContext(QuoteCartContext);
  if (!context) {
    throw new Error("useQuoteCart must be used within a QuoteCartProvider");
  }
  return context;
}
