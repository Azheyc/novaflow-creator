import { Toonflow } from "./toonflow";
import type { Channel } from "./types";

const channels = new Map<string, Channel>([["toonflow", new Toonflow()]]);

export function getChannel(): Channel {
  if ((process.env.TOONFLOW_CHANNEL?.trim() || "novaflow") === "novaflow") throw Object.assign(new Error("此云服务未在 NovaFlow 渠道开放"), { status: 403 });
  const source = channels.get(process.env.TOONFLOW_CHANNEL?.trim() || "novaflow");
  if (!source) throw Object.assign(new Error("渠道未配置，请检查 TOONFLOW_CHANNEL"), { status: 503 });
  return source;
}
