import { currentSession } from "@/utils/novaFlow/session";
import { contentOwner } from "./credential";
import { contentQuerySchema, type Subscription } from "./types";
import { records, saveRecord, history, itemKey, record } from "./store";
import { queryContent } from "./provider";

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
export async function refreshMonitors(id?: string) {
  if (running || !currentSession()) return;
  running = true;
  try {
    const owner = contentOwner();
    const entries = records<Subscription>("subscriptions", owner).filter(value => value.enabled && (id ? value.id === id : value.nextRun <= Date.now()));
    for (const subscription of entries) {
      if (!currentSession() || contentOwner() !== owner) break;
      const { item } = subscription;
      try {
        const query = contentQuerySchema.parse({ platform: item.platform, operation: "accountWorks", id: item.lookupId || item.id, keyword: item.title });
        const before = record<string[]>("monitorWorks", subscription.id, owner) ?? [];
        const page = await queryContent(query, true);
        if (contentOwner() !== owner) break;
        let newCount = 0;
        for (const work of page.items) {
          const key = itemKey(work);
          if (subscription.lastRun && !before.includes(key)) newCount++;
          const snapshots = history(key, owner);
          const previous = snapshots.at(-2)?.item.metrics.likes;
          const likes = work.metrics.likes;
          if (previous !== undefined && likes !== undefined && likes - previous >= subscription.threshold && snapshots.at(-1)!.observedAt > subscription.lastRun) {
            saveRecord("alerts", `${subscription.id}:${key}:${snapshots.at(-1)!.observedAt}`, { id: key, title: `${work.title.slice(0, 60)} · 点赞增加 ${likes - previous}`, item: work, createdAt: Date.now() }, owner);
          }
        }
        if (newCount) saveRecord("alerts", `${subscription.id}:${Date.now()}`, { id: subscription.id, title: `${item.title} 新收录 ${newCount} 条作品`, createdAt: Date.now() }, owner);
        saveRecord("monitorWorks", subscription.id, [...new Set([...before, ...page.items.map(itemKey)])], owner);
        // 视频号作品接口按昵称查询，无法保证账号唯一性；界面明确标注，不伪造粉丝指标。
        if (item.platform !== "channels") {
          const profile = await queryContent(contentQuerySchema.parse({ platform: item.platform, operation: "account", id: item.lookupId || item.id }), true);
          if (profile.items[0]) subscription.item = { ...profile.items[0], id: item.id, lookupId: item.lookupId };
        }
        if (contentOwner() !== owner) break;
        const latest = record<Subscription>("subscriptions", subscription.id, owner);
        if (latest) saveRecord("subscriptions", subscription.id, { ...latest, item: subscription.item, lastRun: Date.now(), nextRun: Date.now() + 86400000, error: "", count: page.items.length }, owner);
      } catch {
        const latest = record<Subscription>("subscriptions", subscription.id, owner);
        if (latest) saveRecord("subscriptions", subscription.id, { ...latest, nextRun: Date.now() + 3600000, error: "本次采集未完成，已保留历史数据；联网后可手动刷新" }, owner);
      }
    }
  } finally { running = false; }
}
export function startContentMonitoring() {
  if (timer) return;
  timer = setInterval(() => { void refreshMonitors().catch(() => {}); }, 60000);
  timer.unref();
}
