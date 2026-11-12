import { z } from "zod";

export const platformSchema = z.enum(["douyin", "xiaohongshu", "bilibili", "channels"]);
export type ContentPlatform = z.infer<typeof platformSchema>;
export const contentQuerySchema = z.object({
  platform: platformSchema,
  operation: z.enum(["works", "accounts", "accountWorks", "account", "detail", "hot", "surge", "topics"]),
  keyword: z.string().max(200).default(""), id: z.string().max(512).default(""), url: z.string().max(4096).default(""),
  page: z.number().int().min(1).max(500).default(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().max(60).default(""), sort: z.enum(["default", "latest", "popular"]).default("default"),
});
export type ContentQuery = z.infer<typeof contentQuerySchema>;
export type ContentItem = {
  id: string; platform: ContentPlatform; kind: "video" | "image" | "account" | "topic"; title: string; description: string;
  author: string; authorId: string; url: string; cover: string; publishedAt: string; sourceUpdatedAt: string; fetchedAt: number;
  metrics: Record<string, number>; images?: string[]; exportId?: string; lookupId?: string;
};
export type ContentPage = { items: ContentItem[]; page: number; hasMore: boolean; total?: number; fetchedAt: number; cached?: boolean };
export type Subscription = { id: string; item: ContentItem; own: boolean; group: string; enabled: boolean; threshold: number; lastRun: number; nextRun: number; error: string; count: number };
export type ContentImport = { id: string; item: ContentItem; directory: string; canvas: string; mode: "import" | "remix"; goal: string; status: "pending" | "downloading" | "ready" | "failed" | "cancelled"; progress: number; error: string; media?: string; createdAt: number };
export const platformNames: Record<ContentPlatform, string> = { douyin: "抖音", xiaohongshu: "小红书", bilibili: "B站", channels: "视频号" };
export const platformCapabilities = {
  douyin: { hot: true, surge: true, topics: true }, xiaohongshu: { hot: true, surge: true, topics: true },
  bilibili: { hot: false, surge: false, topics: true }, channels: { hot: false, surge: false, topics: false },
};
