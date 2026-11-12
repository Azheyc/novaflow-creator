import { z } from "zod";
import { credentials, currentSession, novaFlowRequest, onCreatorSessionChange } from "@/utils/novaFlow/session";

let cached: { key: string; version: string; expiresAt: number; owner: string } | undefined;
let pending: Promise<string> | undefined;
let generation = 0;
let activeBinding = "";
export function contentOwner() {
  const session = currentSession();
  if (!session) throw Object.assign(new Error("请先登录 NovaFlow"), { status: 401 });
  return `${session.identity.user_id}:${session.identity.identity_scope}`;
}
function binding() { return `${contentOwner()}:${currentSession()!.sessionId}`; }
export function clearContentCredential() { cached = undefined; pending = undefined; generation++; }
onCreatorSessionChange(() => {
  const next = currentSession() ? binding() : "";
  if (activeBinding !== next) { activeBinding = next; clearContentCredential(); }
});
export async function contentCredential() {
  const owner = binding();
  if (activeBinding !== owner) { activeBinding = owner; clearContentCredential(); }
  if (cached?.owner === owner && cached.expiresAt > Date.now()) return cached.key;
  if (pending) return pending;
  const version = generation;
  const job = (async () => {
    const session = await credentials();
    const result = z.object({ key: z.string().min(1).max(4096), version: z.string(), expires_at: z.number() }).parse(
      await novaFlowRequest("/api/novaflow/v1/creator/content/credential", { method: "POST", headers: { Authorization: `Bearer ${session.access}` } }),
    );
    if (generation !== version || binding() !== owner) throw new Error("账号已变更，请重新操作");
    cached = { key: result.key, version: result.version, expiresAt: Math.min(result.expires_at * 1000, Date.now() + 1800000), owner };
    return cached.key;
  })();
  pending = job;
  try { return await job; } finally { if (pending === job) pending = undefined; }
}
