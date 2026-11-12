import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeAtomic } from "@toonflow/file";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Only these shipped skill directories participate; unrelated user skills remain untouched.
const skillFolders = ["workflow", "canvas", "storycraft", "assetExtractor", "characterBoard", "sceneReference", "cinematicStoryboard", "contentInsights"];
const retiredFolders = ["v118workflow", "laotang-storycraft-zh", "laotang-asset-extractor", "laotang-character-board", "laotang-scene-reference-zh", "laotang-cinematic-storyboard-s9"];

export default async function initializeSkills(dataDirectory: string, sourceDirectory: string) {
  const hash = createHash("sha256");
  async function hashDirectory(directory: string, prefix: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await hashDirectory(join(directory, entry.name), relative);
      else if (entry.isFile()) hash.update(relative).update("\0").update(await readFile(join(directory, entry.name))).update("\0");
      else throw new Error(`内置技能包含不支持的文件类型：${relative}`);
    }
  }
  // Validate the complete source before touching installed skills.
  for (const folder of skillFolders) await hashDirectory(join(sourceDirectory, folder), folder);
  const revision = hash.digest("hex");
  const marker = join(dataDirectory, "creatorSkillsRevision");
  const previous = await readFile(marker, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return "";
  });
  if (previous === revision) return;

  const target = join(dataDirectory, "skills");
  const backups = join(dataDirectory, "skillBackups");
  await mkdir(target, { recursive: true });
  await mkdir(backups, { recursive: true });
  const backup = await mkdtemp(join(backups, "creatorMigration"));
  const stage = await mkdtemp(join(dataDirectory, "creatorSkillsStage"));
  const moved: string[] = [];
  const installed: string[] = [];
  try {
    for (const folder of skillFolders) await cp(join(sourceDirectory, folder), join(stage, folder), { recursive: true });
    for (const folder of [...skillFolders, ...retiredFolders]) {
      try {
        await rename(join(target, folder), join(backup, folder));
        moved.push(folder);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    for (const folder of skillFolders) {
      await rename(join(stage, folder), join(target, folder));
      installed.push(folder);
    }
    await writeAtomic(marker, revision);
  } catch (error) {
    // Restore the previous set if copying or installation fails. Backups live outside skill discovery.
    for (const folder of installed) await rm(join(target, folder), { recursive: true, force: true });
    for (const folder of moved) await cp(join(backup, folder), join(target, folder), { recursive: true });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
