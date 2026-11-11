import { computed, ref } from "vue";
import http from "@/lib/http";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";

type CreatorModel = { group_id: string; group_name: string; model_id: string; label: string; kind: string; supported_endpoint_types: string[] };
type CreatorStatus = { channel: string; pending: boolean; error: string; account: { user_id: number; display_name: string; identity_scope: string } | null; models: CreatorModel[]; syncedAt: number; accountUrl: string; origin: string };
export const novaFlowState = ref<CreatorStatus>({ channel: "novaflow", pending: false, error: "", account: null, models: [], syncedAt: 0, accountUrl: "https://www.ycnovaflow.vip/dashboard", origin: "https://www.ycnovaflow.vip" });
export const novaFlowEnabled = computed(() => novaFlowState.value.channel === "novaflow");
let timer: ReturnType<typeof setTimeout> | undefined;
let loading: Promise<void> | undefined;
export async function refreshNovaFlowStatus() {
  if (loading) return loading;
  loading = (async () => {
    const next = await http<CreatorStatus>({ method: "GET", url: "/api/channel/creator/status" });
    const changed = next.syncedAt !== novaFlowState.value.syncedAt || next.account?.user_id !== novaFlowState.value.account?.user_id;
    novaFlowState.value = next;
    if (changed) { invalidateNodeModels("language"); invalidateNodeModels("media"); window.dispatchEvent(new CustomEvent("novaFlow:models")); }
  })().finally(() => { loading = undefined; });
  return loading;
}
export function startNovaFlowStatus() {
  if (timer) return;
  const poll = async () => {
    try {
      await refreshNovaFlowStatus();
      if (novaFlowEnabled.value && novaFlowState.value.account && Date.now() - novaFlowState.value.syncedAt >= 300000) {
        await http({ method: "POST", url: "/api/channel/creator/refresh", timeout: 70000 });
        await refreshNovaFlowStatus();
      }
    } catch { /* Account panel reports explicit refresh errors; keep cached identity. */ }
    timer = setTimeout(poll, novaFlowState.value.pending ? 1000 : 15000);
  };
  timer = setTimeout(poll, 0);
}
