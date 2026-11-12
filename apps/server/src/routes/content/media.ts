import { Router } from "express";
import { z } from "zod";
import u from "@/utils";

export default Router().get("/", async (req, res) => {
  u.mcpControl.getAppOrigin(req);
  if (!u.workspace.isLocalHostRequest(req)) throw Object.assign(new Error("媒体仅供本机客户端查看"), { status: 403 });
  const input = z.object({ id: z.string().uuid(), image: z.coerce.number().int().min(0).optional() }).parse(req.query);
  const item = u.contentInsights.record<{ video: string; images: string[]; expiresAt: number }>("previews", input.id);
  const url = input.image === undefined ? item?.video : item?.images[input.image];
  if (!url || !item || item.expiresAt < Date.now()) throw new Error("预览已过期，请重新打开");
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  const upstream = await u.workspaceDownload.streamPublicMedia(url, controller.signal, req.get("range"));
  res.status(upstream.statusCode ?? 200);
  const mime = upstream.headers["content-type"]?.split(";")[0];
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": mime && /^(video\/(mp4|webm)|image\/(jpeg|png|webp|gif))$/.test(mime) ? mime : input.image === undefined ? "video/mp4" : "image/jpeg" });
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers[name]; if (typeof value === "string") res.set(name, value);
  }
  upstream.on("error", () => res.destroy());
  upstream.pipe(res);
});
