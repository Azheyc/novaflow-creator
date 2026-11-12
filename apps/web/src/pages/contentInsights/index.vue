<template>
  <div class="contentInsights">
    <aside class="navigation">
      <strong>NovaFlow</strong>
      <button @click="router.push('/home')">← 无限画布</button>
      <div class="navTitle">内容洞察</div>
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: view.tab === tab.id }" @click="switchTab(tab.id)">{{ tab.label }}</button>
      <p>监控在客户端运行时采集<br />退出或休眠后暂停</p>
      <button @click="settingsVisible = true">设置与账号</button>
    </aside>
    <main ref="scrollArea" @scroll="view.scroll = scrollArea?.scrollTop || 0">
      <header><div><span class="eyebrow">CONTENT INSIGHTS</span><h1>{{ tabs.find(tab => tab.id === view.tab)?.label }}</h1><p>从内容发现到画布创作，让每个选题都有依据。</p></div><el-button :loading="refreshing" @click="refreshState">刷新记录</el-button></header>
      <el-alert v-if="!novaFlowState.account" title="请先在设置中登录 NovaFlow，再使用内容洞察。" type="info" :closable="false" />
      <el-alert v-if="error" :title="error" type="warning" showIcon @close="error = ''" />
      <template v-if="['ranks', 'discover'].includes(view.tab)">
        <section class="filters">
          <el-select v-model="view.platform" aria-label="平台" @change="changePlatform"><el-option v-for="(name, key) in platformNames" :key="key" :label="name" :value="key" /></el-select>
          <el-select v-model="view.operation" aria-label="内容类型">
            <template v-if="view.tab === 'ranks'"><el-option label="热门作品" value="hot" :disabled="!capabilities[view.platform].hot" /><el-option label="飙升 / 黑马作品" value="surge" :disabled="!capabilities[view.platform].surge" /><el-option label="话题热榜" value="topics" :disabled="!capabilities[view.platform].topics" /></template>
            <template v-else><el-option label="搜索作品" value="works" /><el-option label="搜索账号" value="accounts" /><el-option label="分享链接 / 作品 ID" value="detail" /><el-option v-if="view.operation === 'accountWorks'" label="账号作品" value="accountWorks" /></template>
          </el-select>
          <template v-if="view.tab === 'ranks'"><el-date-picker v-model="view.date" type="date" valueFormat="YYYY-MM-DD" placeholder="榜单日期" /><el-input v-model="view.category" placeholder="行业分类，留空全部" /></template>
          <template v-else><el-input v-model="view.keyword" :placeholder="view.operation === 'detail' ? '粘贴分享链接或作品 ID' : '搜索关键词、账号名'" @keyup.enter="search(true)" /><el-select v-model="view.sort" aria-label="排序"><el-option label="默认排序" value="default" /><el-option label="最新发布" value="latest" /><el-option label="热门优先" value="popular" /></el-select></template>
          <el-button type="primary" :loading="loading" :disabled="!novaFlowState.account || unsupported" @click="search(true)">获取内容</el-button>
        </section>
        <p class="hint" v-if="unsupported">当前平台暂未提供此榜单，可前往爆款发现搜索作品。</p>
        <p class="hint" v-else-if="view.tab === 'ranks'">榜单按日期更新，可能有延迟；话题榜不等于视频作品榜。</p>
        <div v-if="view.result" class="resultMeta"><span>本页 {{ view.result.items.length }} 条 · {{ view.result.total === undefined ? '总量未提供' : `共 ${view.result.total} 条` }} · 获取于 {{ time(view.result.fetchedAt) }}{{ view.result.cached ? ' · 已缓存' : '' }}</span><label>最低点赞 <el-input-number v-model="view.minLikes" :min="0" :step="100" size="small" /></label></div>
        <section class="cards" v-loading="loading">
          <button v-for="item in visibleItems" :key="itemKey(item)" class="contentCard" @click="select(item)">
            <div class="cover" :class="{ avatar: item.kind === 'account' }"><img v-if="item.cover && !failedCovers.has(item.cover)" :src="item.cover" referrerpolicy="no-referrer" loading="lazy" alt="内容封面" @error="failedCovers.add(item.cover)" /><span v-else>{{ item.kind === 'topic' ? '热' : '暂无封面' }}</span><small>{{ kindName(item.kind) }}</small></div>
            <div class="cardBody"><h3>{{ item.title }}</h3><p>{{ item.author || platformNames[item.platform] }}</p><div class="metrics"><span v-for="key in metricKeys(item)" :key="key">{{ metricNames[key] }} {{ number(item.metrics[key]) }}</span></div><time>{{ item.publishedAt || '发布时间未提供' }}</time></div>
          </button>
        </section>
        <el-empty v-if="!loading && view.result && !visibleItems.length" description="当前条件没有可展示内容" />
        <div v-if="view.result" class="pagination"><el-button :disabled="view.page <= 1 || loading" @click="view.page--; search()">上一页</el-button><span>第 {{ view.page }} 页</span><el-button :disabled="!view.result.hasMore || loading" @click="view.page++; search()">下一页</el-button></div>
      </template>
      <template v-else-if="['own', 'monitors'].includes(view.tab)">
        <div class="sectionActions"><p>{{ view.tab === 'own' ? '展示公开表现；添加为我的账号不代表平台授权，不包含完播率、转化和收入。' : '首次采集建立基线，历史走势从实际监控开始；视频号按昵称收录，注意同名账号。' }}</p><el-button type="primary" @click="switchTab('discover'); view.operation = 'accounts'">添加账号</el-button></div>
        <el-input v-model="groupFilter" placeholder="筛选竞品分组" clearable class="groupFilter" />
        <div class="sectionActions"><h2>账号对比</h2><el-button :disabled="!state.analytics.length" @click="analysisDialog = true">AI 分析与选题建议</el-button></div>
        <el-table :data="state.analytics.filter(row => row.platform === view.platform)" class="comparison"><el-table-column prop="title" label="账号" /><el-table-column prop="sampleCount" label="已收录作品" /><el-table-column label="样本点赞中位数"><template #default="{ row }">{{ number(row.medianLikes ?? undefined) }}</template></el-table-column><el-table-column label="粉丝"><template #default="{ row }">{{ number(row.followers ?? undefined) }}</template></el-table-column><el-table-column label="监控期间粉丝变化"><template #default="{ row }">{{ row.followerChange === null ? '尚无可比快照' : row.followerChange }}</template></el-table-column></el-table>
        <p class="hint">对比平台：<el-select v-model="view.platform" size="small" style="width: 130px"><el-option v-for="(name, key) in platformNames" :key="key" :label="name" :value="key" /></el-select>　仅统计本机已收录样本，非全量账号数据。</p>
        <section class="accountRows"><article v-for="sub in shownSubscriptions" :key="sub.id" class="accountRow"><div class="accountHeading"><img v-if="sub.item.cover" :src="sub.item.cover" referrerpolicy="no-referrer" alt="账号头像" /><div><h3>{{ sub.item.title }}</h3><span>{{ platformNames[sub.item.platform] }} · {{ sub.group }} · {{ sub.enabled ? '监控中' : '已暂停' }}</span></div><el-tag v-if="sub.own">我的账号</el-tag></div><div class="metrics"><span v-for="key in metricKeys(sub.item)" :key="key">{{ metricNames[key] }} {{ number(sub.item.metrics[key]) }}</span></div><p class="hint">{{ sub.lastRun ? `上次采集 ${time(sub.lastRun)} · 最近采集 ${sub.count} 条作品` : '等待首次采集' }}</p><p v-if="sub.error" class="warning">{{ sub.error }}</p><footer><el-button @click="accountWorks(sub)">查看作品</el-button><el-button @click="showHistory(sub.item)">趋势快照</el-button><el-button @click="manage('refresh', sub.id)">立即采集</el-button><el-button @click="manage('pause', sub.id)">{{ sub.enabled ? '暂停' : '恢复' }}</el-button></footer></article></section>
        <el-empty v-if="!shownSubscriptions.length" description="搜索账号后添加，即可开始积累公开数据" />
        <section v-if="state.alerts.length" class="alerts"><h2>监控动态</h2><p v-for="(alert, index) in state.alerts.slice(0, 20)" :key="index">{{ time(alert.createdAt) }}　{{ alert.title }}</p></section>
      </template>
      <template v-else>
        <section class="favorites"><article v-for="favorite in state.favorites" :key="favorite.id" class="favoriteRow"><button @click="select(favorite.item)"><h3>{{ favorite.item.title }}</h3><p>{{ platformNames[favorite.item.platform] }} · {{ favorite.item.author }}</p></button><p>{{ favorite.note || '未填写备注' }}</p><p v-if="favorite.publishedUrl">已关联发布作品：<a :href="favorite.publishedUrl" target="_blank" rel="noreferrer">查看作品</a></p><div><el-button @click="select(favorite.item); favoriteDialog = true; note = favorite.note; publishedUrl = favorite.publishedUrl || ''; projectLink = favorite.project || ''">编辑备注与发布关联</el-button><el-button @click="beginImport(favorite.item)">导入画布复刻</el-button><el-button @click="manage('unfavorite', favorite.id)">取消收藏</el-button></div></article></section>
        <el-empty v-if="!state.favorites.length" description="收藏参考作品，随时继续创作" />
      </template>
      <section v-if="state.imports.length" class="imports"><h2>导入任务</h2><article v-for="job in state.imports.slice(0, 12)" :key="job.id"><div><strong>{{ job.item.title }}</strong><p>{{ job.canvas }} · {{ job.status === 'ready' ? '已导入' : job.status === 'failed' ? '待恢复' : job.status === 'cancelled' ? '已暂停' : '正在下载与导入' }}</p><el-progress v-if="job.status === 'downloading'" :percentage="job.progress" /><p v-if="job.error" class="warning">{{ job.error }}</p></div><el-button v-if="job.status === 'ready'" @click="openCanvas(job)">进入画布{{ job.mode === 'remix' ? '改编' : '' }}</el-button><el-button v-else-if="['failed', 'cancelled'].includes(job.status)" @click="retryImport(job)">继续导入</el-button><el-button v-else @click="cancelJob(job)">暂停</el-button></article></section>
    </main>
    <el-drawer v-model="detailVisible" title="内容详情" size="min(640px, 90vw)" @closed="preview = ''; transcriptResult = null">
      <template v-if="view.selected"><h2>{{ view.selected.title }}</h2><p>{{ platformNames[view.selected.platform] }} · {{ view.selected.author }}</p><video v-if="preview" :src="preview" controls class="videoPreview" /><img v-else-if="view.selected.cover" :src="view.selected.cover" class="detailCover" referrerpolicy="no-referrer" alt="作品封面" /><p class="description">{{ view.selected.description }}</p><div class="metrics"><span v-for="key in Object.keys(view.selected.metrics)" :key="key">{{ metricNames[key] }} {{ number(view.selected.metrics[key]) }}</span></div><p class="hint">发布：{{ view.selected.publishedAt || '未提供' }}<br />数据更新：{{ view.selected.sourceUpdatedAt || '来源未提供' }}<br />获取：{{ time(view.selected.fetchedAt) }}</p><a v-if="view.selected.url" :href="view.selected.url" target="_blank" rel="noreferrer">打开原作品</a>
        <div class="detailActions" v-if="view.selected.kind === 'account'"><el-button type="primary" @click="subscriptionDialog = true; own = false">监控此账号</el-button><el-button @click="subscriptionDialog = true; own = true">添加为我的账号</el-button></div>
        <div class="detailActions" v-else-if="view.selected.kind === 'topic'"><el-button type="primary" @click="findTopic">查找相关作品</el-button><el-button @click="favoriteDialog = true">收藏选题</el-button></div>
        <div class="detailActions" v-else><el-button type="primary" @click="beginImport(view.selected)">导入画布复刻</el-button><el-button :loading="previewLoading" @click="loadPreview">预览 / 下载</el-button><el-button @click="favoriteDialog = true">收藏</el-button><el-button @click="showHistory(view.selected)">指标快照</el-button><el-button v-if="view.selected.kind === 'video' && view.selected.url" :loading="transcribing" @click="loadTranscript">{{ transcriptResult?.status === 'processing' ? '查询文案进度' : '提取文案' }}</el-button><el-button v-if="view.selected.author" @click="findAuthor">查找作者账号</el-button></div>
        <p v-if="preview"><a :href="preview" target="_blank" rel="noopener" download>下载视频文件</a> · 链接临时有效；也可导入项目保存。</p>
        <div v-if="previewImages.length" class="imageLinks"><a v-for="(url, i) in previewImages" :key="url" :href="url" target="_blank" rel="noopener">下载图片 {{ i + 1 }}</a></div>
        <section v-if="transcriptResult"><h3>文案提取</h3><p>{{ transcriptResult.error || (transcriptResult.status === 'processing' ? '处理中，请稍后查询进度' : '') }}</p><p class="description">{{ transcriptResult.text }}</p></section>
      </template>
    </el-drawer>
    <el-dialog v-model="importDialog" title="导入画布复刻" width="580px"><el-form labelPosition="top"><el-form-item label="目标项目"><el-select v-model="directory" placeholder="选择已有项目或新工作目录"><el-option v-for="project in workspace.projectList" :key="project.directory" :value="project.directory" :label="project.name" /></el-select><workspacePicker v-model="directory" /></el-form-item><el-form-item label="处理方式"><el-radio-group v-model="importMode"><el-radio value="import">仅导入素材</el-radio><el-radio value="remix">拆解并改编</el-radio></el-radio-group></el-form-item><el-form-item label="改编目标"><el-input v-model="goal" type="textarea" :rows="3" placeholder="例如：保留开头悬念和节奏，换成我的品牌，制作 20 秒竖屏视频" /></el-form-item><el-form-item v-if="importMode === 'remix'" label="分析与改编模型"><modelPopover v-model="model" v-model:reasoningEffort="reasoning" /></el-form-item></el-form><p class="hint">将在目标项目创建独立参考画布。拆解分析使用模型额度；不会自动提交图片或视频生成。</p><template #footer><el-button @click="importDialog = false">取消</el-button><el-button type="primary" :loading="importing" :disabled="!directory || (importMode === 'remix' && !model)" @click="submitImport">开始导入</el-button></template></el-dialog>
    <el-dialog v-model="subscriptionDialog" :title="own ? '添加我的账号' : '添加竞品监控'" width="460px"><el-form labelPosition="top"><el-form-item label="账号分组"><el-input v-model="group" /></el-form-item><el-form-item label="作品点赞增长提醒阈值"><el-input-number v-model="threshold" :min="1" :step="100" /></el-form-item></el-form><p class="hint">每天采集，客户端关闭时暂停。{{ view.selected?.platform === 'channels' ? '视频号按昵称收录作品，可能包含同名账号。' : '' }}</p><template #footer><el-button type="primary" @click="subscribe">开始监控</el-button></template></el-dialog>
    <el-dialog v-model="favoriteDialog" title="选题收藏" width="520px"><el-form labelPosition="top"><el-form-item label="备注 / 创作目标"><el-input v-model="note" type="textarea" :rows="3" /></el-form-item><el-form-item label="关联项目"><el-select v-model="projectLink" clearable><el-option v-for="project in workspace.projectList" :key="project.directory" :value="project.directory" :label="project.name" /></el-select></el-form-item><el-form-item label="创作后发布的作品链接"><el-input v-model="publishedUrl" placeholder="可稍后补充，用于复盘关联" /></el-form-item></el-form><template #footer><el-button type="primary" @click="saveFavorite">保存</el-button></template></el-dialog>
    <el-dialog v-model="historyVisible" title="监控期间的指标快照" width="780px"><p class="hint">仅展示实际采集记录。缺失指标为暂无数据；单次数据不能构成增长趋势。</p><el-table :data="snapshots"><el-table-column label="观察时间" width="190"><template #default="{ row }">{{ time(row.observedAt) }}</template></el-table-column><el-table-column v-for="key in ['followers', 'likes', 'comments', 'favorites', 'views']" :key="key" :label="metricNames[key]"><template #default="{ row }">{{ number(row.item.metrics[key]) }}</template></el-table-column></el-table></el-dialog>
    <el-dialog v-model="analysisDialog" title="账号分析与选题" width="540px"><p>将当前平台的已收录数据交给助手，分析选题、发布节奏与互动表现，引用真实作品形成创作建议。使用所选模型额度。</p><workspacePicker v-model="directory" /><modelPopover v-model="model" v-model:reasoningEffort="reasoning" /><template #footer><el-button type="primary" :disabled="!directory || !model" @click="startAccountAnalysis">进入项目分析</el-button></template></el-dialog>
    <settings v-model="settingsVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { contentView as view } from "@/stores/contentInsights";
import { novaFlowState } from "@/stores/novaFlow";
import { useWorkspaceStore } from "@/stores/workspace";
import settings from "@/components/settings/index.vue";
import { getLastAgentModel, getAgentReasoning, modelChoices } from "@/stores/settings";
import http from "@/lib/http";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import workspacePicker from "@/pages/home/workspacePicker.vue";
import modelPopover from "@/components/modelPopover.vue";
import { platformNames, platformCapabilities, type ContentItem, type ContentImport, type ContentPage, type Subscription } from "@toonflow/server/contentInsights";

const router = useRouter(); const workspace = useWorkspaceStore();
const tabs = [{ id: "ranks", label: "平台热榜" }, { id: "discover", label: "爆款发现" }, { id: "own", label: "我的账号" }, { id: "monitors", label: "竞品监控" }, { id: "favorites", label: "选题收藏" }];
const capabilities = platformCapabilities;
const failedCovers = reactive(new Set<string>());
const metricNames: Record<string, string> = { likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享", views: "播放", followers: "粉丝", works: "作品", heat: "热度" };
const settingsVisible = ref(false);
type Favorite = { id: string; item: ContentItem; note: string; publishedUrl?: string; project?: string };
const state = reactive({ subscriptions: [] as Subscription[], favorites: [] as Favorite[], imports: [] as ContentImport[], alerts: [] as any[], analytics: [] as any[] });
const analysisDialog = ref(false);
const error = ref(""); const loading = ref(false); const refreshing = ref(false); const detailVisible = ref(!!view.selected); const scrollArea = ref<HTMLElement>();
const preview = ref(""); const previewImages = ref<string[]>([]); const previewLoading = ref(false); const transcribing = ref(false); const transcriptResult = ref<any>(null);
const groupFilter = ref(""); const group = ref("默认分组"); const threshold = ref(1000); const own = ref(false); const subscriptionDialog = ref(false);
const favoriteDialog = ref(false); const note = ref(""); const publishedUrl = ref(""); const projectLink = ref("");
const importDialog = ref(false); const importing = ref(false); const importMode = ref<"import" | "remix">("remix"); const directory = ref(workspace.project?.directory || ""); const goal = ref("");
const model = ref(getLastAgentModel()); const reasoning = ref(getAgentReasoning(model.value)); let requestId = crypto.randomUUID(); let waitingImport = "";
const historyVisible = ref(false); const snapshots = ref<any[]>([]); let timer: ReturnType<typeof setInterval>; let disposed = false;
const itemKey = (item: ContentItem) => `${item.platform}:${item.kind}:${item.id}`;
const time = (value: number) => new Date(value).toLocaleString("zh-CN");
const number = (value?: number) => value === undefined ? "暂无数据" : value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
const kindName = (kind: string) => ({ video: "视频", image: "图文", account: "账号", topic: "话题" }[kind]);
const metricKeys = (item: ContentItem) => Object.keys(item.metrics).slice(0, 4);
const visibleItems = computed(() => (view.result?.items || []).filter(item => !view.minLikes || (item.metrics.likes ?? -1) >= view.minLikes));
const shownSubscriptions = computed(() => state.subscriptions.filter(s => s.own === (view.tab === "own") && s.group.includes(groupFilter.value)));
const unsupported = computed(() => view.tab === "ranks" && !capabilities[view.platform][view.operation as "hot" | "surge" | "topics"]);
const identity = () => `${novaFlowState.value.account?.user_id}:${novaFlowState.value.account?.identity_scope}`;
const post = <T,>(path: string, data: unknown) => http<T>({ method: "POST", url: `/api/content/${path}`, data, timeout: 75000 });
function report(e: unknown) { error.value = e instanceof Error ? e.message : "操作未完成，请重试"; }
function switchTab(tab: string) { view.tab = tab; view.result = null; view.page = 1; view.operation = tab === "ranks" ? "hot" : "works"; }
function changePlatform() { view.result = null; view.page = 1; if (view.tab === "ranks") view.operation = capabilities[view.platform].hot ? "hot" : "topics"; }
async function search(reset = false) {
  if (loading.value) return; loading.value = true; error.value = ""; if (reset) view.page = 1;
  const owner = identity();
  try {
    const link = view.operation === "detail" ? view.keyword.match(/https?:\/\/[^\s]+/)?.[0] : undefined;
    const result = await post<ContentPage>("query", { platform: view.platform, operation: view.operation, keyword: view.keyword, page: view.page, date: view.date || undefined, category: view.category, sort: view.sort,
      ...(view.operation === "detail" ? link ? { url: link } : { id: view.keyword } : view.operation === "accountWorks" && view.selected ? { id: view.selected.lookupId || view.selected.id, keyword: view.selected.title } : {}) });
    if (owner === identity() && !disposed) view.result = result;
  } catch (e) { report(e); } finally { loading.value = false; }
}
async function refreshState() {
  if (refreshing.value || !novaFlowState.value.account) return; refreshing.value = true; const owner = identity();
  try {
    const value = await http<typeof state>({ method: "GET", url: "/api/content/state" });
    if (owner !== identity() || disposed) return;
    Object.assign(state, value);
    const done = state.imports.find(job => job.id === waitingImport && job.status === "ready");
    if (done) { waitingImport = ""; await openCanvas(done); }
  } catch (e) { if (!disposed) report(e); } finally { refreshing.value = false; }
}
function select(item: ContentItem) { view.selected = item; detailVisible.value = true; preview.value = ""; previewImages.value = []; transcriptResult.value = null; note.value = ""; publishedUrl.value = ""; }
async function manage(action: string, id: string) { try { await post("manage", { action, id }); await refreshState(); } catch (e) { report(e); } }
async function subscribe() { if (!view.selected) return; try { await post("manage", { action: "subscribe", id: itemKey(view.selected), group: group.value, own: own.value, threshold: threshold.value }); subscriptionDialog.value = false; ElMessage.success("账号已加入监控"); await refreshState(); } catch (e) { report(e); } }
async function saveFavorite() { if (!view.selected) return; try { await post("manage", { action: "favorite", id: itemKey(view.selected), note: note.value, publishedUrl: publishedUrl.value, project: projectLink.value }); favoriteDialog.value = false; await refreshState(); ElMessage.success("已保存收藏"); } catch (e) { report(e); } }
async function loadPreview() { if (!view.selected) return; previewLoading.value = true; const item = view.selected; try { const result = await post<{ video: string; images: string[] }>("preview", { id: itemKey(item) }); if (view.selected === item) { preview.value = result.video; previewImages.value = result.images; } } catch (e) { report(e); } finally { previewLoading.value = false; } }
async function loadTranscript() { if (!view.selected) return; transcribing.value = true; const item = view.selected; try { const value = await post("transcript", { id: itemKey(item), action: transcriptResult.value ? "status" : "submit" }); if (view.selected === item) transcriptResult.value = value; } catch (e) { report(e); } finally { transcribing.value = false; } }
async function showHistory(item: ContentItem) { try { snapshots.value = await post<any[]>("manage", { action: "history", id: itemKey(item) }); historyVisible.value = true; } catch (e) { report(e); } }
function accountWorks(sub: Subscription) { switchTab("discover"); view.selected = sub.item; view.platform = sub.item.platform; view.operation = "accountWorks"; view.keyword = sub.item.title; void search(true); }
function findAuthor() { if (!view.selected) return; const item = view.selected; switchTab("discover"); view.platform = item.platform; view.keyword = item.author; view.operation = "accounts"; detailVisible.value = false; void search(true); }
function findTopic() { if (!view.selected) return; const item = view.selected; switchTab("discover"); view.platform = item.platform; view.keyword = item.title; detailVisible.value = false; void search(true); }
function beginImport(item: ContentItem) { view.selected = item; requestId = crypto.randomUUID(); importDialog.value = true; goal.value = ""; }
async function submitImport() { if (!view.selected || importing.value) return; importing.value = true; try {
  const project = await workspace.addProject(directory.value);
  const job = await post<ContentImport>("import", { id: itemKey(view.selected), directory: project.directory, mode: importMode.value, goal: goal.value, requestId });
  waitingImport = job.id; importDialog.value = false; detailVisible.value = false; await refreshState();
} catch (e) { report(e); } finally { importing.value = false; } }
async function retryImport(job: ContentImport) { try { await post("import", { id: itemKey(job.item), directory: job.directory, mode: job.mode, goal: job.goal, requestId: job.id }); await refreshState(); } catch (e) { report(e); } }
async function cancelJob(job: ContentImport) { try { await post("cancel", { id: job.id }); if (waitingImport === job.id) waitingImport = ""; await refreshState(); } catch (e) { report(e); } }
async function openCanvas(job: ContentImport) {
  try {
    await workspace.openProject(job.directory); workspace.rememberCanvas(job.directory, job.canvas);
    if (job.mode === "remix") {
      const selected = modelChoices.value.find(value => value.value === model.value) || modelChoices.value.find(value => value.value === getLastAgentModel());
      if (!selected) { ElMessage.info("素材已导入，请在画布中选择模型后开始改编"); }
      else workspace.pendingAgentMessage = { directory: job.directory, model: selected.value, reasoningEffort: reasoning.value || getAgentReasoning(selected.value),
        prompt: `使用 contentInsights 技能处理已导入的参考作品。导入任务 ID：${job.id}，内容标识：${itemKey(job.item)}。当前画布：${job.canvas}。先读取来源节点和真实视频，使用已有逐帧拉片节点 startAnalysis 与 getAnalysisStatus 完成拆解，已有结果直接复用；使用 contentInsights 提取/查询文案。改编目标：${job.goal || "借鉴结构和节奏，替换为自己的品牌与素材"}。将资料交给对应专业技能完成中文分镜与真实依赖节点搭建，本轮不提交收费图片或视频生成。缺少品牌或产品资料只询问必要项。` };
    }
    await router.push("/workspace");
  } catch (e) { report(e); }
}
async function startAccountAnalysis() {
  try {
    const selected = modelChoices.value.find(value => value.value === model.value);
    if (!selected) throw new Error("请选择当前可用模型");
    await workspace.openProject(directory.value);
    const target = workspace.project!.directory;
    const canvas = `账号分析${crypto.randomUUID().slice(0, 8)}.json`;
    await useWorkspaceFiles(target).writeJson(canvas, { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    workspace.rememberCanvas(target, canvas);
    workspace.pendingAgentMessage = { directory: target, model: selected.value, reasoningEffort: reasoning.value,
      prompt: `使用内容洞察技能，先调用 contentInsights action=analysis 读取本机监控数据，分析其中 ${platformNames[view.platform]} 账号的已收录样本。对比我的账号与竞品的内容选题、公开互动、发布时间；引用具体作品链接和观察时间，区分事实与推断，不编造私有后台指标。将分析和可执行选题建议写入当前画布文本节点，本轮不提交媒体生成。` };
    await router.push("/workspace");
  } catch (e) { report(e); }
}
watch(identity, () => { state.subscriptions = []; state.favorites = []; state.imports = []; state.alerts = []; state.analytics = []; waitingImport = ""; detailVisible.value = false; void refreshState(); });
onMounted(async () => { await nextTick(); if (scrollArea.value) scrollArea.value.scrollTop = view.scroll; void refreshState(); timer = setInterval(() => { void refreshState(); }, 5000); });
onBeforeUnmount(() => { disposed = true; clearInterval(timer); });
</script>

<style scoped lang="scss">
.contentInsights { display: flex; height: 100%; min-height: 100vh; color: var(--el-text-color-primary); background: var(--el-bg-color);
  button { cursor: pointer; } .navigation { width: 210px; flex-shrink: 0; padding: 28px 18px; border-right: 1px solid var(--el-border-color); display: flex; flex-direction: column; gap: 9px; strong { font-size: 25px; margin-bottom: 22px; } button { text-align: left; padding: 13px 16px; border: 0; background: transparent; color: inherit; border-radius: 10px; font-size: 15px; &.active, &:hover { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } } .navTitle { margin: 22px 16px 6px; color: var(--el-text-color-secondary); font-size: 12px; } p { margin: auto 10px 0; padding-top: 48px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.8; } }
  main { flex: 1; height: 100vh; overflow: auto; padding: 36px 40px; min-width: 0; box-sizing: border-box; } header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; h1 { margin: 8px 0; font-size: 28px; } p { color: var(--el-text-color-secondary); } .eyebrow { font-size: 11px; letter-spacing: 3px; color: var(--el-color-primary); } }
  .filters { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0 12px; :deep(.el-select) { width: 160px; } :deep(.el-input) { width: 230px; } }
  .hint, time { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.8; } .warning { color: var(--el-color-warning); } .resultMeta { display: flex; justify-content: space-between; gap: 15px; align-items: center; color: var(--el-text-color-secondary); font-size: 12px; margin: 22px 0; label { display: flex; gap: 8px; align-items: center; } }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); gap: 20px; } .contentCard { padding: 0; overflow: hidden; border: 1px solid var(--el-border-color); border-radius: 14px; text-align: left; color: inherit; background: var(--el-bg-color-overlay); transition: transform .15s; &:hover { transform: translateY(-3px); border-color: var(--el-color-primary); } .cover { height: 200px; background: var(--el-fill-color); display: grid; place-items: center; position: relative; overflow: hidden; img { width: 100%; height: 100%; object-fit: cover; } &.avatar img { width: 90px; height: 90px; border-radius: 50%; } small { position: absolute; right: 10px; bottom: 10px; border-radius: 5px; padding: 4px 8px; background: #0009; color: white; } } .cardBody { padding: 16px; h3 { font-size: 15px; line-height: 1.6; height: 48px; overflow: hidden; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } p { color: var(--el-text-color-secondary); font-size: 12px; } } }
  .metrics { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; font-size: 12px; } .pagination { display: flex; gap: 20px; justify-content: center; margin: 30px; align-items: center; }
  .sectionActions { display: flex; justify-content: space-between; align-items: center; p { color: var(--el-text-color-secondary); font-size: 13px; max-width: 72%; line-height: 1.8; } } .groupFilter { max-width: 280px; margin: 15px 0; }
  .accountRows { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; } .accountRow, .favoriteRow { border: 1px solid var(--el-border-color); border-radius: 14px; padding: 22px; background: var(--el-bg-color-overlay); .accountHeading { display: flex; align-items: center; gap: 14px; img { width: 48px; height: 48px; border-radius: 50%; } h3 { margin: 0 0 7px; } span { font-size: 12px; color: var(--el-text-color-secondary); } } footer { display: flex; flex-wrap: wrap; gap: 8px; } }
  .favorites { display: grid; gap: 16px; margin-top: 25px; } .favoriteRow > button { border: 0; background: none; color: inherit; text-align: left; padding: 0; } .alerts, .imports { margin-top: 35px; padding-top: 20px; border-top: 1px solid var(--el-border-color); h2 { font-size: 18px; } } .imports article { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 0; border-bottom: 1px solid var(--el-border-color-lighter); > div { flex: 1; } p { font-size: 12px; color: var(--el-text-color-secondary); } }
  .videoPreview, .detailCover { max-width: 100%; max-height: 340px; display: block; margin: 20px auto; } .description { white-space: pre-wrap; line-height: 1.8; overflow-wrap: anywhere; } .detailActions { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; } .imageLinks { display: flex; gap: 10px; flex-wrap: wrap; } a { color: var(--el-color-primary); } :deep(.el-alert) { margin: 14px 0; }
  @media (max-width: 900px) { .navigation { width: 150px; padding: 20px 8px; } main { padding: 24px 20px; } .resultMeta { flex-wrap: wrap; } }
}
</style>
