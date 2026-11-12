import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { mkdirSync, chmodSync } from "@toonflow/file";
import { createHash } from "node:crypto";
import { contentOwner } from "./credential";
import type { ContentItem } from "./types";

let database: Database | undefined;
function db() {
  if (database) return database;
  const root = process.env.TOONFLOW_DATA_DIR;
  if (!root) throw new Error("数据目录尚未初始化");
  mkdirSync(root, { recursive: true });
  const path = resolve(root, "contentInsights.sqlite");
  database = new Database(path, { create: true, strict: true });
  chmodSync(path, 0o600);
  database.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS records (owner TEXT NOT NULL, category TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,category,id));
    CREATE TABLE IF NOT EXISTS snapshots (owner TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL, observed INTEGER NOT NULL, PRIMARY KEY(owner,id,fingerprint));`);
  return database;
}
export function saveRecord<T>(category: string, id: string, value: T, owner = contentOwner()) {
  db().query("INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(owner,category,id) DO UPDATE SET body=excluded.body,updated=excluded.updated").run(owner, category, id, JSON.stringify(value), Date.now());
  return value;
}
export function record<T>(category: string, id: string, owner = contentOwner()): T | undefined {
  const row = db().query("SELECT body FROM records WHERE owner=? AND category=? AND id=?").get(owner, category, id) as { body: string } | null;
  return row ? JSON.parse(row.body) as T : undefined;
}
export function records<T>(category: string, owner = contentOwner()): T[] {
  return (db().query("SELECT body FROM records WHERE owner=? AND category=? ORDER BY updated DESC").all(owner, category) as { body: string }[]).map(row => JSON.parse(row.body) as T);
}
export function removeRecord(category: string, id: string, owner = contentOwner()) {
  db().query("DELETE FROM records WHERE owner=? AND category=? AND id=?").run(owner, category, id);
}
export function itemKey(item: ContentItem) { return `${item.platform}:${item.kind}:${item.id}`; }
export function observe(item: ContentItem, owner = contentOwner()) {
  const fingerprint = createHash("sha256").update(JSON.stringify([item.sourceUpdatedAt, item.metrics])).digest("hex");
  db().query("INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?,?)").run(owner, itemKey(item), fingerprint, JSON.stringify(item), Date.now());
  saveRecord("items", itemKey(item), item, owner);
}
export function history(id: string, owner = contentOwner()) {
  return (db().query("SELECT body, observed FROM snapshots WHERE owner=? AND id=? ORDER BY observed DESC LIMIT 180").all(owner, id) as { body: string; observed: number }[])
    .map(row => ({ item: JSON.parse(row.body) as ContentItem, observedAt: row.observed })).reverse();
}
