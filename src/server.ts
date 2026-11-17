import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { routeRequest, type HostDecision } from "./lib/hosts";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/** Official domains cannot be framed; preview hosts stay embeddable by the Lovable editor. */
export function securityHeaders(url: URL, headers: Headers) {
  const official = /(^|\.)notemfiscal\.com\.br$/.test(url.hostname);
  const ancestors = official ? "'none'" : "'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app";
  headers.set("Content-Security-Policy", `base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors ${ancestors}`);
  if (official) headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return headers;
}

function withSecurityHeaders(request: Request, response: Response): Response {
  try {
    const headers = securityHeaders(new URL(request.url), new Headers(response.headers));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

/** The partner API is server-to-server: preflight gets an explicit answer without CORS permissions. */
function apiPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS" || !new URL(request.url).pathname.startsWith("/api/")) return null;
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, PATCH, PUT, DELETE", "Cache-Control": "no-store" } });
}

/** app.notemfiscal.com.br only: keep the panel and the API out of search engines (headers otherwise unchanged). */
function withNoindex(response: Response, decision: HostDecision): Response {
  if (decision.kind !== "app" || !decision.noindex) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Host-level answers that never reach the app: redirects between domains and per-domain robots.txt. */
export function hostResponse(request: Request, decision: HostDecision): Response | null {
  if (decision.kind === "redirect") return withSecurityHeaders(request, new Response(null, { status: 301, headers: { Location: decision.location, "Cache-Control": "public, max-age=3600" } }));
  if (decision.kind === "robots") return withSecurityHeaders(request, new Response(decision.body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } }));
  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const decision = routeRequest(new URL(request.url));
      const early = hostResponse(request, decision);
      if (early) return early;
      if (decision.kind === "docs") {
        // The documentation is plain HTML built from docs/api: it never loads the panel, its session or the database.
        const { serveDocs } = await import("./docs-site/handler.server");
        return serveDocs(request, decision);
      }
      const preflight = apiPreflight(request);
      if (preflight) return withNoindex(withSecurityHeaders(request, preflight), decision);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withNoindex(withSecurityHeaders(request, await normalizeCatastrophicSsrResponse(response)), decision);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(request, new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
    }
  },
};
