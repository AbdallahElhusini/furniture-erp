"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  getStorefrontDictionary,
  getStorefrontDirection,
  STOREFRONT_LOCALE_COOKIE,
  STOREFRONT_LOCALE_MAX_AGE,
  type StorefrontDictionary,
  type StorefrontDirection,
  type StorefrontLocale,
} from "@/lib/i18n/storefront";
import { localizedStorefrontPath } from "@/lib/i18n/storefront-paths";

interface StorefrontI18nContextValue {
  locale: StorefrontLocale;
  direction: StorefrontDirection;
  dictionary: StorefrontDictionary;
  dictionaries: Readonly<Record<StorefrontLocale, StorefrontDictionary>>;
  isChangingLocale: boolean;
  setLocale: (locale: StorefrontLocale) => void;
}

const StorefrontI18nContext = createContext<
  StorefrontI18nContextValue | undefined
>(undefined);

interface StorefrontI18nProviderProps {
  initialLocale: StorefrontLocale;
  initialDictionaries?: Readonly<
    Record<StorefrontLocale, StorefrontDictionary>
  >;
  children: ReactNode;
  className?: string;
}

export function StorefrontI18nProvider({
  initialLocale,
  initialDictionaries,
  children,
  className,
}: StorefrontI18nProviderProps) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [isChangingLocale, startLocaleTransition] = useTransition();
  const direction = getStorefrontDirection(locale);
  const dictionaries = useMemo(
    () =>
      initialDictionaries ?? {
        ar: getStorefrontDictionary("ar"),
        en: getStorefrontDictionary("en"),
      },
    [initialDictionaries],
  );

  useEffect(() => {
    const root = document.documentElement;
    const previousLanguage = root.lang;
    const previousDirection = root.dir;

    root.lang = locale;
    root.dir = direction;

    return () => {
      root.lang = previousLanguage;
      root.dir = previousDirection;
    };
  }, [direction, locale]);

  const setLocale = useCallback(
    (nextLocale: StorefrontLocale) => {
      if (nextLocale === locale) return;

      const secureAttribute =
        window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${STOREFRONT_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=${STOREFRONT_LOCALE_MAX_AGE}; SameSite=Lax${secureAttribute}`;
      document.documentElement.lang = nextLocale;
      document.documentElement.dir = getStorefrontDirection(nextLocale);
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const destination = localizedStorefrontPath(nextLocale, currentPath);
      startLocaleTransition(() => {
        setLocaleState(nextLocale);
        window.location.assign(destination);
      });
    },
    [locale],
  );

  const value = useMemo<StorefrontI18nContextValue>(
    () => ({
      locale,
      direction,
      dictionary: dictionaries[locale],
      dictionaries,
      isChangingLocale,
      setLocale,
    }),
    [dictionaries, direction, isChangingLocale, locale, setLocale],
  );

  return (
    <StorefrontI18nContext.Provider value={value}>
      <div
        lang={locale}
        dir={direction}
        data-storefront-locale={locale}
        className={className}
      >
        {children}
      </div>
    </StorefrontI18nContext.Provider>
  );
}

export function useStorefrontI18n(): StorefrontI18nContextValue {
  const context = useContext(StorefrontI18nContext);
  if (!context) {
    throw new Error(
      "useStorefrontI18n must be used within a StorefrontI18nProvider",
    );
  }
  return context;
}
