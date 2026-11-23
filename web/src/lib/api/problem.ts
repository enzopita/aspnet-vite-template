import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { isResponseError } from "./gen/.kubb/client";

/**
 * Messages for the problem `code`s one screen expects (ADR 0004), keyed by code. Each feature owns its map and
 * passes it to {@link problemMessage}; codes it doesn't list fall back to a generic message by HTTP status.
 */
export type ProblemMessages = Readonly<Partial<Record<string, MessageDescriptor>>>;

const generic = {
  network: msg`Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.`,
  validation: msg`Alguns dados não foram aceitos. Revise e tente novamente.`,
  unauthorized: msg`Sua sessão terminou. Entre novamente para continuar.`,
  forbidden: msg`Você não tem permissão para fazer isso.`,
  notFound: msg`Não encontramos o que você procurava.`,
  conflict: msg`Estes dados mudaram enquanto você editava. Recarregue e tente novamente.`,
  server: msg`Algo deu errado do nosso lado. Tente novamente em instantes.`,
  unexpected: msg`Algo deu errado. Tente novamente.`,
} as const;

/** HTTP status of a failed API call, or `undefined` when the request never got a response. */
export function problemStatus(error: unknown): number | undefined {
  return isResponseError(error) ? error.status : undefined;
}

/** The stable `code` of an RFC 9457 problem response, or `undefined` when there is none. */
export function problemCode(error: unknown): string | undefined {
  if (!isResponseError(error)) return undefined;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return undefined;
  return typeof data.code === "string" ? data.code : undefined;
}

/** What to tell the person about a failed request: the screen's message for its code, else a generic one. */
export function problemMessage(error: unknown, messages: ProblemMessages = {}): MessageDescriptor {
  const code = problemCode(error);
  const specific = code === undefined ? undefined : messages[code];
  if (specific) return specific;

  const status = problemStatus(error);
  if (status === undefined) return generic.network;
  if (status === 400) return generic.validation;
  if (status === 401) return generic.unauthorized;
  if (status === 403) return generic.forbidden;
  if (status === 404) return generic.notFound;
  if (status === 409) return generic.conflict;
  if (status >= 500) return generic.server;
  return generic.unexpected;
}
