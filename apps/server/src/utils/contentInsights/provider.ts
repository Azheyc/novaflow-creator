import { createHash } from "node:crypto";
import { contentCredential, clearContentCredential, contentOwner } from "./credential";
import { record, saveRecord, observe } from "./store";
import { platformCapabilities, type ContentItem, type ContentPage, type ContentPlatform, type ContentQuery } from "./types";

type Row = Record<string, any>;
const inflight = new Map<string, Promise<ContentPage>>();
export function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).replace(/<[^>]*>/g, "").replace(/redfox|redfox\.hk/gi, "").slice(0, 16000) : ""; }
export function publicUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/redfox/i.test(url.hostname) ? url.href : ""; } catch { return ""; }
}
export async function contentPost(path: string, body: Row, signal?: AbortSignal): Promise<any> {
  const owner = contentOwner();
  let key: string;
  try { key = await contentCredential(); } catch { throw Object.assign(new Error("内容服务暂不可用，请确认登录状态后重试"), { status: 503 }); }
  let response: Response;
  try {
    response = await fetch(`https://redfox.hk/story/api${path}`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", REDFOX_API_KEY: key },
      body: JSON.stringify({ ...body, source: "NovaFlow Creator" }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  } catch { throw new Error("内容获取超时或网络不可用；任务提交结果未知时请勿重复提交"); }
  let result: Row;
  try { result = await response.json() as Row; } catch { throw new Error("内容服务暂时返回无效数据，请稍后重试"); }
  if (contentOwner() !== owner) throw new Error("账号已变更，请重新操作");
  if (response.status === 401 || [401, 3103, 3105].includes(result.code)) {
    clearContentCredential();
    await contentCredential().catch(() => {});
    throw new Error("内容服务连接已刷新，请重试查询；已提交任务请先查询状态");
  }
  if (response.status === 429 || result.code === 4004) throw new Error("内容获取过于频繁，请稍后重试");
  if (!response.ok || result.code !== 2000) throw new Error("当前内容接口暂不可用，请稍后重试或选择其他功能");
  return result.data;
}
function list(data: any, single = false): Row[] {
  if (Array.isArray(data)) return data;
  for (const key of ["list", "workList", "accountList", "records", "items", "rows", "data"]) if (Array.isArray(data?.[key])) return data[key];
  return single && data && typeof data === "object" && Object.keys(data).length ? [data] : [];
}
export function normalizeItem(platform: ContentPlatform, row: Row, kind?: ContentItem["kind"]): ContentItem {
  const pick = (...keys: string[]) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== "");
  const isAccount = kind === "account";
  const type = text(pick("workType", "type"));
  const id = text(isAccount ? pick("uid", "mid", "findName", "accountUserid", "userId", "accountId") : pick("workId", "bvId", "bvid", "videoId", "noteId", "id"));
  const title = text(isAccount ? pick("nickname", "accountName", "name") : pick("title", "workTitle", "keyword", "word", "hotWord", "name", "description", "content"));
  let url = publicUrl(pick("workUrl", "workLink", "url", "link", "shareUrl"));
  if (!url && id && !isAccount && kind !== "topic") {
    if (platform === "douyin") url = `https://www.douyin.com/video/${encodeURIComponent(id)}`;
    if (platform === "xiaohongshu") url = `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`;
    if (platform === "bilibili") url = `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
  }
  const metrics: Record<string, number> = {};
  const mapping = { likes: ["likeCount", "workLikedCount", "accountLikes", "totalFavorited"], comments: ["commentCount", "workCommentsCount"],
    favorites: ["collectCount", "favoriteCount", "workCollectedCount", "favCount", "accountCollectes"], shares: ["shareCount", "workSharedCount", "forwardCount"],
    views: ["playCount", "viewCount"], followers: ["followerCount", "accountFans", "follower", "fansCount"], works: ["awemeCount", "accountTotalWorks", "videoCount"], heat: ["hotValue", "hotScore", "heat"] };
  for (const [name, keys] of Object.entries(mapping)) {
    const value = pick(...keys);
    if (value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) metrics[name] = Number(value);
  }
  return { id: id || createHash("sha256").update(`${platform}:${title}:${url}`).digest("hex").slice(0, 24), platform,
    kind: kind ?? (/图文|normal|image/.test(type) ? "image" : "video"), title: title || "未命名内容", description: text(pick("workDesc", "description", "content", "signature", "accountDesc", "sign")),
    author: text(pick("accountNickname", "accountName", "author", "nickname")), authorId: text(pick("accountUserid", "authorId", "accountId")),
    url, cover: publicUrl(isAccount ? pick("avatarUrl", "accountAvatar", "face", "headUrl") : pick("coverUrl", "picUrl", "cover", "thumbUrl")),
    publishedAt: text(pick("publishTime", "workPublishTime", "created", "createTime")), sourceUpdatedAt: text(pick("crawlTime", "updateTime", "updatedAt")),
    fetchedAt: Date.now(), metrics, exportId: text(row.exportId) || undefined, lookupId: text(pick("accountId", "mid", "uid")) || undefined,
    images: Array.isArray(row.images) ? row.images.map((v: any) => publicUrl(typeof v === "string" ? v : v.url)).filter(Boolean) : undefined };
}
function endpoint(q: ContentQuery): [string, Row] {
  const { platform: p, operation: op, page, keyword, id, url, date, category, sort } = q;
  const offset = (page - 1) * 20;
  if (["works", "accounts"].includes(op) && !keyword.trim()) throw new Error("请输入搜索关键词");
  if (["account", "accountWorks"].includes(op) && !id) throw new Error("请选择账号");
  if (op === "topics") {
    if (!platformCapabilities[p].topics) throw new Error("当前平台暂不提供话题榜");
    return ["/hotSpot/getListByPlatform", { platform: { douyin: 2, xiaohongshu: 6, bilibili: 8, channels: 0 }[p], startDate: date, endDate: date }];
  }
  if (op === "hot" || op === "surge") {
    if (!platformCapabilities[p][op]) throw new Error("当前平台暂不提供此作品榜单");
    if (p === "douyin") return [op === "hot" ? "/dy/search/likesRank" : "/dy/search/getDailyRank", { type: category || "全部", startTime: date, ...(op === "hot" ? { endTime: date } : {}) }];
    return [op === "hot" ? "/cozeSkill/getXhsCozeSkillDataOne" : "/cozeSkill/getLowPowderExplosiveArticle", { category: category || "综合全部", rankDate: date }];
  }
  if (p === "douyin") {
    if (op === "account") return ["/dyData/queryUser", { accountId: id }];
    if (op === "accountWorks") return ["/dyData/queryWorkList", { accountId: id, offset, sortType: "_2" }];
    if (op === "detail") return ["/dyData/queryWork", url ? { workUrl: url } : { workId: id }];
    return [op === "accounts" ? "/dyData/searchUser" : "/dyData/searchArticle", { keyword, offset, sortType: sort === "popular" ? "_4" : sort === "latest" ? "_2" : "_0" }];
  }
  if (p === "xiaohongshu") {
    if (op === "account") return ["/xhsUser/queryAccountDetail", { accountId: id }];
    if (op === "accountWorks") return ["/xhsUser/queryWorkList", { redId: id, offset, sortType: "_2" }];
    if (op === "detail") return ["/xhsUser/queryWorkDetail", url ? { workLink: url } : { workId: id }];
    return [op === "accounts" ? "/xhsUser/searchUser" : "/xhsUser/searchArticle", { keyword, offset, sortType: sort === "popular" ? "_4" : sort === "latest" ? "_2" : "_0" }];
  }
  if (p === "bilibili") {
    if (op === "account") return ["/bili/data/accountDetail", { mid: id }];
    if (op === "accountWorks") return ["/bili/data/accountWorkList", { mid: id, page: String(page), pageSize: 20, order: "time" }];
    if (op === "detail") return ["/bili/data/workDetail", url ? { workUrl: url } : { bvId: id }];
    return [op === "accounts" ? "/bili/data/accountSearch" : "/bili/data/workSearch", { keyword, page: String(page), pageSize: 20, ...(op === "works" ? { order: sort === "popular" ? "play" : "time" } : {}) }];
  }
  if (op === "account") return ["/sphAllData/searchUser", { accountName: keyword || id, page: 1, pageSize: 20 }];
  if (op === "accountWorks") return ["/sphAllData/queryWorkList", { nickname: keyword || id, page, size: 20 }];
  if (op === "detail") return url ? ["/sph/ability/workLinkDetail", { url }] : ["/sphAllData/queryWorkDetail", { videoId: id }];
  return op === "accounts" ? ["/sphAllData/searchUser", { accountName: keyword, page, pageSize: 20 }]
    : ["/sphAllData/searchWork", { keyword, page, size: 20, sort: sort === "popular" ? "最多点赞" : sort === "latest" ? "最新" : "综合" }];
}
export async function queryContent(q: ContentQuery, fresh = false): Promise<ContentPage> {
  const owner = contentOwner();
  const cacheKey = createHash("sha256").update(JSON.stringify(q)).digest("hex");
  const saved = record<ContentPage>("cache", cacheKey, owner);
  const ttl = ["hot", "surge", "topics"].includes(q.operation) ? 3600000 : 300000;
  if (!fresh && saved && Date.now() - saved.fetchedAt < ttl) return { ...saved, cached: true };
  const key = `${owner}:${cacheKey}`;
  if (inflight.has(key)) return inflight.get(key)!;
  const job = (async () => {
    const [path, body] = endpoint(q);
    const raw = await contentPost(path, body);
    if (contentOwner() !== owner) throw new Error("账号已变更");
    const rows = list(raw, q.operation === "detail" || q.operation === "account");
    const items = rows.map(row => normalizeItem(q.platform, row, ["accounts", "account"].includes(q.operation) ? "account" : q.operation === "topics" ? "topic" : undefined));
    for (const item of items) observe(item, owner);
    const total = typeof raw?.total === "number" ? raw.total : undefined;
    const hasMore = ["hot", "surge", "topics", "account", "detail"].includes(q.operation) ? false : raw?.hasMore !== undefined ? !!raw.hasMore : total !== undefined ? q.page * 20 < total : rows.length === 20;
    return saveRecord("cache", cacheKey, { items, page: q.page, hasMore, total, fetchedAt: Date.now() }, owner);
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}
export async function resolveMedia(item: ContentItem) {
  let url = item.url;
  if (item.platform === "channels" && !url) {
    let objectId = item.id;
    if (item.exportId) {
      const converted = await contentPost("/sph/ability/eidToObjectId", { eid: item.exportId });
      objectId = text(converted?.objectId);
    }
    const result = await contentPost("/sph/ability/objectIdToVideoUrl", { objectId });
    return mediaResult(result);
  }
  if (!publicUrl(url)) throw new Error("此作品没有可用链接，请粘贴分享链接或上传本地素材");
  const name = { douyin: "douyin", xiaohongshu: "xhs", bilibili: "bilibili", channels: "sph" }[item.platform];
  return mediaResult(await contentPost(`/parseWork/videoDownload/${name}`, { url }));
}
function mediaResult(raw: Row) {
  const resources = Array.isArray(raw.resources) ? raw.resources : [];
  const video = publicUrl(raw.videoUrl) || publicUrl(resources.find((r: Row) => r.type === "video")?.downloadUrl);
  const images = resources.filter((r: Row) => r.type === "image").map((r: Row) => publicUrl(r.downloadUrl || r.url)).filter(Boolean);
  if (!video && !images.length) throw new Error("暂未取得可下载素材，请稍后重试或上传本地文件");
  return { video, images, title: text(raw.title) };
}
