import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import type { ContentItem, Subscription } from "@/utils/contentInsights/types";

const schema = z.object({ action: z.enum(["favorite", "unfavorite", "subscribe", "pause", "refresh", "history", "dismiss"]), id: z.string().min(1).max(1024), own: z.boolean().default(false),
  group: z.string().max(100).default("默认分组"), note: z.string().max(4000).default(""), threshold: z.number().int().min(1).default(1000),
  publishedUrl: z.string().max(4096).default(""), project: z.string().max(4096).default("") });
export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  const input = schema.parse(req.body); const c = u.contentInsights;
  c.contentOwner();
  if (input.action === "history") { res.json(success(c.history(input.id))); return; }
  if (input.action === "refresh") { void c.refreshMonitors(input.id).catch(() => {}); res.json(success({ accepted: true })); return; }
  if (input.action === "unfavorite" || input.action === "dismiss") {
    c.removeRecord(input.action === "unfavorite" ? "favorites" : "alerts", input.id); res.json(success(null)); return;
  }
  if (input.action === "pause") {
    const saved = c.record<Subscription>("subscriptions", input.id);
    if (!saved) throw new Error("监控不存在");
    c.saveRecord("subscriptions", input.id, { ...saved, enabled: !saved.enabled });
    res.json(success(null)); return;
  }
  const item = c.record<ContentItem>("items", input.id);
  if (!item) throw new Error("请先查询并选择真实内容");
  if (input.action === "favorite") {
    c.saveRecord("favorites", input.id, { id: input.id, item, note: input.note, publishedUrl: c.publicUrl(input.publishedUrl), project: input.project, createdAt: Date.now() });
  } else {
    if (item.kind !== "account") throw new Error("请选择账号搜索结果添加监控");
    const previous = c.record<Subscription>("subscriptions", input.id);
    c.saveRecord<Subscription>("subscriptions", input.id, { id: input.id, item, own: input.own, group: input.group, enabled: true, threshold: input.threshold,
      lastRun: previous?.lastRun ?? 0, nextRun: previous?.nextRun ?? 0, error: "", count: previous?.count ?? 0 });
    void c.refreshMonitors(input.id).catch(() => {});
  }
  res.json(success(null));
});
