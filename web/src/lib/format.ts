import { i18n } from "@lingui/core";

const currencyFormatters = {
  "pt-BR": new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  en: new Intl.NumberFormat("en", { style: "currency", currency: "BRL" }),
} as const;

const integerFormatters = {
  "pt-BR": new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat("en", { maximumFractionDigits: 0 }),
} as const;

function activeLocale(): "pt-BR" | "en" {
  return i18n.locale === "en" ? "en" : "pt-BR";
}

export function formatCurrency(value: number): string {
  return currencyFormatters[activeLocale()].format(value);
}

export function formatInteger(value: number): string {
  return integerFormatters[activeLocale()].format(value);
}
