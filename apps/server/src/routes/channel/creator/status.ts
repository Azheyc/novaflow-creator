import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { status } from "@/utils/novaFlow/session";

export default Router().get("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) throw Object.assign(new Error("仅允许本机访问 NovaFlow 账号"), { status: 403 });
  if (u.multiTenant.isEnabled()) throw Object.assign(new Error("此入口仅用于本地创作客户端"), { status: 403 });
  res.set("Cache-Control", "no-store").json(success(status() ?? null));
});
