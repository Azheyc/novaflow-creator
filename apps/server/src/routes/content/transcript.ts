import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  const input = z.object({ id: z.string().max(1024), action: z.enum(["submit", "status"]) }).parse(req.body);
  res.json(success(await u.contentInsights.transcript(input.id, input.action)));
});
