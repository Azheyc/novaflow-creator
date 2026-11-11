import { creatorFetch, managedProviderId } from "./providers";
import { credentials, currentSession, novaFlowOrigin } from "./session";

function imageOptions(model: string) {
  const gpt2 = /^gpt-image-2/i.test(model);
  const gpt = /^gpt-image/i.test(model);
  const dalle3 = /^dall-e-3$/i.test(model);
  if (!gpt && !/^dall-e/i.test(model)) return undefined;
  const imageSizes = gpt2 ? ["1K", "2K", "4K"] : ["1K"];
  const imageRatios = gpt2 ? ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
    : gpt || dalle3 ? ["1:1", "3:2", "2:3"] : ["1:1"];
  const dimensions: Record<string, string> = {};
  for (const size of imageSizes) for (const ratio of imageRatios) {
    const [width, height] = ratio.split(":").map(Number) as [number, number];
    const edge = Number.parseInt(size) * 1024;
    dimensions[`${size}:${ratio}`] = gpt2
      ? `${Math.round(edge * width / Math.max(width, height) / 16) * 16}x${Math.round(edge * height / Math.max(width, height) / 16) * 16}`
      : ratio === "1:1" ? "1024x1024" : ratio === "3:2" ? `${dalle3 ? 1792 : 1536}x1024` : `1024x${dalle3 ? 1792 : 1536}`;
  }
  return { imageSizes, imageRatios, dimensions };
}

export function creatorMediaSources() {
  const session = currentSession();
  if (!session) return [];
  const groups = new Map<string, typeof session.models>();
  for (const model of session.models.filter(item => item.kind !== "text")) groups.set(model.group_id, [...(groups.get(model.group_id) ?? []), model]);
  return [...groups].map(([group, models]) => {
    const id = managedProviderId(session.identity.user_id, session.identity.identity_scope, group, "media");
    const definition = {
      id, label: `NovaFlow · ${models[0]!.group_name}`, version: "1.0.0", rules: [],
      models: models.map(model => {
        const options = model.kind === "image" ? imageOptions(model.model_id) : undefined;
        return {
          id: model.model_id, label: model.label, type: model.kind,
          ...(options ? { imageSizes: options.imageSizes, imageRatios: options.imageRatios } : {}),
          mode: model.kind === "image" ? ["text", "singleImage", "multiReference"] : ["text", "startFrameOptional", "endFrameOptional", ["imageReference:64", "videoReference:64", "audioReference:64"]],
          // 节点参数面板直接根据 rules 渲染；不再提供自定义像素尺寸输入。
          rules: model.kind === "image" ? []
            : [{ type: "inputNumber", field: "seconds", title: "时长（秒）", value: 5, props: { min: 1, max: 3600 } }],
        };
      }),
    };
    const identity = { userId: session.identity.user_id, scope: session.identity.identity_scope, group };
    const source = mediaRuntime + "\nexport default {" + JSON.stringify(definition).slice(1, -1) + ", generateImage, generateVideo, resumeTask };";
    const imageDimensions = Object.fromEntries(models.filter(model => model.kind === "image")
      .map(model => [model.model_id, imageOptions(model.model_id)?.dimensions]));
    return { id, group, identity, source, label: definition.label, imageDimensions };
  });
}
export async function creatorMediaExecution(id: string, source: string) {
  const session = await credentials();
  const entry = creatorMediaSources().find(item => item.id === id);
  if (!entry || entry.source !== source) throw new Error("NovaFlow 模型配置或账号已变更，请刷新后重试");
  return { config: { origin: novaFlowOrigin, ...entry.identity, imageDimensions: entry.imageDimensions }, fetch: creatorFetch(session.sessionId, entry.group) };
}

const mediaRuntime = String.raw`
function object(value) {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NovaFlow 响应格式错误");
 return value;
}
async function request(context, path, options = {}) {
 const response = await context.tool.fetch(context.config.origin + path, options);
 if (!response.ok) { const body = await response.text(); throw new Error(context.tool.errorMessage(body) || "NovaFlow 请求失败"); }
 return response;
}
function inputUrl(input) {
 if (input.type === "url") return input.url;
 const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data.replace(/^data:[^,]+,/, "");
 return "data:" + input.mimeType + ";base64," + data;
}
async function appendMedia(form, field, input, index) {
 if (input.type === "url") { form.append(field, input.url); return; }
 const bytes = input.type === "binary" ? input.data : Buffer.from(input.data.replace(/^data:[^,]+,/, ""), "base64");
 form.append(field, new Blob([bytes], { type: input.mimeType }), input.name || "reference" + index + "." + (input.mimeType.split("/")[1] || "bin"));
}
function parameters(input) {
 const extra = { ...(input.other || {}) };
 // 旧节点可能保存过已移除的像素尺寸，不能继续隐式覆盖可见的分辨率/比例。
 delete extra.size;
 delete extra.width;
 delete extra.height;
 for (const key of ["model", "prompt", "Authorization", "apiKey", "headers", "group", "base_url"]) {
  if (key in extra) throw new Error("扩展参数不能覆盖 " + key);
 }
 for (const key of Object.keys(extra)) if (extra[key] === "" || extra[key] === null || extra[key] === undefined) delete extra[key];
 return extra;
}
function identity(context) { return { userId: context.config.userId, scope: context.config.scope, group: context.config.group }; }
function assertIdentity(context, data) {
 const current = identity(context);
 if (data.userId !== current.userId || data.scope !== current.scope || data.group !== current.group) throw new Error("任务不属于当前账号或分组");
}
async function generateImage(input) {
 const body = { ...parameters(input), model: input.model, prompt: input.prompt };
 if (input.n !== undefined) body.n = input.n;
 if (body.n !== undefined && (!Number.isInteger(body.n) || body.n < 1 || body.n > 128)) throw new Error("图片数量无效");
 const dimensions = this.config.imageDimensions?.[input.model];
 if (!body.size && input.size) {
  if (/^\d+x\d+$/.test(input.size) || input.size === "auto") body.size = input.size;
  else if (dimensions) {
   const size = dimensions[input.size + ":" + (input.ratio || "1:1")];
   if (!size) throw new Error("当前模型不支持所选分辨率或比例，请重新选择");
   body.size = size;
  } else throw new Error("当前模型未声明此分辨率，请刷新模型目录并选择支持的分辨率");
 }
 if (!dimensions && input.ratio) body.aspect_ratio = input.ratio;
 for (const [key,value] of Object.entries({ quality: input.quality, output_format: input.outputFormat })) if (value !== undefined && value !== "") body[key] = value;
 await this.saveTaskData?.({ kind: "imageSubmitting", model: input.model, ...identity(this) });
 let response;
 if (input.images?.length || input.mask) {
  const form = new FormData();
  for (const [key,value] of Object.entries(body)) form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  for (let i=0;i<(input.images || []).length;i++) await appendMedia(form, "image[]", input.images[i], i);
  if (input.mask) await appendMedia(form,"mask",input.mask,0);
  response = await request(this,"/v1/images/edits",{ method:"POST",body:form });
 } else {
  response = await request(this,"/v1/images/generations",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body) });
 }
 const result = object(await response.json());
 const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
 const assets = rows.flatMap(row => typeof row.b64_json === "string" && row.b64_json ? [{ type:"base64", data:row.b64_json,mimeType:body.output_format === "jpeg" ? "image/jpeg" : body.output_format === "webp" ? "image/webp" : "image/png",mediaType:"image" }]
  : typeof row.url === "string" && row.url ? [{type:"url",url:row.url,mediaType:"image"}] : []);
 if (!assets.length) throw new Error("NovaFlow 未返回图片");
 return assets;
}
async function generateVideo(input) {
 const body = { ...parameters(input), model: input.model, prompt: input.prompt };
 if (input.duration !== undefined) body.seconds = input.duration;
 if (body.seconds !== undefined && (!Number.isInteger(Number(body.seconds)) || Number(body.seconds)<1 || Number(body.seconds)>3600)) throw new Error("视频时长无效");
 if (body.seconds !== undefined) body.seconds = String(body.seconds);
 if (input.ratio) body.aspect_ratio = input.ratio;
 if (input.resolution) body.resolution = input.resolution;
 if (input.generateAudio !== undefined) body.generate_audio = input.generateAudio;
 if (input.watermark !== undefined) body.watermark = input.watermark;
 if (input.firstFrame) body.input_reference = inputUrl(input.firstFrame);
 if (input.lastFrame) body.last_frame = inputUrl(input.lastFrame);
 if (input.images?.length) {
  if (input.mode === "singleImage" || input.mode === "startFrameOptional" || input.mode === "endFrameOptional" || input.mode === "startEndRequired") {
   if (!body.input_reference) body.input_reference = inputUrl(input.images[0]);
   if (input.images[1] && !body.last_frame) body.last_frame = inputUrl(input.images[1]);
   if (input.images.length > 2) throw new Error("首尾帧模式最多允许两张参考图");
  } else body.reference_images = input.images.map(inputUrl);
 }
 if (input.videos?.length) body.reference_videos = input.videos.map(inputUrl);
 if (input.audios?.length) body.reference_audios = input.audios.map(inputUrl);
 await this.saveTaskData?.({kind:"videoSubmitting",model:input.model,...identity(this)});
 const response = await request(this,"/v1/videos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const result = object(await response.json());
 const taskId = result.id || result.task_id;
 if (typeof taskId !== "string" || !taskId) throw new Error("NovaFlow 未返回视频任务编号，请勿重复提交");
 const data = {kind:"video",taskId,model:input.model,...identity(this)};
 await this.saveTaskData?.(data);
 return resumeTask.call(this,data);
}
async function resumeTask(data) {
 assertIdentity(this,data);
 if (data.kind !== "video" || typeof data.taskId !== "string") throw new Error("上次提交结果不明，请到 NovaFlow 查询记录，避免重复生成");
 const deadline = Date.now()+30*60*1000;
 while (Date.now()<deadline) {
  this.signal?.throwIfAborted();
  const response=await request(this,"/v1/videos/"+encodeURIComponent(data.taskId));
  const result=object(await response.json());
  if (["failed","cancelled","canceled","expired"].includes(result.status)) throw Object.assign(new Error(this.tool.errorMessage(result.error) || "视频生成失败"),{code:"MEDIA_TASK_FAILED"});
  if (["completed","succeeded"].includes(result.status)) {
   const content=await request(this,"/v1/videos/"+encodeURIComponent(data.taskId)+"/content");
   return [{type:"binary",data:new Uint8Array(await content.arrayBuffer()),mimeType:content.headers.get("content-type") || "video/mp4",mediaType:"video"}];
  }
  await new Promise((resolve,reject)=>{
   const signal=this.signal;
   const abort=()=>{clearTimeout(timer);reject(signal.reason);};
   const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},3000);
   signal?.addEventListener("abort",abort,{once:true});
   if(signal?.aborted) abort();
  });
 }
 throw new Error("视频仍在处理中，可稍后恢复查询；没有重新提交生成");
}
`;
