import { contentPost, text } from "./provider";
import { contentOwner } from "./credential";
import { record, records, saveRecord, itemKey } from "./store";
import type { ContentItem, ContentImport } from "./types";
import { writeAtomic } from "@toonflow/file";
import { resolveWorkspacePath } from "@/utils/workspace/files";

type Transcript = { status: "submitting" | "processing" | "succeeded" | "failed" | "unknown"; taskId?: string; text?: string; segments?: { text: string; start: number | null; end: number | null }[]; timestampUnit: "seconds" | "unverified"; schemaVersion?: number; error?: string };
const pending = new Map<string, Promise<Transcript>>();
export async function transcript(id: string, action: "submit" | "status") {
  const owner = contentOwner(); const key = `${owner}:${id}`;
  if (pending.has(key)) return pending.get(key)!;
  const item = record<ContentItem>("items", id, owner);
  if (!item || !item.url || item.kind !== "video") throw new Error("请先查询具有分享链接的视频");
  const saved = record<Transcript>("transcripts", id, owner);
  if (saved?.status === "succeeded" && saved.schemaVersion === 2) return saved;
  if ((saved?.status === "submitting" || saved?.status === "unknown") && !saved.taskId) return { ...saved, status: "unknown", error: "提交结果未知，为避免重复任务未自动重发" };
  if (!saved?.taskId && action === "status") return saved ?? { status: "failed", error: "尚未提交文案提取" };
  const job = (async (): Promise<Transcript> => {
    const root = item.platform === "bilibili" ? "/parseWork/bilibiliSubtitle" : item.platform === "channels" ? "/parseWork/sphSubtitle" : "/parseWork/audioTextExtract";
    const suffix = item.platform === "douyin" ? "/douyin" : item.platform === "xiaohongshu" ? "/xhs" : "";
    if (!saved?.taskId) {
      saveRecord("transcripts", id, { status: "submitting", timestampUnit: "unverified" }, owner);
      try {
        const raw = await contentPost(`${root}/submit${suffix}`, { url: item.url });
        const taskId = text(raw?.taskId);
        if (!taskId) throw new Error("未取得任务标识");
        return saveRecord<Transcript>("transcripts", id, { status: "processing", taskId, timestampUnit: "unverified" }, owner);
      } catch {
        return saveRecord<Transcript>("transcripts", id, { status: "unknown", timestampUnit: "unverified", error: "任务提交结果未知，请稍后核实，不自动重发" }, owner);
      }
    }
    const raw = await contentPost(`${root}/result${suffix}`, { taskId: saved.taskId });
    const content = text(raw?.text || raw?.content);
    const status = raw?.status === "failed" ? "failed" : raw?.status === "succeeded" || content ? "succeeded" : "processing";
    // B站字幕端点已用实际媒体时长核对毫秒时间轴；其余平台保留未核验标记，不猜单位。
    const verifiedTime = item.platform === "bilibili";
    const segments = Array.isArray(raw?.stampSents) ? raw.stampSents.slice(0, 2000).map((r: any) => ({ text: text(r.textSeg || r.text || r.sentence),
      start: typeof r.start === "number" ? r.start / (verifiedTime ? 1000 : 1) : null, end: typeof r.end === "number" ? r.end / (verifiedTime ? 1000 : 1) : null })) : [];
    const result = saveRecord<Transcript>("transcripts", id, { status, taskId: saved.taskId, text: content, segments, timestampUnit: verifiedTime ? "seconds" : "unverified", schemaVersion: 2, error: status === "failed" ? "文案提取失败" : undefined }, owner);
    if (status === "succeeded") for (const job of records<ContentImport>("imports", owner)) {
      if (job.status !== "ready" || itemKey(job.item) !== id) continue;
      const path = await resolveWorkspacePath(job.directory, `assets/content${job.id}/transcript.json`);
      await writeAtomic(path.path, JSON.stringify(result, null, 2));
    }
    return result;
  })();
  pending.set(key, job);
  try { return await job; } finally { pending.delete(key); }
}
