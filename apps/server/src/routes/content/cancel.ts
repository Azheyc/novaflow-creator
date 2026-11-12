import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
export default Router().post("/", (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  const { id } = z.object({ id: z.string().uuid() }).parse(req.body);
  u.contentInsights.cancelImport(id);
  res.json(success(null));
});
