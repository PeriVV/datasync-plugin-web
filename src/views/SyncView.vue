<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { IconArrowRight, IconRefresh } from '@arco-design/web-vue/es/icon'
import { compareData, syncData } from '../api/datasync'
import { fetchTableProfile, listTableProfiles } from '../api/config'
import { listColumns, listDataSources, listTables } from '../api/datasource'
import PageHero from '../components/PageHero.vue'

const currentStep = ref(1)
const booting = ref(false)
const tableLoading = ref(false)
const compareLoading = ref(false)
const syncLoading = ref(false)
const dataSources = ref([])
const profiles = ref([])
const selectedProfile = ref(null)
const sourceTables = ref([])
const targetTables = ref([])
const tableRows = ref([])
const mappingMessage = ref('')
const compareResult = ref(null)
const syncResult = ref(null)

const form = reactive({
  sourceId: '',
  targetId: '',
  scopeMode: 'FULL_DATABASE',
  selectedTables: [],
  profile: '',
  businessValue: '',
  syncPolicy: 'INSERT_UPDATE',
  conflictPolicy: 'SOURCE_WINS',
  fieldMismatchPolicy: 'INTERSECTION',
  failurePolicy: 'ROLLBACK',
  attachmentPolicy: 'NONE',
})

const mappingColumns = [
  { title: '参与', slotName: 'selected', width: 72, fixed: 'left' },
  { title: '源表', slotName: 'sourceTable', width: 180, fixed: 'left' },
  { title: '目标表', slotName: 'targetTable', width: 220 },
  { title: '主键字段', slotName: 'keyColumns', width: 220 },
  { title: '同步字段', slotName: 'fields', width: 280 },
  { title: '匹配情况', slotName: 'matching', width: 210 },
  { title: '人工确认', slotName: 'confirmed', width: 120, fixed: 'right' },
]

const diffColumns = [
  { title: '源表', slotName: 'diffSourceTable', width: 190 },
  { title: '目标表', slotName: 'diffTargetTable', width: 190 },
  { title: '源行数', dataIndex: 'sourceCount', width: 90 },
  { title: '目标行数', dataIndex: 'targetCount', width: 90 },
  { title: '待插入', dataIndex: 'insertRecords', width: 90 },
  { title: '待更新', dataIndex: 'updateRecords', width: 90 },
  { title: '待删除', dataIndex: 'deleteRecords', width: 90 },
  { title: '比对状态', slotName: 'consistent', width: 100 },
]

const scopeOptions = [
  { value: 'FULL_DATABASE', title: '全库比对', description: '加载源库全部业务表，并自动匹配目标库同名表。' },
  { value: 'SELECTED_TABLES', title: '勾选数据表比对', description: '手动选择本次参与比对的源数据库表。' },
  { value: 'BUSINESS_MODEL', title: '按业务模型比对', description: '只加载数据库模板配置的主表和关联业务表。' },
]

const policyGroups = [
  {
    key: 'syncPolicy', title: '写入策略',
    options: [
      { value: 'INSERT_UPDATE', label: '新增并更新', description: '插入目标库缺失数据，并更新内容不同的数据。' },
      { value: 'INSERT_ONLY', label: '仅新增', description: '只插入目标库不存在的数据，不修改已有数据。' },
      { value: 'UPDATE_ONLY', label: '仅更新', description: '只更新两边都存在但内容不同的数据。' },
    ],
  },
  {
    key: 'conflictPolicy', title: '冲突处理',
    options: [
      { value: 'SOURCE_WINS', label: '源库优先', description: '冲突时使用源库数据更新目标库。' },
      { value: 'TARGET_WINS', label: '目标库优先', description: '保留目标库已有内容，跳过冲突更新。' },
      { value: 'MANUAL_CONFIRM', label: '人工确认', description: '执行前再次确认存在内容差异的数据。' },
    ],
  },
  {
    key: 'fieldMismatchPolicy', title: '字段不一致处理',
    options: [
      { value: 'INTERSECTION', label: '跳过不一致字段', description: '仅同步源表和目标表中的同名字段。' },
      { value: 'MANUAL_CONFIRM', label: '人工确认字段映射', description: '按第二步人工确认的字段范围执行。' },
    ],
  },
  {
    key: 'failurePolicy', title: '失败处理',
    options: [
      { value: 'ROLLBACK', label: '遇到失败立即停止', description: '任一表失败时回滚本次同步。' },
      { value: 'SKIP_FAILED_TABLE', label: '跳过失败继续同步', description: '回滚失败表并继续同步其他表。' },
    ],
  },
  {
    key: 'attachmentPolicy', title: '附件处理',
    options: [
      { value: 'NONE', label: '不同步附件', description: '不处理附件记录和实际文件。' },
      { value: 'RECORDS', label: '同步附件记录', description: '同步附件数据表记录，不复制实际文件。' },
      { value: 'FILES', label: '同步实际附件文件', description: '同步附件记录，并复制实际附件文件。' },
    ],
  },
]

const selectedSource = computed(() => dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null)
const selectedTarget = computed(() => dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null)
const businessIdentifierName = computed(() => selectedProfile.value?.businessIdentifierName || '业务标识值')
const businessSourceTables = computed(() => sourceTables.value.filter(isBusinessTable))
const businessTargetTables = computed(() => targetTables.value.filter(isBusinessTable))
const selectedRows = computed(() => tableRows.value.filter((row) =>
  row.selected && row.targetTableName && row.selectedColumns.length && row.keyColumns.length && row.confirmed,
))
const diffRows = computed(() => (compareResult.value?.tables || []).map((row) => ({
  ...row,
  sourceTable: row.sourceTable || row.table,
  targetTable: row.targetTable || row.table,
  sourceCount: Number(row.sourceCount || 0),
  targetCount: Number(row.targetCount || 0),
  insertRecords: Number(row.insertRecords || row.sourceOnlyKeys?.length || 0),
  updateRecords: Number(row.updateRecords || row.changedKeys?.length || 0),
  deleteRecords: Number(row.deleteRecords || row.targetOnlyKeys?.length || 0),
})))
const summary = computed(() => {
  const value = compareResult.value?.summary || {}
  return {
    totalTables: Number(value.totalTables || diffRows.value.length),
    inconsistentTables: Number(value.inconsistentTables || diffRows.value.filter((row) => !row.consistent).length),
    insertRecords: Number(value.insertRecords || diffRows.value.reduce((sum, row) => sum + row.insertRecords, 0)),
    updateRecords: Number(value.updateRecords || diffRows.value.reduce((sum, row) => sum + row.updateRecords, 0)),
    deleteRecords: Number(value.deleteRecords || diffRows.value.reduce((sum, row) => sum + row.deleteRecords, 0)),
  }
})
const hasDifferences = computed(() => summary.value.insertRecords + summary.value.updateRecords + summary.value.deleteRecords > 0)
const attachmentCount = computed(() => {
  if (form.attachmentPolicy === 'NONE') return 0
  return diffRows.value.filter((row) => isAttachmentTable(row.sourceTable))
    .reduce((sum, row) => sum + row.sourceCount, 0)
})

function normalizeName(row) {
  return String(row?.tableName || row?.TABLE_NAME || row?.table || Object.values(row || {})[0] || '')
}

function columnInfo(row) {
  return {
    name: String(row?.columnName || row?.COLUMN_NAME || row?.Field || row?.field || Object.values(row || {})[0] || ''),
    primary: String(row?.Key || row?.KEY || row?.columnKey || row?.COLUMN_KEY || '').toUpperCase() === 'PRI'
      || row?.primaryKey === true,
  }
}

function sameName(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function isBusinessTable(table) {
  const name = String(table || '').toLowerCase()
  return name && !name.startsWith('datasync_') && !name.startsWith('flyway_')
}

function isAttachmentTable(table) {
  const name = String(table || '').toLowerCase()
  const configured = (selectedProfile.value?.autoTaskTables || []).find((item) => sameName(item.tableName, table))
  return Boolean(configured?.fileTable) || name.includes('file') || name.includes('attachment')
}

function databaseName(item) {
  const url = String(item?.url || '')
  const schemaMatch = url.match(/[?&]SCHEMA=([^&]+)/i)
  if (schemaMatch?.[1]) return decodeURIComponent(schemaMatch[1])
  const databaseMatch = url.match(/^jdbc:[a-z0-9-]+:\/\/(?:\[[^\]]+\]|[^/?#:]+)(?::\d+)?\/([^?]*)/i)
  return databaseMatch?.[1] ? decodeURIComponent(databaseMatch[1]) : '-'
}

function endpointLabel(item) {
  return item?.name || '未选择'
}

function errorMessage(error, fallback) {
  return error?.message || fallback
}

function renderCondition(template) {
  if (!template) return '1 = 1'
  const value = String(form.businessValue || '').replaceAll("'", "''")
  return String(template).replace(/\$\{[^}]+\}/g, value)
}

function resetResults() {
  compareResult.value = null
  syncResult.value = null
}

async function loadEndpointTables() {
  sourceTables.value = []
  targetTables.value = []
  tableRows.value = []
  mappingMessage.value = ''
  resetResults()
  if (!selectedSource.value || !selectedTarget.value || sameName(form.sourceId, form.targetId)) return
  tableLoading.value = true
  try {
    const [source, target] = await Promise.all([listTables(selectedSource.value), listTables(selectedTarget.value)])
    sourceTables.value = (source || []).map(normalizeName).filter(Boolean)
    targetTables.value = (target || []).map(normalizeName).filter(Boolean)
    form.selectedTables = form.selectedTables.filter((table) => businessSourceTables.value.includes(table))
  } catch (error) {
    Message.error(errorMessage(error, '加载数据库表失败'))
  } finally {
    tableLoading.value = false
  }
}

async function loadProfile() {
  selectedProfile.value = null
  if (!form.profile) return
  try {
    selectedProfile.value = await fetchTableProfile(form.profile)
  } catch (error) {
    Message.error(errorMessage(error, '加载数据库模板失败'))
  }
}

function scopeCandidates() {
  if (form.scopeMode === 'SELECTED_TABLES') {
    return form.selectedTables.map((tableName) => ({ tableName, condition: '1 = 1' }))
  }
  if (form.scopeMode === 'BUSINESS_MODEL') {
    return (selectedProfile.value?.autoTaskTables || [])
      .filter((item) => item.tableName && businessSourceTables.value.some((table) => sameName(table, item.tableName)))
      .map((item) => ({
        tableName: businessSourceTables.value.find((table) => sameName(table, item.tableName)) || item.tableName,
        condition: renderCondition(item.taskConditionTemplate),
        attachmentTable: Boolean(item.fileTable),
      }))
  }
  return businessSourceTables.value.map((tableName) => ({ tableName, condition: '1 = 1' }))
}

function determineMappingMessage(candidates) {
  if (!sourceTables.value.length) return '源库没有数据表，请检查数据库连接和访问权限。'
  if (!businessSourceTables.value.length) return '当前选择的是平台配置库，未检测到业务表。'
  if (!targetTables.value.length) return '目标库没有数据表，请先创建目标表结构。'
  if (!businessTargetTables.value.length) return '目标库没有业务表，无法自动匹配源表。'
  if (!candidates.length && form.scopeMode === 'BUSINESS_MODEL') return '当前数据库模板配置的主表和关联表在源库中不存在。'
  if (!candidates.length) return '当前同步范围没有可加载的源表。'
  return ''
}

async function buildMappingRow(candidate) {
  const targetTableName = businessTargetTables.value.find((table) => sameName(table, candidate.tableName)) || ''
  const [sourceResult, targetResult] = await Promise.all([
    listColumns(selectedSource.value, candidate.tableName),
    targetTableName ? listColumns(selectedTarget.value, targetTableName) : Promise.resolve([]),
  ])
  const sourceInfo = (sourceResult || []).map(columnInfo).filter((item) => item.name)
  const targetInfo = (targetResult || []).map(columnInfo).filter((item) => item.name)
  const sourceColumns = sourceInfo.map((item) => item.name)
  const targetColumns = targetInfo.map((item) => item.name)
  const commonColumns = sourceColumns.filter((column) => targetColumns.some((target) => sameName(column, target)))
  const primaryKeys = sourceInfo.filter((item) => item.primary)
    .map((item) => commonColumns.find((column) => sameName(column, item.name)))
    .filter(Boolean)
  const unmatchedSource = sourceColumns.filter((column) => !targetColumns.some((target) => sameName(column, target)))
  const unmatchedTarget = targetColumns.filter((column) => !sourceColumns.some((source) => sameName(column, source)))
  const exactMatch = Boolean(targetTableName && commonColumns.length && !unmatchedSource.length && !unmatchedTarget.length)
  return {
    sourceTableName: candidate.tableName,
    targetTableName,
    sourceCondition: candidate.condition,
    targetCondition: candidate.condition,
    attachmentTable: candidate.attachmentTable || isAttachmentTable(candidate.tableName),
    sourceColumns,
    targetColumns,
    commonColumns,
    selectedColumns: [...commonColumns],
    keyColumns: primaryKeys.length ? primaryKeys : commonColumns.slice(0, 1),
    unmatchedSource,
    unmatchedTarget,
    selected: Boolean(targetTableName && commonColumns.length),
    autoMatched: Boolean(targetTableName),
    requiresConfirmation: !exactMatch,
    confirmed: exactMatch,
  }
}

async function refreshMappings() {
  if (!validateDirection() || !validateScope()) return false
  tableLoading.value = true
  mappingMessage.value = ''
  resetResults()
  try {
    const candidates = scopeCandidates()
    mappingMessage.value = determineMappingMessage(candidates)
    if (mappingMessage.value) {
      tableRows.value = []
      return false
    }
    tableRows.value = await Promise.all(candidates.map(buildMappingRow))
    if (!tableRows.value.some((row) => row.targetTableName)) {
      mappingMessage.value = '目标库没有同名表。请在“目标表”列中手动选择对应表，或先补齐目标库表结构。'
    }
    return tableRows.value.length > 0
  } catch (error) {
    tableRows.value = []
    mappingMessage.value = errorMessage(error, '加载表和字段失败')
    Message.error(mappingMessage.value)
    return false
  } finally {
    tableLoading.value = false
  }
}

async function changeTargetTable(row, tableName) {
  row.targetTableName = tableName || ''
  row.autoMatched = sameName(row.sourceTableName, tableName)
  row.confirmed = false
  row.requiresConfirmation = true
  row.targetColumns = []
  row.commonColumns = []
  row.selectedColumns = []
  row.keyColumns = []
  row.unmatchedSource = [...row.sourceColumns]
  row.unmatchedTarget = []
  resetResults()
  if (!tableName) return
  try {
    const result = await listColumns(selectedTarget.value, tableName)
    row.targetColumns = (result || []).map(columnInfo).map((item) => item.name).filter(Boolean)
    row.commonColumns = row.sourceColumns.filter((column) => row.targetColumns.some((target) => sameName(column, target)))
    row.selectedColumns = [...row.commonColumns]
    row.keyColumns = row.commonColumns.slice(0, 1)
    row.unmatchedSource = row.sourceColumns.filter((column) => !row.targetColumns.some((target) => sameName(column, target)))
    row.unmatchedTarget = row.targetColumns.filter((column) => !row.sourceColumns.some((source) => sameName(column, source)))
    row.selected = row.commonColumns.length > 0
  } catch (error) {
    Message.error(errorMessage(error, `加载目标表 ${tableName} 字段失败`))
  }
}

function mappingChanged(row) {
  row.confirmed = false
  row.requiresConfirmation = true
  for (const key of row.keyColumns) {
    if (!row.selectedColumns.includes(key)) row.selectedColumns.unshift(key)
  }
  resetResults()
}

function validateDirection() {
  if (!selectedSource.value || !selectedTarget.value) {
    Message.warning('请选择源数据库和目标数据库')
    return false
  }
  if (sameName(form.sourceId, form.targetId)) {
    Message.warning('源数据库和目标数据库不能是同一个连接')
    return false
  }
  return true
}

function validateScope() {
  if (form.scopeMode === 'SELECTED_TABLES' && !form.selectedTables.length) {
    Message.warning('请勾选至少一张源数据库表')
    return false
  }
  if (form.scopeMode === 'BUSINESS_MODEL' && (!selectedProfile.value || !form.businessValue.trim())) {
    Message.warning(`请选择数据库模板并填写${businessIdentifierName.value}`)
    return false
  }
  return true
}

function validateMappings() {
  const candidates = tableRows.value.filter((row) => row.selected)
  if (!candidates.length) {
    Message.warning('请选择至少一张参与比对的表')
    return false
  }
  if (candidates.some((row) => !row.targetTableName || !row.selectedColumns.length || !row.keyColumns.length)) {
    Message.warning('参与比对的表必须配置目标表、主键字段和同步字段')
    return false
  }
  if (candidates.some((row) => !row.confirmed)) {
    Message.warning('存在尚未人工确认的表映射或字段映射')
    return false
  }
  return true
}

function buildPayload(extra = {}) {
  return {
    sourceId: selectedSource.value.id,
    sourceType: selectedSource.value.type,
    sourceName: selectedSource.value.name,
    targetId: selectedTarget.value.id,
    targetType: selectedTarget.value.type,
    targetName: selectedTarget.value.name,
    scopeMode: 'TABLES',
    rangeType: form.scopeMode,
    profile: form.profile,
    businessValue: form.businessValue,
    syncPolicy: form.syncPolicy,
    conflictPolicy: form.conflictPolicy,
    fieldMismatchPolicy: form.fieldMismatchPolicy,
    failurePolicy: form.failurePolicy,
    syncAttachmentRecords: form.attachmentPolicy !== 'NONE',
    syncAttachmentFiles: form.attachmentPolicy === 'FILES',
    tables: selectedRows.value.map((row) => ({
      tableName: row.sourceTableName,
      targetTableName: row.targetTableName,
      columns: row.selectedColumns,
      keyColumns: row.keyColumns,
      sourceCondition: row.sourceCondition,
      targetCondition: row.targetCondition,
    })),
    ...extra,
  }
}

async function runCompare() {
  if (!validateDirection() || !validateScope() || !validateMappings()) return false
  compareLoading.value = true
  try {
    const { data } = await compareData(buildPayload())
    compareResult.value = data
    syncResult.value = null
    Message.success(data?.message || '差异比对完成')
    return true
  } catch (error) {
    Message.error(errorMessage(error, '差异比对失败'))
    return false
  } finally {
    compareLoading.value = false
  }
}

function runSync() {
  if (!compareResult.value || !validateMappings()) {
    Message.warning('请先完成差异比对')
    return
  }
  if (!hasDifferences.value) {
    Message.info('未检测到可同步差异，无需执行同步')
    return
  }
  Modal.confirm({
    title: form.conflictPolicy === 'MANUAL_CONFIRM' ? '人工确认冲突数据' : '确认执行同步',
    content: `将从“${selectedSource.value.name}”向“${selectedTarget.value.name}”同步 ${selectedRows.value.length} 张表：待插入 ${summary.value.insertRecords} 条，待更新 ${summary.value.updateRecords} 条。`,
    okText: '确认并执行同步',
    cancelText: '取消',
    async onOk() {
      syncLoading.value = true
      try {
        const { data } = await syncData(buildPayload({ conflictsConfirmed: form.conflictPolicy === 'MANUAL_CONFIRM' }))
        syncResult.value = data
        Message.success(data?.message || '同步完成')
      } catch (error) {
        Message.error(errorMessage(error, '同步失败'))
        throw error
      } finally {
        syncLoading.value = false
      }
    },
  })
}

async function nextStep() {
  if (currentStep.value === 1) {
    if (!validateDirection() || !validateScope() || !(await refreshMappings())) return
    currentStep.value = 2
    return
  }
  if (currentStep.value === 2) {
    if (!(await runCompare())) return
    currentStep.value = 3
  }
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

async function loadOptions() {
  booting.value = true
  try {
    const [sources, profileFiles] = await Promise.all([listDataSources(), listTableProfiles()])
    dataSources.value = Array.isArray(sources) ? sources : []
    profiles.value = Array.isArray(profileFiles) ? profileFiles : []
    form.sourceId = String(dataSources.value[0]?.id || '')
    form.targetId = String(dataSources.value.find((item) => String(item.id) !== form.sourceId)?.id || '')
    await loadEndpointTables()
  } catch (error) {
    Message.error(errorMessage(error, '加载比对同步配置失败'))
  } finally {
    booting.value = false
  }
}

watch(() => [form.sourceId, form.targetId], async () => {
  currentStep.value = 1
  await loadEndpointTables()
})
watch(() => form.profile, loadProfile)
watch(() => [form.scopeMode, form.selectedTables, form.businessValue], () => {
  tableRows.value = []
  mappingMessage.value = ''
  resetResults()
}, { deep: true })
onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="比对同步" description="选择同步对象，确认表和字段映射，查看数据差异后再执行同步。"
      hint="差异比对只读取数据；执行同步时只修改目标数据库。" />

    <a-card class="form-card sync-wizard" :loading="booting">
      <a-steps :current="currentStep" class="model-wizard-steps">
        <a-step title="选择同步对象" description="源库、目标库和同步范围" />
        <a-step title="表映射与字段映射" description="确认参与表、主键和字段" />
        <a-step title="确认并同步" description="确认策略、差异和写入规模" />
      </a-steps>

      <section v-if="currentStep === 1" class="model-step-panel sync-step-panel">
        <div class="step-heading">
          <h2>选择源数据库和目标数据库</h2>
          <p>源数据库只读，执行同步时数据将写入目标数据库。</p>
        </div>

        <div class="endpoint-grid">
          <article class="endpoint-card source-card">
            <div class="endpoint-card-title"><span>源数据库</span><a-tag color="blue">只读</a-tag></div>
            <a-select v-model="form.sourceId" allow-search placeholder="请选择源数据库">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">{{ item.name }}</a-option>
            </a-select>
            <div v-if="selectedSource" class="endpoint-details">
              <div><span>连接名称</span><a-tooltip :content="selectedSource.name"><strong>{{ selectedSource.name }}</strong></a-tooltip></div>
              <div><span>数据库类型</span><strong>{{ selectedSource.type }}</strong></div>
              <div><span>数据库名</span><a-tooltip :content="databaseName(selectedSource)"><strong>{{ databaseName(selectedSource) }}</strong></a-tooltip></div>
            </div>
          </article>

          <div class="sync-direction"><icon-arrow-right /></div>

          <article class="endpoint-card target-card">
            <div class="endpoint-card-title"><span>目标数据库</span><a-tag color="green">写入</a-tag></div>
            <a-select v-model="form.targetId" allow-search placeholder="请选择目标数据库">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">{{ item.name }}</a-option>
            </a-select>
            <div v-if="selectedTarget" class="endpoint-details">
              <div><span>连接名称</span><a-tooltip :content="selectedTarget.name"><strong>{{ selectedTarget.name }}</strong></a-tooltip></div>
              <div><span>数据库类型</span><strong>{{ selectedTarget.type }}</strong></div>
              <div><span>数据库名</span><a-tooltip :content="databaseName(selectedTarget)"><strong>{{ databaseName(selectedTarget) }}</strong></a-tooltip></div>
            </div>
          </article>
        </div>

        <a-alert v-if="form.sourceId && form.targetId && form.sourceId === form.targetId" type="error" show-icon class="direction-alert">
          源数据库和目标数据库不能选择同一个连接。
        </a-alert>

        <div class="scope-section">
          <div class="step-heading compact-heading">
            <h2>选择同步范围</h2>
            <p>这里只决定加载哪些源表，执行策略将在第三步统一确认。</p>
          </div>
          <a-radio-group v-model="form.scopeMode" class="scope-card-grid">
            <a-radio v-for="item in scopeOptions" :key="item.value" :value="item.value" class="scope-radio-card">
              <div><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div>
            </a-radio>
          </a-radio-group>

          <a-form v-if="form.scopeMode === 'SELECTED_TABLES'" layout="vertical" class="scope-detail-form">
            <a-form-item label="源数据库表">
              <a-select v-model="form.selectedTables" multiple allow-search allow-clear :max-tag-count="6" placeholder="请选择参与比对的源表">
                <a-option v-for="table in businessSourceTables" :key="table" :value="table">{{ table }}</a-option>
              </a-select>
            </a-form-item>
          </a-form>

          <a-form v-if="form.scopeMode === 'BUSINESS_MODEL'" layout="vertical" class="scope-detail-form">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="数据库模板">
                  <a-select v-model="form.profile" allow-search placeholder="请选择数据库模板">
                    <a-option v-for="item in profiles" :key="item.name" :value="item.name">{{ item.modelName || item.name }}</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item :label="businessIdentifierName">
                  <a-input v-model="form.businessValue" :placeholder="`请输入${businessIdentifierName}`" />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </div>
      </section>

      <section v-else-if="currentStep === 2" class="model-step-panel sync-step-panel">
        <div class="step-action-row">
          <div class="step-heading">
            <h2>表映射与字段映射</h2>
            <p>只有勾选参与，并完成必要确认的表才会进入差异比对。</p>
          </div>
          <a-button :loading="tableLoading" @click="refreshMappings"><template #icon><icon-refresh /></template>刷新字段</a-button>
        </div>

        <a-alert type="warning" show-icon class="mapping-guide">
          可点击“刷新字段”重新读取结构；源表和目标表不一致时可手动选择目标表，并确认主键字段与同步字段。
        </a-alert>

        <a-alert v-if="mappingMessage" :type="tableRows.length ? 'warning' : 'error'" show-icon class="mapping-message">
          {{ mappingMessage }}
        </a-alert>

        <a-table v-if="tableRows.length || tableLoading" :columns="mappingColumns" :data="tableRows" :loading="tableLoading"
          :pagination="{ pageSize: 8, showTotal: true }" :scroll="{ x: 1320, y: 430 }" row-key="sourceTableName" size="small">
          <template #selected="{ record }">
            <a-checkbox v-model="record.selected" :disabled="!record.targetTableName || !record.selectedColumns.length || !record.keyColumns.length" @change="resetResults" />
          </template>
          <template #sourceTable="{ record }">
            <a-tooltip :content="record.sourceTableName"><span class="cell-ellipsis">{{ record.sourceTableName }}</span></a-tooltip>
          </template>
          <template #targetTable="{ record }">
            <a-select :model-value="record.targetTableName" allow-search allow-clear placeholder="选择目标表"
              @change="(value) => changeTargetTable(record, value)">
              <a-option v-for="table in businessTargetTables" :key="table" :value="table">{{ table }}</a-option>
            </a-select>
          </template>
          <template #keyColumns="{ record }">
            <a-select v-model="record.keyColumns" multiple allow-search :max-tag-count="1" placeholder="选择主键"
              :disabled="!record.targetTableName" @change="mappingChanged(record)">
              <a-option v-for="column in record.commonColumns" :key="column" :value="column">{{ column }}</a-option>
            </a-select>
          </template>
          <template #fields="{ record }">
            <a-select v-model="record.selectedColumns" multiple allow-search allow-clear :max-tag-count="2" placeholder="选择同步字段"
              :disabled="!record.targetTableName" @change="mappingChanged(record)">
              <a-option v-for="column in record.commonColumns" :key="column" :value="column">{{ column }}</a-option>
            </a-select>
          </template>
          <template #matching="{ record }">
            <div class="matching-status">
              <a-tag :color="!record.targetTableName ? 'red' : record.requiresConfirmation ? 'orange' : 'green'">
                {{ !record.targetTableName ? '未映射目标表' : record.requiresConfirmation ? '需要确认' : '自动匹配' }}
              </a-tag>
              <span v-if="record.targetTableName">同名字段 {{ record.commonColumns.length }} 个，源独有 {{ record.unmatchedSource.length }} 个，目标独有 {{ record.unmatchedTarget.length }} 个</span>
            </div>
          </template>
          <template #confirmed="{ record }">
            <a-tag v-if="!record.requiresConfirmation && record.confirmed" color="green">自动确认</a-tag>
            <a-checkbox v-else v-model="record.confirmed" :disabled="!record.targetTableName || !record.selectedColumns.length || !record.keyColumns.length" @change="resetResults">已确认</a-checkbox>
          </template>
        </a-table>
        <a-empty v-else :description="mappingMessage || '当前同步范围没有可展示的表映射'" />

        <div class="mapping-footer-summary">
          已加载 {{ tableRows.length }} 张源表，已确认参与 {{ selectedRows.length }} 张。
        </div>
      </section>

      <section v-else class="model-step-panel sync-step-panel">
        <div class="step-heading">
          <h2>确认同步策略</h2>
          <p>策略只影响本次同步，源数据库始终保持只读。</p>
        </div>

        <div class="policy-grid">
          <article v-for="group in policyGroups" :key="group.key" class="policy-card">
            <strong class="policy-title">{{ group.title }}</strong>
            <a-radio-group v-model="form[group.key]" direction="vertical" class="policy-options">
              <a-radio v-for="item in group.options" :key="item.value" :value="item.value">
                <div><strong>{{ item.label }}</strong><span>{{ item.description }}</span></div>
              </a-radio>
            </a-radio-group>
          </article>
        </div>

        <div class="diff-section">
          <div class="step-heading compact-heading">
            <h2>差异比对结果</h2>
            <p>以下结果来自第二步已确认的表、主键和同步字段。</p>
          </div>
          <div class="diff-summary">
            <article><span>参与表</span><strong>{{ summary.totalTables }}</strong></article>
            <article><span>差异表</span><strong>{{ summary.inconsistentTables }}</strong></article>
            <article><span>待插入</span><strong>{{ summary.insertRecords }}</strong><small>源有目标没有</small></article>
            <article><span>待更新</span><strong>{{ summary.updateRecords }}</strong><small>两边都有但内容不同</small></article>
            <article><span>待删除</span><strong>{{ summary.deleteRecords }}</strong><small>源没有目标有</small></article>
          </div>

          <a-alert v-if="!hasDifferences" type="info" show-icon class="no-diff-alert">未检测到可同步差异，源库和目标库在当前范围内数据一致。</a-alert>
          <a-table v-else :columns="diffColumns" :data="diffRows" :pagination="{ pageSize: 8 }" :scroll="{ x: 1020, y: 360 }" row-key="sourceTable" size="small">
            <template #diffSourceTable="{ record }"><a-tooltip :content="record.sourceTable"><span class="cell-ellipsis">{{ record.sourceTable }}</span></a-tooltip></template>
            <template #diffTargetTable="{ record }"><a-tooltip :content="record.targetTable"><span class="cell-ellipsis">{{ record.targetTable }}</span></a-tooltip></template>
            <template #consistent="{ record }"><a-tag :color="record.consistent ? 'green' : 'orange'">{{ record.consistent ? '一致' : '有差异' }}</a-tag></template>
          </a-table>
        </div>

        <div class="sync-confirm-section">
          <div class="step-heading compact-heading">
            <h2>同步确认摘要</h2>
            <p>确认写入对象和预计处理规模后再执行同步。</p>
          </div>
          <a-descriptions bordered :column="3" class="sync-confirm-descriptions">
            <a-descriptions-item label="源数据库">{{ endpointLabel(selectedSource) }} / {{ databaseName(selectedSource) }}</a-descriptions-item>
            <a-descriptions-item label="目标数据库">{{ endpointLabel(selectedTarget) }} / {{ databaseName(selectedTarget) }}</a-descriptions-item>
            <a-descriptions-item label="参与表数量">{{ selectedRows.length }} 张</a-descriptions-item>
            <a-descriptions-item label="待插入数量">{{ summary.insertRecords }} 条</a-descriptions-item>
            <a-descriptions-item label="待更新数量">{{ summary.updateRecords }} 条</a-descriptions-item>
            <a-descriptions-item label="待删除数量">{{ summary.deleteRecords }} 条</a-descriptions-item>
            <a-descriptions-item label="附件数量">{{ attachmentCount }} 条</a-descriptions-item>
            <a-descriptions-item label="写入策略">{{ policyGroups[0].options.find((item) => item.value === form.syncPolicy)?.label }}</a-descriptions-item>
            <a-descriptions-item label="附件处理">{{ policyGroups[4].options.find((item) => item.value === form.attachmentPolicy)?.label }}</a-descriptions-item>
          </a-descriptions>
          <a-alert type="warning" show-icon class="sync-warning">执行同步将修改目标数据库，源数据库不会被修改。</a-alert>
          <div class="sync-start-row">
            <a-button type="primary" status="danger" size="large" :loading="syncLoading" :disabled="!hasDifferences" @click="runSync">执行同步</a-button>
          </div>
        </div>

        <a-result v-if="syncResult" :status="syncResult.failedTables?.length ? 'warning' : 'success'" title="同步执行完成"
          :subtitle="`插入 ${syncResult.rowsInserted || 0} 条，更新 ${syncResult.rowsUpdated || 0} 条，删除 ${syncResult.rowsDeleted || 0} 条`" />
      </section>

      <footer class="model-wizard-footer">
        <a-button :disabled="currentStep === 1 || syncLoading" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 3 步</span>
        <a-button v-if="currentStep === 1" type="primary" :loading="tableLoading" @click="nextStep">加载表映射并继续</a-button>
        <a-button v-else-if="currentStep === 2" type="primary" :loading="compareLoading" :disabled="!selectedRows.length" @click="nextStep">比对差异并继续</a-button>
        <span v-else class="footer-placeholder"></span>
      </footer>
    </a-card>
  </div>
</template>

<style scoped>
.sync-wizard { min-width: 0; }
.sync-step-panel { min-height: 460px; }

.step-heading h2,
.step-heading p { margin: 0; }
.step-heading h2 { font-size: 18px; }
.step-heading p { margin-top: 6px; color: #7b899d; }
.compact-heading { margin-bottom: 16px; }

.endpoint-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}

.endpoint-card {
  min-width: 0;
  padding: 18px;
  border: 1px solid #dbe7ff;
  border-radius: 11px;
  background: #f8fbff;
}
.target-card { border-color: #d8eee4; background: #f7fcfa; }
.endpoint-card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 700; }
.endpoint-details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.endpoint-details div { min-width: 0; padding: 9px 10px; border-radius: 7px; background: rgba(255, 255, 255, .8); }
.endpoint-details span,
.endpoint-details strong { display: block; }
.endpoint-details span { color: #86909c; font-size: 11px; }
.endpoint-details strong { margin-top: 4px; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.sync-direction { display: grid; place-items: center; color: #2d6fff; font-size: 26px; }
.direction-alert { margin-top: 14px; }

.scope-section,
.diff-section,
.sync-confirm-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e8ef; }
.scope-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; width: 100%; }
.scope-radio-card { width: auto; min-height: 92px; margin: 0; padding: 15px; border: 1px solid #e5e8ef; border-radius: 9px; background: #fff; align-items: flex-start; }
.scope-radio-card:hover,
.scope-radio-card.arco-radio-checked { border-color: #165dff; background: #f2f7ff; }
.scope-radio-card strong,
.scope-radio-card span { display: block; }
.scope-radio-card span { margin-top: 5px; color: #7b899d; font-size: 12px; line-height: 1.5; }
.scope-detail-form { margin-top: 16px; padding: 16px 16px 0; border-radius: 9px; background: #f7f9fc; }

.step-action-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.mapping-guide,
.mapping-message { margin-bottom: 14px; }
.cell-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.matching-status { display: grid; gap: 5px; color: #7b899d; font-size: 11px; line-height: 1.4; }
.mapping-footer-summary { margin-top: 12px; color: #7b899d; font-size: 12px; text-align: right; }

.policy-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.policy-card { min-width: 0; padding: 16px; border: 1px solid #e5e8ef; border-radius: 10px; background: #fff; }
.policy-title { display: block; margin-bottom: 12px; }
.policy-options { display: grid; gap: 7px; width: 100%; }
.policy-options :deep(.arco-radio) { align-items: flex-start; width: 100%; margin: 0; padding: 9px 10px; border-radius: 7px; }
.policy-options :deep(.arco-radio-checked) { background: #f2f7ff; }
.policy-options strong,
.policy-options span { display: block; }
.policy-options span { margin-top: 3px; color: #86909c; font-size: 11px; line-height: 1.4; }

.diff-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.diff-summary article { min-width: 0; padding: 14px; border: 1px solid #e5e8ef; border-radius: 9px; background: #f8faff; }
.diff-summary span,
.diff-summary strong,
.diff-summary small { display: block; }
.diff-summary span,
.diff-summary small { color: #7b899d; font-size: 11px; }
.diff-summary strong { margin: 6px 0; color: #165dff; font-size: 22px; }
.no-diff-alert { margin-bottom: 4px; }
.sync-confirm-descriptions { width: 100%; }
.sync-warning { margin-top: 14px; }
.sync-start-row { display: flex; justify-content: center; padding: 22px 0 4px; }
.footer-placeholder { width: 100px; }

@media (max-width: 1050px) {
  .scope-card-grid,
  .diff-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .endpoint-details { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 760px) {
  .endpoint-grid { grid-template-columns: minmax(0, 1fr); }
  .sync-direction { transform: rotate(90deg); }
  .scope-card-grid,
  .policy-grid,
  .diff-summary { grid-template-columns: minmax(0, 1fr); }
}
</style>
