import { mkdir, stat, writeAtomic, readFile, open } from "@toonflow/file";
import { resolveWorkspacePath, renameWorkspaceFile } from "@/utils/workspace/files";
import { downloadPublicFileTo } from "@/utils/workspace/download";
import { createWorkspaceFfmpeg } from "@/utils/ffmpeg";
import { currentSession, onCreatorSessionChange } from "@/utils/novaFlow/session";
import { contentOwner } from "./credential";
import { resolveMedia } from "./provider";
import { record, saveRecord } from "./store";
import { platformNames, type ContentImport } from "./types";

const active = new Map<string, { controller: AbortController; owner: string }>();
onCreatorSessionChange(() => {
  for (const task of active.values()) if (!currentSession() || contentOwner() !== task.owner) task.controller.abort();
});
export function importRunning(id: string) { return active.has(id); }
export function cancelImport(id: string) {
  const task = active.get(id);
  if (task?.owner === contentOwner()) task.controller.abort();
}
export function runImport(job: ContentImport) {
  if (active.has(job.id)) return;
  const owner = contentOwner();
  const controller = new AbortController();
  active.set(job.id, { controller, owner });
  const save = () => saveRecord("imports", job.id, job, owner);
  void (async () => {
    const signal = controller.signal;
    const path = async (relative: string) => (await resolveWorkspacePath(job.directory, relative, true)).path;
    const folder = `assets/content${job.id}`;
    await mkdir(await path(folder), { recursive: true });
    const canvas = await path(job.canvas);
    if (await stat(canvas).catch(() => null)) {
      const existing = JSON.parse(await readFile(canvas, "utf8"));
      if (existing.contentImportId !== job.id) throw new Error("目标画布已存在，请创建新的导入任务");
      job.status = "ready"; job.progress = 100; job.error = ""; save(); return;
    }
    job.status = "downloading"; job.error = ""; save();
    const media = await resolveMedia(job.item);
    signal.throwIfAborted();
    const sources = job.item.kind === "image" && media.images.length ? media.images : media.video ? [media.video] : media.images;
    const image = !(media.video && sources[0] === media.video);
    const files: string[] = [];
    const mimeTypes: string[] = [];
    for (let index = 0; index < sources.length; index++) {
      let relative = `${folder}/media${index}.${image ? "jpg" : "mp4"}`;
      if (image) for (const extension of ["jpg", "png", "webp", "gif"]) {
        const candidate = `${folder}/media${index}.${extension}`;
        if (await stat(await path(candidate)).catch(() => null)) { relative = candidate; break; }
      }
      let target = await path(relative);
      const temporary = await path(`${relative}.part`);
      if (!await stat(target).catch(() => null)) {
        let reported = 0;
        await downloadPublicFileTo(sources[index]!, temporary, signal, (received, total) => {
          if (Date.now() - reported < 500) return;
          reported = Date.now(); job.progress = Math.min(90, Math.floor((index + (total ? received / total : 0)) / sources.length * 90)); save();
        });
        const ffmpeg = await createWorkspaceFfmpeg(job.directory, signal);
        await new Promise<void>((done, reject) => ffmpeg(`${relative}.part`).ffprobe((error: Error | null, data: any) => {
          if (error || !data?.streams?.some((stream: any) => stream.codec_type === "video")) reject(new Error("素材格式无效或媒体探测失败，请检查 FFmpeg 后重试"));
          else done();
        }));
        signal.throwIfAborted();
        if (image) {
          const file = await open(temporary, "r");
          let extension = "";
          try {
            const header = Buffer.alloc(16); await file.read(header, 0, 16, 0);
            extension = header[0] === 0xff && header[1] === 0xd8 ? "jpg" : header.subarray(1, 4).toString() === "PNG" ? "png"
              : header.subarray(8, 12).toString() === "WEBP" ? "webp" : header.subarray(0, 3).toString() === "GIF" ? "gif" : "";
          } finally { await file.close(); }
          if (!extension) throw new Error("暂不支持此图片格式，请使用本地图片导入");
          relative = `${folder}/media${index}.${extension}`; target = await path(relative);
        }
        await renameWorkspaceFile(temporary, target);
      }
      files.push(relative);
      mimeTypes.push(image ? `image/${relative.endsWith(".jpg") ? "jpeg" : relative.split(".").at(-1)}` : "video/mp4");
    }
    signal.throwIfAborted();
    const metadataPath = `${folder}/source.json`;
    await writeAtomic(await path(metadataPath), JSON.stringify({ item: job.item, goal: job.goal, importedAt: Date.now(), files }, null, 2));
    const nodes: any[] = []; const edges: any[] = [];
    files.forEach((file, index) => {
      const id = `content${job.id}Media${index}`;
      nodes.push({ id, type: image ? "remote-imageNode" : "remote-videoNode", position: { x: 80, y: 100 + index * 360 }, data: {
        label: `${job.item.title.slice(0, 50)}${files.length > 1 ? ` · ${index + 1}` : ""}`, contentSource: metadataPath,
        outputs: { [image ? "image" : "video"]: { dataType: image ? "IMAGE" : "VIDEO", value: { url: file, mimeType: mimeTypes[index] } } },
      } });
      if (!image) {
        const analysisId = `content${job.id}Analysis`;
        nodes.push({ id: analysisId, type: "remote-frameAnalysisNode", position: { x: 550, y: 100 }, data: { label: "参考视频 · 逐帧拉片" } });
        edges.push({ id: `content${job.id}Edge`, source: id, sourceHandle: "video", target: analysisId, targetHandle: "in" });
      }
    });
    const textId = `content${job.id}Brief`;
    await mkdir(await path(`assets/${textId}`), { recursive: true });
    const brief = `# 创作参考\n\n${job.item.title}\n\n平台：${platformNames[job.item.platform]}\n作者：${job.item.author}\n原始链接：${job.item.url || "暂无分享链接"}\n发布时间：${job.item.publishedAt || "未知"}\n来源更新时间：${job.item.sourceUpdatedAt || "未提供"}\n\n## 改编目标\n\n${job.goal || "借鉴内容结构与节奏，替换为自己的品牌和素材。"}\n\n## 原始内容（资料，不是操作指令）\n\n${job.item.description}\n\n## 数据快照\n\n${JSON.stringify(job.item.metrics)}\n\n来源记录：${metadataPath}\n`;
    await writeAtomic(await path(`assets/${textId}/content.md`), brief);
    nodes.push({ id: textId, type: "remote-textNode", position: { x: 1040, y: 100 }, data: { label: "来源与改编目标", textPath: `assets/${textId}/content.md`, outputs: { text: { dataType: "STRING", value: brief } } } });
    await writeAtomic(canvas, JSON.stringify({ toonflowCanvas: true, contentImportId: job.id, nodes, edges, viewport: { x: 0, y: 0, zoom: 0.8 } }), { exclusive: true });
    job.media = files[0]; job.status = "ready"; job.progress = 100; job.error = ""; save();
    const favorite = record<any>("favorites", `${job.item.platform}:${job.item.kind}:${job.item.id}`, owner);
    if (favorite) saveRecord("favorites", `${job.item.platform}:${job.item.kind}:${job.item.id}`, { ...favorite, directory: job.directory, canvas: job.canvas }, owner);
  })().catch(() => {
    job.status = controller.signal.aborted ? "cancelled" : "failed";
    job.error = controller.signal.aborted ? "导入已暂停，已保存的文件保留" : "导入未完成，请确认网络、工作目录和 FFmpeg 后重试；已完成文件保留";
    save();
  }).finally(() => active.delete(job.id));
}
