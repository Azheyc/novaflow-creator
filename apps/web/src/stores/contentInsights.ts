import { reactive, watch } from "vue";
import { novaFlowState } from "./novaFlow";
import type { ContentItem, ContentPage, ContentPlatform } from "@toonflow/server/contentInsights";

export const contentView = reactive({ tab: "discover", platform: "douyin" as ContentPlatform, operation: "works", keyword: "", page: 1,
  date: new Date(Date.now() - 86400000).toLocaleDateString("sv-SE"), category: "", sort: "default", minLikes: 0, scroll: 0,
  result: null as ContentPage | null, selected: null as ContentItem | null });
watch(() => `${novaFlowState.value.account?.user_id}:${novaFlowState.value.account?.identity_scope}`, () => {
  contentView.result = null; contentView.selected = null; contentView.page = 1; contentView.scroll = 0;
});
