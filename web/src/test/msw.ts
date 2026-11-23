import { http, passthrough } from "msw";
import { setupWorker } from "msw/browser";

/**
 * The MSW worker every browser test talks to instead of the API. Add the handlers a test needs with
 * `worker.use(...)`, using the generated ones in `@/lib/api/gen/msw`; a request nobody handles fails the test.
 *
 * Default handlers (kept across tests, overridable with `worker.use`): Vite serves the lazily loaded locale catalogs
 * itself (a test that switches language loads one). Add here the app-wide responses every test assumes.
 */
export const worker = setupWorker(http.get("/src/locales/*", () => passthrough()));
