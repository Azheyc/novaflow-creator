import { history, record, records, itemKey } from "./store";
import type { ContentItem, Subscription } from "./types";

export function accountAnalysis(id?: string) {
  const subscriptions = records<Subscription>("subscriptions").filter(sub => !id || sub.id === id);
  return subscriptions.map(sub => {
    const keys = record<string[]>("monitorWorks", sub.id) ?? [];
    const works = keys.map(key => record<ContentItem>("items", key)).filter((item): item is ContentItem => !!item).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const likes = works.map(item => item.metrics.likes).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
    const timeline = history(itemKey(sub.item));
    const first = timeline[0]; const last = timeline.at(-1);
    const followerChange = timeline.length >= 2 && first?.item.metrics.followers !== undefined && last?.item.metrics.followers !== undefined ? last.item.metrics.followers - first.item.metrics.followers : null;
    return { id: sub.id, title: sub.item.title, platform: sub.item.platform, group: sub.group, own: sub.own, sampleCount: works.length,
      medianLikes: likes.length ? likes.length % 2 ? likes[Math.floor(likes.length / 2)] : (likes[likes.length / 2 - 1]! + likes[likes.length / 2]!) / 2 : null,
      followerChange, observedFrom: first?.observedAt ?? null, observedTo: last?.observedAt ?? null,
      followers: sub.item.metrics.followers ?? null, recentWorks: works.slice(0, 30),
      scope: "仅基于本机已收录样本与有效快照，非全量账号统计；不同平台不可直接比较播放与热度口径" };
  });
}
