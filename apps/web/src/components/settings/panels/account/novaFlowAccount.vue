<template>
  <div class="novaFlowAccount">
    <h2>NovaFlow</h2>
    <template v-if="state.account">
      <p>{{ state.account.display_name }}</p>
      <p>已连接 {{ state.models.length }} 个模型</p>
      <el-space wrap>
        <el-button :loading="busy" @click="refreshModels">刷新模型</el-button>
        <el-button tag="a" :href="state.accountUrl" target="_blank" rel="noopener noreferrer">账户管理与充值</el-button>
        <el-button type="danger" text :loading="busy" @click="logout">退出登录</el-button>
      </el-space>
      <el-table :data="state.models" maxHeight="480">
        <el-table-column prop="label" label="模型" />
        <el-table-column prop="group_name" label="分组" />
        <el-table-column prop="kind" label="类型" />
      </el-table>
    </template>
    <template v-else>
      <p>登录 NovaFlow，开始创作</p>
      <el-space wrap>
        <el-button type="primary" :loading="busy" :disabled="state.pending" @click="login">登录 NovaFlow</el-button>
        <el-button :disabled="busy || state.pending" @click="login">注册 NovaFlow</el-button>
      </el-space>
    </template>
    <div v-if="state.pending" role="status">
      <p>请在浏览器中完成登录和授权。</p>
      <el-button v-if="authorizeUrl" tag="a" :href="authorizeUrl" target="_blank" rel="noopener noreferrer">打开授权页面</el-button>
      <el-button text @click="cancel">取消</el-button>
    </div>
    <el-alert v-if="message || state.error" :title="message || state.error" type="error" :closable="false" showIcon />
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import http from "@/lib/http";
import { novaFlowState as state, refreshNovaFlowStatus } from "@/stores/novaFlow";
const busy = ref(false);
const message = ref("");
const authorizeUrl = ref("");
let polling: ReturnType<typeof setInterval> | undefined;
async function action(run: () => Promise<void>) {
  busy.value = true; message.value = "";
  try { await run(); } catch (error) { message.value = error instanceof Error ? error.message : "操作失败，请重试"; }
  finally { busy.value = false; await refreshNovaFlowStatus().catch(() => {}); }
}
function login() { return action(async () => {
  const result = await http<{ authorizeUrl: string }>({ method: "POST", url: "/api/channel/creator/start" });
  authorizeUrl.value = result.authorizeUrl;
  window.open(result.authorizeUrl, "_blank", "noopener,noreferrer");
}); }
function cancel() { return action(async () => { await http({ method: "POST", url: "/api/channel/creator/cancel" }); }); }
function logout() { return action(async () => { await http({ method: "POST", url: "/api/channel/creator/logout" }); }); }
function refreshModels() { return action(async () => { await http({ method: "POST", url: "/api/channel/creator/refresh", timeout: 70000 }); }); }
onMounted(() => { void refreshNovaFlowStatus(); polling = setInterval(() => { if (state.value.pending) void refreshNovaFlowStatus().catch(() => {}); }, 1000); });
onBeforeUnmount(() => { if (polling) clearInterval(polling); });
</script>
<style scoped lang="scss">
.novaFlowAccount { display: flex; flex-direction: column; gap: 16px; max-width: 880px; h2, p { margin: 0; } }
</style>
