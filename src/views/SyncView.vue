<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { IconArrowRight, IconRefresh, IconSearch } from '@arco-design/web-vue/es/icon'
import { compareData, syncData } from '../api/datasync'
import { listColumns, listDataSources, listTables } from '../api/datasource'
import FieldLabel from '../components/FieldLabel.vue'

const booting = ref(false)
const tableLoading = ref(false)
const compareLoading = ref(false)
const syncLoading = ref(false)
const compareResult = ref(null)
const syncResult = ref(null)
const dataSources = ref([])
const tableRows = ref([])

const form = reactive({
  sourceId: '',
  targetId: '',
  tableMode: 'all',
})

const tableColumns = [
  { title: '同步', slotName: 'selected', width: 72 },
  { title: '表名', dataIndex: 'tableName', width: 220 },
  { title: '同步字段', slotName: 'columns' },
  { title: '源字段数', dataIndex: 'sourceColumnCount', width: 96 },
  { title: '目标字段数', dataIndex: 'targetColumnCount', width: 96 },
]

const diffColumns = [
  { title: '表名', dataIndex: 'table', width: 220 },
  { title: '源行数', dataIndex: 'sourceCount', width: 96 },
  { title: '目标行数', dataIndex: 'targetCount', width: 96 },
  { title: '待插入', dataIndex: 'insertRecords', width: 96 },
  { title: '待更新', dataIndex: 'updateRecords', width: 96 },
  { title: '待删除', dataIndex: 'deleteRecords', width: 96 },
  { title: '状态', slotName: 'consistent', width: 96 },
  { title: '字段', slotName: 'columns' },
]

const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)
const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)
const selectedTableRows = computed(() => {
  const rows = form.tableMode === 'all'
    ? tableRows.value
    : tableRows.value.filter((row) => row.selected)
  return rows.filter((row) => row.selectedColumns.length > 0)
})
const diffRows = computed(() => (compareResult.value?.tables || []).map(normalizeDiffRow))
const summary = computed(() => {
  const fromServer = compareResult.value?.summary || {}
  return {
    totalTables: Number(fromServer.totalTables || diffRows.value.length),
    inconsistentTables: Number(fromServer.inconsistentTables || diffRows.value.filter((row) => !row.consistent).length),
    insertRecords: Number(fromServer.insertRecords || diffRows.value.reduce((sum, row) => sum + row.insertRecords, 0)),
    updateRecords: Number(fromServer.updateRecords || diffRows.value.reduce((sum, row) => sum + row.updateRecords, 0)),
    deleteRecords: Number(fromServer.deleteRecords || diffRows.value.reduce((sum, row) => sum + row.deleteRecords, 0)),
  }
})
const canSync = computed(() => Boolean(compareResult.value) && selectedTableRows.value.length > 0)

function normalizeName(row) {
  return row.tableName || row.TABLE_NAME || row.table || Object.values(row)[0]
}

function normalizeColumn(row) {
  return row.columnName || row.COLUMN_NAME || row.Field || row.field || Object.values(row)[0]
}

function normalizeDiffRow(row) {
  return {
    ...row,
    sourceCount: Number(row.sourceCount ?? row.sourceRows ?? 0),
    targetCount: Number(row.targetCount ?? row.targetRows ?? 0),
    insertRecords: Number(row.insertRecords ?? row.sourceOnlyKeys?.length ?? 0),
    updateRecords: Number(row.updateRecords ?? row.changedKeys?.length ?? 0),
    deleteRecords: Number(row.deleteRecords ?? row.targetOnlyKeys?.length ?? 0),
    columns: row.columns || [],
  }
}

function parseHost(url) {
  const text = String(url || '')
  const match = text.match(/\/\/([^/?]+)/)
  return match ? match[1] : '-'
}

function parseDatabase(url) {
  const text = String(url || '')
  const schema = text.match(/[?&]SCHEMA=([^&]+)/i)
  if (schema) {
    return decodeURIComponent(schema[1])
  }
  const database = text.match(/\/\/[^/]+\/([^?]+)/)
  return database ? decodeURIComponent(database[1]) : '-'
}

function endpointInfo(item) {
  return [
    { label: '连接', value: item?.name || '-' },
    { label: '类型', value: item?.type || '-' },
    { label: '主机', value: parseHost(item?.url) },
    { label: '数据库', value: parseDatabase(item?.url) },
  ]
}

function buildPayload() {
  return {
    sourceId: selectedSource.value.id,
    sourceType: selectedSource.value.type,
    sourceName: selectedSource.value.name,
    targetId: selectedTarget.value.id,
    targetType: selectedTarget.value.type,
    targetName: selectedTarget.value.name,
    tables: selectedTableRows.value.map((row) => ({
      tableName: row.tableName,
      columns: row.selectedColumns,
    })),
  }
}

async function loadOptions() {
  booting.value = true
  try {
    const sources = await listDataSources()
    dataSources.value = Array.isArray(sources) ? sources : []
    if (!form.sourceId && dataSources.value.length) {
      form.sourceId = String(dataSources.value[0].id)
    }
    if (!form.targetId && dataSources.value.length > 1) {
      form.targetId = String(dataSources.value[1].id)
    }
    await refreshTables()
  } finally {
    booting.value = false
  }
}

async function refreshTables() {
  compareResult.value = null
  syncResult.value = null
  if (!selectedSource.value || !selectedTarget.value || String(form.sourceId) === String(form.targetId)) {
    tableRows.value = []
    return
  }
  tableLoading.value = true
  try {
    const [sourceTables, targetTables] = await Promise.all([
      listTables(selectedSource.value),
      listTables(selectedTarget.value),
    ])
    const targetNames = new Set((targetTables || []).map((row) => String(normalizeName(row)).toLowerCase()))
    const commonTables = (sourceTables || [])
      .map((row) => String(normalizeName(row)))
      .filter((name) => name && targetNames.has(name.toLowerCase()))
    const rows = []
    for (const tableName of commonTables) {
      const [sourceColumns, targetColumns] = await Promise.all([
        listColumns(selectedSource.value, tableName),
        listColumns(selectedTarget.value, tableName),
      ])
      const targetColumnNames = new Set((targetColumns || []).map((row) => String(normalizeColumn(row)).toLowerCase()))
      const commonColumns = (sourceColumns || [])
        .map((row) => String(normalizeColumn(row)))
        .filter((name) => name && targetColumnNames.has(name.toLowerCase()))
      rows.push({
        tableName,
        selected: true,
        columns: commonColumns,
        selectedColumns: [...commonColumns],
        sourceColumnCount: (sourceColumns || []).length,
        targetColumnCount: (targetColumns || []).length,
      })
    }
    tableRows.value = rows
  } finally {
    tableLoading.value = false
  }
}

function validateSelection() {
  if (!selectedSource.value || !selectedTarget.value) {
    Message.warning('请选择源库和目标库')
    return false
  }
  if (String(form.sourceId) === String(form.targetId)) {
    Message.warning('源库和目标库不能是同一个连接')
    return false
  }
  if (!selectedTableRows.value.length) {
    Message.warning('请选择至少一张表和一个字段')
    return false
  }
  return true
}

function setRowSelected(row, checked) {
  row.selected = checked
  compareResult.value = null
  syncResult.value = null
}

function setSelectedColumns(row, value) {
  row.selectedColumns = value
  compareResult.value = null
  syncResult.value = null
}

async function runCompare() {
  if (!validateSelection()) {
    return
  }
  compareLoading.value = true
  try {
    const { data } = await compareData(buildPayload())
    compareResult.value = data
    syncResult.value = null
    Message.success('比对完成')
  } finally {
    compareLoading.value = false
  }
}

async function runSync() {
  if (!canSync.value || !validateSelection()) {
    Message.warning('请先完成差异比对')
    return
  }
  Modal.confirm({
    title: '确认同步',
    content: `将把 ${selectedSource.value.name} 的 ${selectedTableRows.value.length} 张表同步到 ${selectedTarget.value.name}。`,
    okText: '开始同步',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    async onOk() {
      syncLoading.value = true
      try {
        const { data } = await syncData(buildPayload())
        syncResult.value = data
        Message.success('同步完成')
      } finally {
        syncLoading.value = false
      }
    },
  })
}

watch(() => [form.sourceId, form.targetId], refreshTables)
watch(() => form.tableMode, () => {
  compareResult.value = null
  syncResult.value = null
})
onMounted(loadOptions)
</script>

<template>
  <div>
    <a-card class="form-card sync-config-card" :loading="booting" title="比对同步">
      <a-form layout="vertical">
        <div class="sync-endpoint-row">
          <section class="sync-endpoint-panel">
            <h2>源数据库</h2>
            <a-form-item label="连接">
              <a-select v-model="form.sourceId" placeholder="请选择源数据库">
                <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                  {{ item.name }} · {{ item.type }}
                </a-option>
              </a-select>
            </a-form-item>
            <dl class="endpoint-info compact">
              <template v-for="item in endpointInfo(selectedSource)" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>
          </section>

          <div class="sync-direction">
            <icon-arrow-right />
          </div>

          <section class="sync-endpoint-panel target">
            <h2>目标数据库</h2>
            <a-form-item label="连接">
              <a-select v-model="form.targetId" placeholder="请选择目标数据库">
                <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                  {{ item.name }} · {{ item.type }}
                </a-option>
              </a-select>
            </a-form-item>
            <dl class="endpoint-info compact">
              <template v-for="item in endpointInfo(selectedTarget)" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>
          </section>
        </div>

        <a-row :gutter="16" class="sync-range-row">
          <a-col :span="12">
            <a-form-item>
              <template #label>
                <FieldLabel label="同步范围" tip="选择全部数据库表时，会同步源库和目标库都存在的表；选择勾选表时，只同步下方已勾选的表。" />
              </template>
              <a-radio-group v-model="form.tableMode" type="button">
                <a-radio value="all">全部数据库表</a-radio>
                <a-radio value="selected">勾选的数据库表</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <div class="action-row sync-action-row">
              <a-button :loading="tableLoading" @click="refreshTables">
                <template #icon><icon-refresh /></template>
                刷新表字段
              </a-button>
              <a-button type="primary" :loading="compareLoading" @click="runCompare">
                <template #icon><icon-search /></template>
                比对差异
              </a-button>
              <a-button type="primary" status="danger" :disabled="!canSync" :loading="syncLoading" @click="runSync">
                开始同步
              </a-button>
            </div>
          </a-col>
        </a-row>
      </a-form>
    </a-card>

    <a-card class="table-card sync-table-card" title="表和字段">
      <a-table :columns="tableColumns" :data="tableRows" :loading="tableLoading" :pagination="{ pageSize: 10 }" row-key="tableName">
        <template #selected="{ record }">
          <a-checkbox
            :disabled="form.tableMode === 'all'"
            :model-value="form.tableMode === 'all' || record.selected"
            @change="(checked) => setRowSelected(record, checked)"
          />
        </template>
        <template #columns="{ record }">
          <a-select
            :model-value="record.selectedColumns"
            multiple
            allow-clear
            placeholder="请选择字段"
            @change="(value) => setSelectedColumns(record, value)"
          >
            <a-option v-for="column in record.columns" :key="column" :value="column">
              {{ column }}
            </a-option>
          </a-select>
        </template>
      </a-table>
    </a-card>

    <a-card class="table-card sync-table-card" title="差异结果">
      <div class="diff-summary">
        <article><span>参与表</span><strong>{{ summary.totalTables }}</strong></article>
        <article><span>差异表</span><strong>{{ summary.inconsistentTables }}</strong></article>
        <article><span>待插入</span><strong>{{ summary.insertRecords }}</strong></article>
        <article><span>待更新</span><strong>{{ summary.updateRecords }}</strong></article>
        <article><span>待删除</span><strong>{{ summary.deleteRecords }}</strong></article>
      </div>
      <a-table :columns="diffColumns" :data="diffRows" :pagination="{ pageSize: 10 }" row-key="table">
        <template #consistent="{ record }">
          <a-tag :color="record.consistent ? 'green' : 'orange'">{{ record.consistent ? '一致' : '有差异' }}</a-tag>
        </template>
        <template #columns="{ record }">
          {{ record.columns?.join(', ') || '-' }}
        </template>
      </a-table>
      <a-empty v-if="!compareResult" description="先点击比对差异，确认结果后才能同步。" />
      <a-timeline v-if="syncResult?.phases?.length" mode="left" class="sync-timeline">
        <a-timeline-item v-for="item in syncResult.phases" :key="item.phase" :label="item.phase">
          <a-tag :color="item.status === '已完成' ? 'green' : 'gray'">{{ item.status }}</a-tag>
          <span class="timeline-detail">{{ item.detail }}</span>
        </a-timeline-item>
      </a-timeline>
    </a-card>
  </div>
</template>
