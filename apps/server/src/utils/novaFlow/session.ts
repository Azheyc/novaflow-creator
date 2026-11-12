import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { hostname } from "node:os";
import { z } from "zod";
import conf from "@/utils/conf";

export const novaFlowOrigin = "https://www.ycnovaflow.vip";
export const novaFlowEnabled = () => (process.env.TOONFLOW_CHANNEL?.trim() || "novaflow") === "novaflow";
const tokenSchema = z.object({ access_token: z.string().regex(/^nfds_[\w-]{43}$/), refresh_token: z.string().regex(/^nfdr_[\w-]{43}$/), expires_in: z.number().positive(), session_id: z.string().min(1) });
const identitySchema = z.object({ user_id: z.number().int().positive(), display_name: z.string(), identity_scope: z.string().min(1) });
export const creatorModelSchema = z.object({ group_id: z.string().min(1), group_name: z.string(), model_id: z.string().min(1), label: z.string(), kind: z.enum(["text", "image", "video"]), supported_endpoint_types: z.array(z.string()) });
export type CreatorModel = z.infer<typeof creatorModelSchema>;
const sessionSchema = z.object({ access: z.string(), refresh: z.string(), expiresAt: z.number(), sessionId: z.string(), identity: identitySchema, models: z.array(creatorModelSchema), syncedAt: z.number() });
type CreatorSession = z.infer<typeof sessionSchema>;
let epoch = 0;
let refreshing: Promise<CreatorSession> | undefined;
let syncing: Promise<void> | undefined;
let pending: { server: Server; timer: ReturnType<typeof setTimeout>; state: string; verifier: string; redirect: string; epoch: number; busy: boolean } | undefined;
let authorizationError = "";
let syncError = "";
const sessionListeners = new Set<() => void>();
export function onCreatorSessionChange(listener: () => void) { sessionListeners.add(listener); return () => sessionListeners.delete(listener); }
function notifySessionChange() { for (const listener of sessionListeners) listener(); }

export function currentSession() {
  if (!novaFlowEnabled()) return undefined;
  const result = sessionSchema.safeParse(conf.get("novaFlowCreator"));
  return result.success ? result.data : undefined;
}
function saveSession(value: CreatorSession) { conf.set("novaFlowCreator", value); notifySessionChange(); }
export function invalidateCredential(rejected: string) {
  const session = currentSession();
  // An old in-flight response must not discard a newer login or rotated token.
  if (!session || rejected !== session.access && rejected !== session.refresh) return;
  conf.delete("novaFlowCreator");
  notifySessionChange();
  syncError = "NovaFlow 登录已失效，请重新登录";
}
export async function novaFlowRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(novaFlowOrigin + path, { ...init, redirect: "error", signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  if (response.status === 401) {
    const authorization = new Headers(init.headers).get("Authorization");
    if (authorization?.startsWith("Bearer ")) invalidateCredential(authorization.slice(7));
    throw Object.assign(new Error("NovaFlow 登录已失效，请重新登录"), { status: 401 });
  }
  const result = await response.json() as { code?: number; data?: unknown };
  if (!response.ok || result.code !== 0) throw Object.assign(new Error(response.status === 401 ? "NovaFlow 登录已失效，请重新登录" : `NovaFlow 请求失败（HTTP ${response.status}）`), { status: response.status });
  return result.data;
}
function post(path: string, body: unknown) { return novaFlowRequest(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

export async function credentials(expectedSessionId?: string) {
  let session = currentSession();
  if (!session || expectedSessionId && session.sessionId !== expectedSessionId) throw Object.assign(new Error("NovaFlow 账号已变更，请重新选择模型"), { status: 401 });
  if (session.expiresAt > Date.now() + 60000) return session;
  if (!refreshing) {
    const original = session;
    const version = epoch;
    refreshing = (async () => {
      const pair = tokenSchema.parse(await post("/api/novaflow/v1/desktop/auth/refresh", { refresh_token: original.refresh }));
      if (version !== epoch || currentSession()?.sessionId !== original.sessionId) throw new Error("NovaFlow 账号已变更");
      const next = { ...original, access: pair.access_token, refresh: pair.refresh_token, expiresAt: Date.now() + pair.expires_in * 1000 };
      saveSession(next);
      return next;
    })().catch((error: unknown) => {
      if (error instanceof Error && "status" in error && error.status === 401) invalidateCredential(original.refresh);
      throw error;
    }).finally(() => { refreshing = undefined; });
  }
  session = await refreshing;
  if (expectedSessionId && session.sessionId !== expectedSessionId) throw new Error("NovaFlow 账号已变更");
  return session;
}

export async function syncModels() {
  if (syncing) return syncing;
  syncing = (async () => {
    const version = epoch;
    const session = await credentials();
    const headers = { Authorization: `Bearer ${session.access}` };
    const identity = identitySchema.parse(await novaFlowRequest("/api/novaflow/v1/creator/bootstrap", { headers }));
    const result = z.object({ items: z.array(creatorModelSchema) }).parse(await novaFlowRequest("/api/novaflow/v1/creator/models", { headers }));
    if (version !== epoch || currentSession()?.sessionId !== session.sessionId) return;
    saveSession({ ...currentSession()!, identity, models: result.items, syncedAt: Date.now() });
    syncError = "";
  })().catch((error: unknown) => { syncError = error instanceof Error ? error.message : "模型同步失败"; throw error; }).finally(() => { syncing = undefined; });
  return syncing;
}

export function status() {
  const session = currentSession();
  return { channel: novaFlowEnabled() ? "novaflow" : "toonflow", pending: !!pending, error: authorizationError || syncError, account: session?.identity ?? null, models: session?.models ?? [], syncedAt: session?.syncedAt ?? 0, accountUrl: novaFlowOrigin + "/dashboard", origin: novaFlowOrigin };
}
export function cancelAuthorization() {
  const value = pending;
  pending = undefined;
  if (value) { clearTimeout(value.timer); value.server.close(); value.server.closeAllConnections(); }
}
export async function startAuthorization() {
  if (!novaFlowEnabled()) throw new Error("NovaFlow 渠道未启用");
  cancelAuthorization();
  authorizationError = "";
  const version = epoch;
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    const attempt = pending;
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const returnedState = url.searchParams.get("state") ?? "";
    const validState = Buffer.byteLength(returnedState) === Buffer.byteLength(state) && timingSafeEqual(Buffer.from(returnedState), Buffer.from(state));
    if (request.method !== "GET" || url.pathname !== "/novaflow/callback" || !attempt || attempt.server !== server || attempt.busy || !validState || url.searchParams.get("iss") !== novaFlowOrigin || !/^nfdc_[\w-]{43}$/.test(url.searchParams.get("code") ?? "")) { response.writeHead(400).end("授权请求无效，请返回客户端重试"); return; }
    attempt.busy = true;
    try {
      const pair = tokenSchema.parse(await post("/api/novaflow/v1/desktop/auth/exchange", { code: url.searchParams.get("code"), code_verifier: verifier, redirect_uri: attempt.redirect }));
      const identity = identitySchema.parse(await novaFlowRequest("/api/novaflow/v1/creator/bootstrap", { headers: { Authorization: `Bearer ${pair.access_token}` } }));
      if (version !== epoch || pending !== attempt) {
        await novaFlowRequest("/api/novaflow/v1/desktop/auth/revoke", { method: "POST", headers: { Authorization: `Bearer ${pair.refresh_token}` } }).catch(() => {});
        throw new Error("授权已取消");
      }
      const previous = currentSession();
      ++epoch;
      saveSession({ access: pair.access_token, refresh: pair.refresh_token, sessionId: pair.session_id, expiresAt: Date.now() + pair.expires_in * 1000, identity, models: [], syncedAt: 0 });
      if (previous) void revoke(previous).catch(() => {});
      await syncModels().catch(() => {});
      response.end("登录成功，请返回 NovaFlow 创作客户端");
    } catch (error) {
      authorizationError = error instanceof Error ? error.message : "NovaFlow 登录失败";
      response.writeHead(400).end(authorizationError);
    } finally {
      if (pending === attempt) { clearTimeout(attempt.timer); pending = undefined; server.close(); }
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("无法创建本机授权回调"); }
  const redirect = `http://127.0.0.1:${address.port}/novaflow/callback`;
  const timer = setTimeout(() => { if (pending?.server === server) { authorizationError = "授权已超时，请重新登录"; cancelAuthorization(); } }, 600000);
  timer.unref();
  pending = { server, timer, state, verifier, redirect, epoch: version, busy: false };
  try {
    const result = z.object({ authorize_url: z.string().url() }).parse(await post("/api/novaflow/v1/desktop/auth/start", { client_id: "novaflow-creator", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state, redirect_uri: redirect, device_name: `NovaFlow 创作客户端 ${hostname()}`.slice(0, 80) }));
    const target = new URL(result.authorize_url);
    if (target.origin !== novaFlowOrigin || target.pathname !== "/desktop/authorize") throw new Error("NovaFlow 授权地址无效");
    return { authorizeUrl: target.href };
  } catch (error) { if (pending?.server === server) cancelAuthorization(); throw error; }
}
function revoke(session: CreatorSession) { return novaFlowRequest("/api/novaflow/v1/desktop/auth/revoke", { method: "POST", headers: { Authorization: `Bearer ${session.refresh}` } }); }
export async function logout() {
  ++epoch;
  cancelAuthorization();
  const session = currentSession();
  conf.delete("novaFlowCreator");
  notifySessionChange();
  authorizationError = ""; syncError = "";
  if (session) await revoke(session).catch(() => { throw new Error("已退出本机账号，远端设备撤销失败，请在 NovaFlow 账户中撤销此设备"); });
}
