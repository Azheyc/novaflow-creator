import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  res.set("Cache-Control", "no-store");
  const input = u.contentInsights.contentQuerySchema.parse(req.body);
  res.json(success(await u.contentInsights.queryContent(input)));
});
