import { inject, watch, type Ref } from "vue";
import { findNodeModel, getNodeModelKey, type NodeMediaModel } from "@toonflow/nodes-scaffold/nodeAi";
import { getModelFormValues } from "./useModelForm";

export function useMediaDefaults<T extends { model: string; other: Record<string, unknown> }>(kind: "image" | "video", data: Ref<T>) {
  const storage = inject<{ getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined>("mediaNodeDefaultsStorage", undefined);
  const fields = kind === "image" ? ["model", "size", "ratio", "other"] : ["model", "duration", "resolution", "ratio", "mode", "other"];
  const key = `novaflow.mediaDefaults.${kind}`;
  let initialized = false;
  let previous = "";
  function snapshot() {
    return JSON.stringify(Object.fromEntries(fields.map(field => [field, (data.value as Record<string, unknown>)[field]])));
  }
  watch(snapshot, value => {
    if (!initialized || value === previous) return;
    previous = value;
    storage?.setItem(key, value);
  }, { flush: "post" });

  return (models: NodeMediaModel[]) => {
    if (initialized || !models.length) return;
    if (!data.value.model) {
      let saved: Record<string, unknown> = {};
      try {
        const value = JSON.parse(storage?.getItem(key) ?? "null");
        if (value && typeof value === "object" && !Array.isArray(value)) saved = value;
      } catch {
        saved = {};
      }
      const choice = typeof saved.model === "string" ? findNodeModel(models, saved.model) : undefined;
      const selected = choice ?? models[0]!;
      data.value.model = getNodeModelKey(selected);
      if (choice) {
        const values = Object.fromEntries(fields.filter(field => field !== "model" && (
          field === "other" ? saved.other && typeof saved.other === "object" && !Array.isArray(saved.other)
            : field === "duration" ? typeof saved.duration === "number" && Number.isFinite(saved.duration) && saved.duration > 0
              : typeof saved[field] === "string"
        )).map(field => [field, saved[field]]));
        values.other = getModelFormValues(choice, (values.other as Record<string, unknown> | undefined) ?? {});
        if (kind === "image") {
          if (!(choice.imageSizes ?? ["2K"]).includes(String(values.size))) delete values.size;
          if (!(choice.imageRatios ?? ["16:9"]).includes(String(values.ratio))) delete values.ratio;
        } else {
          const mappings = choice.durationResolutionMap ?? [];
          if (!mappings.some(item => item.duration.includes(Number(values.duration)))) delete values.duration;
          const duration = values.duration ?? (data.value as Record<string, unknown>).duration;
          if (!mappings.some(item => item.duration.includes(Number(duration)) && item.resolution.includes(String(values.resolution)))) delete values.resolution;
          if (!["16:9", "9:16", "1:1", "4:3", "3:4"].includes(String(values.ratio))) delete values.ratio;
        }
        Object.assign(data.value, values);
      }
      if (kind === "video") Object.assign(data.value, { generateAudio: selected.audio === true || selected.audio === "optional" });
    }
    previous = snapshot();
    initialized = true;
  };
}
