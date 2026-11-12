import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import type { ContentImport, Subscription } from "@/utils/contentInsights/types";

export default Router().get("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  u.contentInsights.contentOwner();
  res.set("Cache-Control", "no-store");
  res.json(success({
    subscriptions: u.contentInsights.records<Subscription>("subscriptions"), favorites: u.contentInsights.records("favorites"),
    imports: u.contentInsights.records<ContentImport>("imports").map(job => ({ ...job, status: ["pending", "downloading"].includes(job.status) && !u.contentInsights.importRunning(job.id) ? "failed" : job.status })),
    alerts: u.contentInsights.records("alerts").slice(0, 100), capabilities: u.contentInsights.platformCapabilities,
    analytics: u.contentInsights.accountAnalysis(),
  }));
});
