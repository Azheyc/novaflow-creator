import { createHash } from "node:crypto";
import { credentials, currentSession, invalidateCredential, novaFlowOrigin } from "./session";

export function managedProviderId(userId: number, scope: string, group: string, protocol: string) {
  return "novaFlow" + createHash("sha256").update(JSON.stringify([userId, scope, group, protocol])).digest("hex").slice(0, 32);
}
export function creatorTextProviders() {
  const session = currentSession();
  if (!session) return [];
  const result = new Map<string, { id: string; label: string; apiUrl: string; apiKey: string; protocol: "openai-completions" | "openai-responses" | "anthropic-messages"; headers: Record<string, string>; models: { id: string; label: string }[] }>();
  for (const model of session.models.filter(item => item.kind === "text")) {
    const protocol = model.supported_endpoint_types.includes("openai") ? "openai-completions" : model.supported_endpoint_types.includes("openai-response") ? "openai-responses" : model.supported_endpoint_types.includes("anthropic") ? "anthropic-messages" : undefined;
    if (!protocol) continue;
    const id = managedProviderId(session.identity.user_id, session.identity.identity_scope, model.group_id, protocol);
    const provider = result.get(id) ?? { id, label: `NovaFlow · ${model.group_name}`, apiUrl: novaFlowOrigin, apiKey: session.access, protocol, headers: { Authorization: `Bearer ${session.access}`, "X-NovaFlow-Group": encodeURIComponent(model.group_id) }, models: [] };
    provider.models.push({ id: model.model_id, label: model.model_id });
    result.set(id, provider);
  }
  return [...result.values()];
}
export async function creatorTextCredential(providerId: string) {
  const before = currentSession();
  if (!before || !creatorTextProviders().some(item => item.id === providerId)) throw new Error("NovaFlow 账号或分组已变更，请重新选择模型");
  const session = await credentials(before.sessionId);
  return session.access;
}

// Capture a device session at the start of each run; refresh tokens without
// allowing an account switch to adopt a running request.
export function creatorFetch(sessionId: string, group: string, upstream = fetch): typeof fetch {
  return Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const session = await credentials(sessionId);
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== novaFlowOrigin) throw new Error("NovaFlow 请求地址无效");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${session.access}`);
    headers.set("X-NovaFlow-Group", encodeURIComponent(group));
    if (headers.has("x-api-key")) headers.set("x-api-key", session.access);
    const response = await upstream(input, { ...init, headers, redirect: "error" });
    if (response.status === 401) invalidateCredential(session.access);
    if (response.ok) return response;
    const text = (await response.text()).replaceAll(session.access, "••••••").replaceAll(session.refresh, "••••••");
    const safeHeaders = new Headers(response.headers);
    safeHeaders.delete("content-length"); safeHeaders.delete("content-encoding");
    return new Response(text, { status: response.status, statusText: response.statusText, headers: safeHeaders });
  }, { preconnect: upstream.preconnect }) as typeof fetch;
}
