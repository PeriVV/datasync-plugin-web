<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconBarChart,
  IconDownload,
  IconExclamationCircle,
  IconFile,
  IconPlus,
  IconRefresh,
  IconSafe,
  IconSettings,
  IconStorage,
  IconUpload,
} from '@arco-design/web-vue/es/icon'

const router = useRouter()

const updatedAt = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(/\//g, '-'),
)

const metrics = [
  { label: '待导出任务', value: '1', icon: IconFile, tone: 'orange' },
  { label: '待比对任务', value: '1', icon: IconBarChart, tone: 'blue' },
  { label: '表模型数量', value: '1', icon: IconStorage, tone: 'green' },
  { label: '支持能力数', value: '5', icon: IconSafe, tone: 'purple' },
  { label: '异常数量', value: '0', icon: IconExclamationCircle, tone: 'red' },
]

const quickEntries = [
  { label: '新增连接', icon: IconPlus, route: '/settings' },
  { label: '生成离线包', icon: IconUpload, route: '/export' },
  { label: '导入数据包', icon: IconDownload, route: '/import' },
  { label: '执行比对', icon: IconBarChart, route: '/compare' },
  { label: '执行同步', icon: IconRefresh, route: '/sync' },
  { label: '任务备份', icon: IconSafe, route: '/backup' },
  { label: '表模型配置', icon: IconStorage, route: '/profiles' },
  { label: '基础配置', icon: IconSettings, route: '/dashboard' },
]

const historyTasks = [
  { type: '导出', title: '任务 1896780229075202049 离线包已生成', desc: '2026-05-09 09:30 / zy_all_new' },
  { type: '比对', title: '任务 T-099 差异比对已完成', desc: '2026-05-08 18:20 / 增量模式' },
  { type: '同步', title: '任务 T-098 在线同步已完成', desc: '2026-05-08 16:45 / 中心库到节点库' },
  { type: '备份', title: '任务 T-097 备份表已留痕', desc: '2026-05-07 11:10 / 备份批次标识' },
  { type: '配置', title: '业务表模型校验已通过', desc: '2026-05-07 10:05 / 识别表：任务主表' },
]

const notices = [
  { label: '服务入口', value: 'DataSyncPluginServerApplication' },
  { label: '接口接入', value: '前端通过 /api 访问后端服务' },
  { label: '数据库方言', value: 'MySQL、DM8' },
  { label: '离线包内容', value: '数据脚本、附件、清单和日志' },
]
</script>

<template>
  <div class="workbench-page">
    <section class="workbench-title-card">
      <div class="title-left">
        <div class="title-icon">
          <icon-refresh />
        </div>
        <div>
          <h1>工作中心</h1>
          <p>数据同步插件接入与执行中心</p>
        </div>
      </div>
      <div class="title-time">更新时间：{{ updatedAt }}</div>
    </section>

    <section class="summary-grid">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <div class="metric-icon" :class="metric.tone">
          <component :is="metric.icon" />
        </div>
        <div>
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.label }}</span>
        </div>
      </article>
    </section>

    <section class="quick-card">
      <h2>快捷入口</h2>
      <div class="quick-grid">
        <button
          v-for="entry in quickEntries"
          :key="entry.label"
          class="quick-entry"
          type="button"
          @click="router.push(entry.route)"
        >
          <span>
            <component :is="entry.icon" />
          </span>
          <strong>{{ entry.label }}</strong>
        </button>
      </div>
    </section>

    <section class="dashboard-panels">
      <article class="task-panel">
        <div class="panel-header">
          <h2>
            <icon-file />
            历史处理任务
          </h2>
          <span>5 项</span>
        </div>
        <div class="task-list">
          <div v-for="task in historyTasks" :key="task.title" class="task-row">
            <a-tag color="blue">{{ task.type }}</a-tag>
            <div>
              <strong>{{ task.title }}</strong>
              <span>{{ task.desc }}</span>
            </div>
          </div>
        </div>
        <button class="panel-more" type="button" @click="router.push('/overview')">查看全部</button>
      </article>

      <article class="task-panel">
        <div class="panel-header">
          <h2>
            <icon-exclamation-circle />
            接入提醒
          </h2>
          <span>4 条</span>
        </div>
        <div class="notice-list">
          <div v-for="notice in notices" :key="notice.label" class="notice-row">
            <strong>{{ notice.label }}</strong>
            <span>{{ notice.value }}</span>
          </div>
        </div>
        <button class="panel-more" type="button" @click="router.push('/dashboard')">查看全部</button>
      </article>
    </section>
  </div>
</template>
