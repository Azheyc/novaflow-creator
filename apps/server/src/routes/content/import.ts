import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import type { ContentItem, ContentImport } from "@/utils/contentInsights/types";

const schema = z.object({ id: z.string().min(1).max(1024), directory: z.string().min(1).max(4096), mode: z.enum(["import", "remix"]), goal: z.string().max(4000).default(""), requestId: z.string().uuid() });
export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  const input = schema.parse(req.body); const c = u.contentInsights;
  const directory = await u.workspace.resolveWorkspace(req, input.directory);
  const previous = c.record<ContentImport>("imports", input.requestId);
  if (previous) {
    if (previous.directory !== directory) throw new Error("导入任务所属项目不一致");
    if (previous.status !== "ready") c.runImport(previous);
    res.json(success(previous)); return;
  }
  const item = c.record<ContentItem>("items", input.id);
  if (!item || !["video", "image"].includes(item.kind)) throw new Error("请选择作品后导入");
  const job: ContentImport = { id: input.requestId, item, directory, canvas: `参考画布${input.requestId.slice(0, 8)}.json`, mode: input.mode, goal: input.goal, status: "pending", progress: 0, error: "", createdAt: Date.now() };
  c.saveRecord("imports", job.id, job); c.runImport(job);
  res.json(success(job));
});
