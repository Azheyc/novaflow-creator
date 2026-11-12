import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import type { ContentItem } from "@/utils/contentInsights/types";
export default Router().post("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("内容洞察仅供本机客户端使用"), { status: 403 });
  const { id } = z.object({ id: z.string().max(1024) }).parse(req.body);
  const item = u.contentInsights.record<ContentItem>("items", id);
  if (!item) throw new Error("请先选择作品");
  const media = await u.contentInsights.resolveMedia(item);
  const mediaId = crypto.randomUUID();
  u.contentInsights.saveRecord("previews", mediaId, { ...media, expiresAt: Date.now() + 600000 });
  res.json(success({ video: media.video ? `/api/content/media?id=${mediaId}` : "", images: media.images.map((_, index) => `/api/content/media?id=${mediaId}&image=${index}`), title: media.title }));
});
