<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    default: null,
  },
  emptyText: {
    type: String,
    default: '提交表单后会在这里显示结果。',
  },
})

const keyLabels = {
  success: '是否成功',
  packageName: '离线包名称',
  outputPath: '输出路径',
  profile: '数据库模型',
  manifest: '导出清单',
  generatedAt: '生成时间',
  taskIds: '任务标识列表',
  tables: '表列表',
  table: '表名',
  rows: '行数',
  inputPath: '离线包路径',
  targetEnv: '目标环境',
  finishedAt: '完成时间',
  inserted: '新增数量',
  updated: '更新数量',
  skipped: '跳过数量',
  failed: '失败数量',
  mode: '模式',
  taskId: '任务标识',
  summary: '汇总',
  totalTables: '表总数',
  consistentTables: '一致表数量',
  inconsistentTables: '差异表数量',
  insertRecords: '待插入记录',
  updateRecords: '待更新记录',
  deleteRecords: '待删除记录',
  sourceRows: '源库行数',
  targetRows: '目标库行数',
  sourceCount: '源库行数',
  targetCount: '目标库行数',
  consistent: '是否一致',
  sourceOnly: '仅源库存在',
  targetOnly: '仅目标库存在',
  changed: '内容变化',
  sourceOnlyKeys: '仅源库存在的键',
  targetOnlyKeys: '仅目标库存在的键',
  changedKeys: '内容变化的键',
  synced: '同步成功',
  rowsWritten: '写入行数',
  filesCopied: '复制附件数',
  phases: '执行阶段',
  phase: '阶段',
  status: '状态',
  detail: '说明',
  backupTag: '备份批次标识',
  rowsCopied: '复制行数',
  writtenTables: '写入备份表',
}

function translateValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => translateValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [keyLabels[key] || key, translateValue(item)]),
    )
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (value === 'incremental') {
    return '增量模式'
  }
  if (value === 'full') {
    return '全量模式'
  }
  if (value === 'center') {
    return '中心库'
  }
  if (value === 'node') {
    return '节点库'
  }
  if (value === 'imported') {
    return '导入目标库'
  }
  if (value === 'zy_all_new') {
    return '业务数据库模型'
  }
  return value
}

const displayData = computed(() => (props.data ? translateValue(props.data) : null))
</script>

<template>
  <a-card class="result-panel" :title="title">
    <template v-if="props.data">
      <pre>{{ JSON.stringify(displayData, null, 2) }}</pre>
    </template>
    <a-empty v-else :description="emptyText" />
  </a-card>
</template>
