import { i18n, type Messages } from "@lingui/core";

export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";

const loaders: Record<Locale, () => Promise<{ messages: Messages }>> = {
  "pt-BR": () => import("../../locales/pt-BR/messages.po"),
  en: () => import("../../locales/en/messages.po"),
};

export async function activateLocale(locale: Locale): Promise<void> {
  const { messages } = await loaders[locale]();
  i18n.load(locale, messages);
  i18n.activate(locale);
}
