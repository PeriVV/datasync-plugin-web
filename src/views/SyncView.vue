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
const onlyNeedsAttention = ref(false)
const mappingDetailVisible = ref(false)
const activeMappingRow = ref(null)
const compareResult = ref(null)
const activeReviewTableName = ref('')
const expandedDiffRecords = ref([])
const syncDetailsVisible = ref(true)
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
  failurePolicy: 'SKIP_FAILED_TABLE',
  attachmentPolicy: 'NONE',
  syncInserts: true,
  syncUpdates: true,
  deleteTargetOnly: false,
})

const mappingColumns = [
  { title: '参与', slotName: 'selected', width: 72, fixed: 'left' },
  { title: '源表', slotName: 'sourceTable', width: 190, fixed: 'left' },
  { title: '目标表', slotName: 'targetTable', width: 190 },
  { title: '主键', slotName: 'keyColumns', width: 170 },
  { title: '同步字段', slotName: 'fields', width: 140 },
  { title: '状态', slotName: 'status', width: 110 },
]

const scopeOptions = [
  { value: 'FULL_DATABASE', title: '全库比对', description: '加载源库全部业务表，并自动匹配目标库同名表。' },
  { value: 'SELECTED_TABLES', title: '勾选数据表比对', description: '手动选择本次参与比对的源数据库表。' },
  { value: 'BUSINESS_MODEL', title: '按业务模型比对', description: '只加载数据库模板配置的主表和关联业务表。' },
]

const selectedSource = computed(() => dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null)
const selectedTarget = computed(() => dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null)
const businessIdentifierName = computed(() => selectedProfile.value?.businessIdentifierName || '业务标识值')
const businessSourceTables = computed(() => sourceTables.value.filter(isBusinessTable))
const businessTargetTables = computed(() => targetTables.value.filter(isBusinessTable))
const selectedRows = computed(() => tableRows.value.filter((row) =>
  row.selected && row.targetTableName && row.selectedColumns.length && row.keyColumns.length && row.confirmed,
))
const rowsNeedingAttention = computed(() => tableRows.value.filter((row) => mappingStatus(row).key !== 'matched'))
const matchedRowCount = computed(() => tableRows.value.length - rowsNeedingAttention.value.length)
const displayedMappingRows = computed(() => (
  onlyNeedsAttention.value ? rowsNeedingAttention.value : tableRows.value
))
const confirmableRows = computed(() => rowsNeedingAttention.value.filter(canConfirmMapping))
const mappingAlertMessage = computed(() => {
  if (mappingMessage.value) return mappingMessage.value
  if (!rowsNeedingAttention.value.length) return ''
  const unmapped = rowsNeedingAttention.value.filter((row) => !row.targetTableName).length
  const missingKeys = rowsNeedingAttention.value.filter((row) => row.targetTableName && !row.keyColumns.length).length
  const fieldConflicts = rowsNeedingAttention.value.filter((row) => (
    row.targetTableName && (row.unmatchedSource.length || row.unmatchedTarget.length)
  )).length
  const parts = []
  if (unmapped) parts.push(`${unmapped} 张未选择目标表`)
  if (missingKeys) parts.push(`${missingKeys} 张需确认主键`)
  if (fieldConflicts) parts.push(`${fieldConflicts} 张存在字段差异`)
  if (!parts.length) parts.push(`${rowsNeedingAttention.value.length} 张映射需确认`)
  return `发现需要处理的映射：${parts.join('，')}。`
})
const diffRows = computed(() => (compareResult.value?.tables || []).map((row) => ({
  ...row,
  sourceTable: row.sourceTable || row.table,
  targetTable: row.targetTable || row.table,
  sourceCount: Number(row.sourceCount || 0),
  targetCount: Number(row.targetCount || 0),
  insertRecords: Number(row.insertRecords || row.sourceOnlyKeys?.length || 0),
  updateRecords: Number(row.updateRecords || row.changedKeys?.length || 0),
  deleteRecords: Number(row.deleteRecords || row.targetOnlyKeys?.length || 0),
  details: row.details || {
    inserts: (row.sourceOnlyKeys || []).map((key) => ({ key, values: {} })),
    updates: (row.changedKeys || []).map((key) => ({ key, fields: [] })),
    deletes: (row.targetOnlyKeys || []).map((key) => ({ key, values: {} })),
  },
})))
const summary = computed(() => {
  const value = compareResult.value?.summary || {}
  return {
    totalTables: Number(value.totalTables || diffRows.value.length),
    inconsistentTables: Number(value.inconsistentTables || diffRows.value.filter((row) => !row.consistent).length),
    abnormalTables: Number(value.abnormalTables || diffRows.value.filter((row) => row.error).length),
    insertRecords: Number(value.insertRecords || diffRows.value.reduce((sum, row) => sum + row.insertRecords, 0)),
    updateRecords: Number(value.updateRecords || diffRows.value.reduce((sum, row) => sum + row.updateRecords, 0)),
    deleteRecords: Number(value.deleteRecords || diffRows.value.reduce((sum, row) => sum + row.deleteRecords, 0)),
  }
})
const totalDifferences = computed(() => summary.value.insertRecords + summary.value.updateRecords + summary.value.deleteRecords)
const reviewTables = computed(() => diffRows.value.filter((row) => !row.consistent))
const activeReviewTable = computed(() => (
  reviewTables.value.find((row) => row.sourceTable === activeReviewTableName.value) || reviewTables.value[0] || null
))
const activeReviewRecords = computed(() => {
  const table = activeReviewTable.value
  if (!table) return []
  return [
    ...(table.details?.inserts || []).map((row) => ({ ...row, recordId: `insert-${row.key}`, type: 'insert', typeLabel: '待插入' })),
    ...(table.details?.updates || []).map((row) => ({ ...row, recordId: `update-${row.key}`, type: 'update', typeLabel: '待更新' })),
    ...(table.details?.deletes || []).map((row) => ({ ...row, recordId: `delete-${row.key}`, type: 'delete', typeLabel: '待删除' })),
  ]
})
const impactSummary = computed(() => ({
  insert: form.syncInserts ? summary.value.insertRecords : 0,
  update: form.syncUpdates ? summary.value.updateRecords : 0,
  delete: form.deleteTargetOnly ? summary.value.deleteRecords : 0,
}))
const hasSyncImpact = computed(() => impactSummary.value.insert + impactSummary.value.update + impactSummary.value.delete > 0)
const syncDetailGroups = computed(() => {
  const groups = new Map()
  for (const detail of syncResult.value?.operationDetails || []) {
    if (!groups.has(detail.table)) groups.set(detail.table, [])
    groups.get(detail.table).push(detail)
  }
  return Array.from(groups, ([table, records]) => ({
    table,
    records: [...records].sort((left, right) => operationStatusOrder(left.status) - operationStatusOrder(right.status)),
  }))
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

function canConfirmMapping(row) {
  return Boolean(row.targetTableName && row.selectedColumns.length && row.keyColumns.length)
}

function mappingStatus(row) {
  if (!row.targetTableName || !row.selectedColumns.length || !row.keyColumns.length) {
    return { key: 'risk', label: '有风险', color: 'red' }
  }
  if (!row.confirmed) return { key: 'confirm', label: '需确认', color: 'orange' }
  return { key: 'matched', label: '已匹配', color: 'green' }
}

function mappingRowClass(row) {
  return mappingStatus(row).key === 'matched' ? '' : 'mapping-row-attention'
}

function openMappingDetail(row) {
  activeMappingRow.value = row
  mappingDetailVisible.value = true
}

function toggleMappingField(row, column, checked) {
  if (checked && !row.selectedColumns.includes(column)) row.selectedColumns.push(column)
  if (!checked && !row.keyColumns.includes(column)) {
    row.selectedColumns = row.selectedColumns.filter((item) => item !== column)
  }
  mappingChanged(row)
}

function confirmMapping(row) {
  if (!canConfirmMapping(row)) {
    Message.warning('请先选择目标表、主键和同步字段')
    return
  }
  row.confirmed = true
  row.selected = true
  resetResults()
  mappingDetailVisible.value = false
}

function batchConfirmMappings() {
  if (!confirmableRows.value.length) return
  const confirmedCount = confirmableRows.value.length
  confirmableRows.value.forEach((row) => {
    row.confirmed = true
    row.selected = true
  })
  resetResults()
  Message.success(`已确认 ${confirmedCount} 张表的映射`)
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

function formatCellValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function selectReviewTable(tableName) {
  activeReviewTableName.value = tableName
  expandedDiffRecords.value = []
}

function toggleDiffRecord(recordId) {
  expandedDiffRecords.value = expandedDiffRecords.value.includes(recordId)
    ? expandedDiffRecords.value.filter((item) => item !== recordId)
    : [...expandedDiffRecords.value, recordId]
}

function diffRecordSummary(record) {
  if (record.type === 'insert') return '源库存在，目标库缺失'
  if (record.type === 'delete') return form.deleteTargetOnly ? '目标库多余，将执行删除' : '目标库多余数据，不执行删除'
  const fields = (record.fields || []).filter((field) => field.changed)
  if (!fields.length) return '字段值不同'
  const names = fields.slice(0, 3).map((field) => field.field).join('、')
  return `${names}${fields.length > 3 ? ` 等 ${fields.length} 个字段` : ` ${fields.length} 个字段`}发生变化`
}

function changedRecordFields(record) {
  return (record.fields || []).filter((field) => field.changed)
}

function operationDescription(detail) {
  if (detail.type === 'INSERT') return detail.status === 'SKIPPED' ? '未启用新增同步' : '新增至目标库'
  if (detail.type === 'DELETE') return detail.status === 'SKIPPED' ? '未启用删除同步' : '从目标库删除'
  if (detail.type !== 'UPDATE' || !detail.changes?.length) return detail.message
  const changes = detail.changes.slice(0, 3)
    .map((item) => `${item.field}: ${formatCellValue(item.targetValue)} → ${formatCellValue(item.sourceValue)}`)
    .join('；')
  return changes
}

function operationStatusOrder(status) {
  return status === 'FAILED' ? 0 : status === 'SKIPPED' ? 1 : 2
}

function operationActionLabel(type) {
  return ({ INSERT: '插入', UPDATE: '更新', DELETE: '删除', TABLE: '表处理' })[type] || type
}

function downloadSyncReport() {
  if (!syncResult.value) return
  const report = {
    generatedAt: new Date().toISOString(),
    sourceDatabase: endpointLabel(selectedSource.value),
    targetDatabase: endpointLabel(selectedTarget.value),
    summary: {
      inserted: syncResult.value.rowsInserted || 0,
      updated: syncResult.value.rowsUpdated || 0,
      deleted: syncResult.value.rowsDeleted || 0,
      failedTables: syncResult.value.failedTables || [],
    },
    details: syncResult.value.operationDetails || [],
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `datasync-report-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function returnToMappings() {
  currentStep.value = 2
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
  activeReviewTableName.value = ''
  expandedDiffRecords.value = []
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
  const sourcePrimaryKeys = sourceInfo.filter((item) => item.primary).map((item) => item.name)
  const primaryKeys = sourcePrimaryKeys
    .map((item) => commonColumns.find((column) => sameName(column, item)))
    .filter(Boolean)
  const unmatchedSource = sourceColumns.filter((column) => !targetColumns.some((target) => sameName(column, target)))
  const unmatchedTarget = targetColumns.filter((column) => !sourceColumns.some((source) => sameName(column, source)))
  const exactMatch = Boolean(targetTableName && commonColumns.length && primaryKeys.length && !unmatchedSource.length && !unmatchedTarget.length)
  return {
    sourceTableName: candidate.tableName,
    targetTableName,
    sourceCondition: candidate.condition,
    targetCondition: candidate.condition,
    attachmentTable: candidate.attachmentTable || isAttachmentTable(candidate.tableName),
    sourceColumns,
    sourcePrimaryKeys,
    targetColumns,
    commonColumns,
    selectedColumns: [...commonColumns],
    keyColumns: [...primaryKeys],
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
  mappingDetailVisible.value = false
  activeMappingRow.value = null
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
    row.keyColumns = row.sourcePrimaryKeys.filter((column) => row.commonColumns.some((item) => sameName(item, column)))
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
    syncInserts: form.syncInserts,
    syncUpdates: form.syncUpdates,
    deleteTargetOnly: form.deleteTargetOnly,
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
    activeReviewTableName.value = (data?.tables || []).find((row) => !row.consistent)?.sourceTable
      || (data?.tables || []).find((row) => !row.consistent)?.table || ''
    expandedDiffRecords.value = []
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
  if (!hasSyncImpact.value) {
    Message.info('当前策略下没有需要同步的数据')
    return
  }
  Modal.confirm({
    title: form.conflictPolicy === 'MANUAL_CONFIRM' ? '人工确认冲突数据' : '确认执行同步',
    content: `将插入 ${impactSummary.value.insert} 条，更新 ${impactSummary.value.update} 条，删除 ${impactSummary.value.delete} 条。`,
    okText: '确认并执行同步',
    cancelText: '取消',
    async onOk() {
      syncLoading.value = true
      try {
        const { data } = await syncData(buildPayload({ conflictsConfirmed: form.conflictPolicy === 'MANUAL_CONFIRM' }))
        syncResult.value = data
        syncDetailsVisible.value = true
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
        <div class="step-heading mapping-heading">
          <h2>表映射与字段映射</h2>
          <p>确认参与比对的表、主键和同步字段。</p>
        </div>

        <div class="mapping-toolbar">
          <strong>已匹配 {{ matchedRowCount }} 张，需处理 {{ rowsNeedingAttention.length }} 张</strong>
          <div class="mapping-toolbar-actions">
            <a-tooltip v-if="!rowsNeedingAttention.length" content="自动匹配已完成，可通过字段详情查看完整映射。">
              <span class="mapping-auto-tip">映射正常</span>
            </a-tooltip>
            <a-button :loading="tableLoading" @click="refreshMappings"><template #icon><icon-refresh /></template>刷新字段</a-button>
            <a-button :type="onlyNeedsAttention ? 'primary' : 'secondary'" @click="onlyNeedsAttention = !onlyNeedsAttention">仅看需处理</a-button>
            <a-button :disabled="!confirmableRows.length" @click="batchConfirmMappings">批量确认</a-button>
          </div>
        </div>

        <a-alert v-if="mappingAlertMessage" :type="tableRows.length ? 'warning' : 'error'" show-icon class="mapping-message">
          {{ mappingAlertMessage }}
        </a-alert>

        <a-table v-if="tableRows.length || tableLoading" :columns="mappingColumns" :data="displayedMappingRows" :loading="tableLoading"
          :pagination="{ pageSize: 8, showTotal: true }" :scroll="{ x: 970, y: 430 }" :row-class="mappingRowClass" row-key="sourceTableName" size="small">
          <template #selected="{ record }">
            <a-checkbox v-model="record.selected" :disabled="!record.targetTableName || !record.selectedColumns.length || !record.keyColumns.length" @change="resetResults" />
          </template>
          <template #sourceTable="{ record }">
            <a-tooltip :content="record.sourceTableName"><span class="cell-ellipsis">{{ record.sourceTableName }}</span></a-tooltip>
          </template>
          <template #targetTable="{ record }">
            <a-tooltip v-if="record.targetTableName" :content="record.targetTableName"><span class="cell-ellipsis">{{ record.targetTableName }}</span></a-tooltip>
            <span v-else class="cell-placeholder">未选择</span>
          </template>
          <template #keyColumns="{ record }">
            <a-tooltip v-if="record.keyColumns.length" :content="record.keyColumns.join(', ')"><span class="cell-ellipsis">{{ record.keyColumns.join(', ') }}</span></a-tooltip>
            <span v-else class="cell-placeholder">待确认</span>
          </template>
          <template #fields="{ record }">
            <a-tooltip :content="record.targetTableName ? `已选择 ${record.selectedColumns.length} 个字段` : '请先选择目标表'">
              <button class="field-detail-link" type="button" @click="openMappingDetail(record)">查看字段</button>
            </a-tooltip>
          </template>
          <template #status="{ record }">
            <a-tag :color="mappingStatus(record).color">{{ mappingStatus(record).label }}</a-tag>
          </template>
        </a-table>
        <a-empty v-else :description="mappingMessage || '当前同步范围没有可展示的表映射'" />

        <a-drawer v-model:visible="mappingDetailVisible" :width="560" :footer="false" unmount-on-close>
          <template #title>字段映射 · {{ activeMappingRow?.sourceTableName }}</template>
          <div v-if="activeMappingRow" class="mapping-detail">
            <a-form layout="vertical">
              <a-form-item label="目标表">
                <a-select :model-value="activeMappingRow.targetTableName" allow-search allow-clear placeholder="选择目标表"
                  @change="(value) => changeTargetTable(activeMappingRow, value)">
                  <a-option v-for="table in businessTargetTables" :key="table" :value="table">{{ table }}</a-option>
                </a-select>
              </a-form-item>
              <a-form-item label="主键">
                <a-select v-model="activeMappingRow.keyColumns" multiple allow-search placeholder="选择用于比对的主键"
                  :disabled="!activeMappingRow.targetTableName" @change="mappingChanged(activeMappingRow)">
                  <a-option v-for="column in activeMappingRow.commonColumns" :key="column" :value="column">{{ column }}</a-option>
                </a-select>
              </a-form-item>
            </a-form>

            <div class="field-mapping-header">
              <strong>同步字段</strong>
              <span>已选择 {{ activeMappingRow.selectedColumns.length }} / {{ activeMappingRow.commonColumns.length }}</span>
            </div>
            <div v-if="activeMappingRow.commonColumns.length" class="field-mapping-list">
              <div class="field-mapping-labels"><span></span><span>源字段</span><span>目标字段</span></div>
              <label v-for="column in activeMappingRow.commonColumns" :key="column" class="field-mapping-item">
                <a-checkbox :model-value="activeMappingRow.selectedColumns.includes(column)"
                  :disabled="activeMappingRow.keyColumns.includes(column)"
                  @change="(checked) => toggleMappingField(activeMappingRow, column, checked)" />
                <span>{{ column }}</span>
                <small>{{ column }}</small>
              </label>
            </div>
            <a-empty v-else description="选择目标表后查看公共字段" />

            <div v-if="activeMappingRow.unmatchedSource.length || activeMappingRow.unmatchedTarget.length" class="field-conflict-summary">
              <strong>字段差异</strong>
              <p v-if="activeMappingRow.unmatchedSource.length">仅源表：{{ activeMappingRow.unmatchedSource.join('、') }}</p>
              <p v-if="activeMappingRow.unmatchedTarget.length">仅目标表：{{ activeMappingRow.unmatchedTarget.join('、') }}</p>
            </div>

            <div class="mapping-detail-actions">
              <a-button @click="mappingDetailVisible = false">关闭</a-button>
              <a-button type="primary" :disabled="!canConfirmMapping(activeMappingRow)" @click="confirmMapping(activeMappingRow)">确认映射</a-button>
            </div>
          </div>
        </a-drawer>
      </section>

      <section v-else class="model-step-panel sync-step-panel">
        <div class="diff-review-header">
          <div><h2>查看差异</h2><strong>发现 {{ totalDifferences }} 条差异</strong></div>
          <div class="compare-header-actions">
            <a-button :loading="compareLoading" @click="runCompare"><template #icon><icon-refresh /></template>重新比对</a-button>
            <a-button @click="returnToMappings">返回修改映射</a-button>
          </div>
        </div>

        <div class="compact-diff-stats">
          <span class="insert-count">待插入 <strong>{{ summary.insertRecords }}</strong></span>
          <span class="update-count">待更新 <strong>{{ summary.updateRecords }}</strong></span>
          <span class="delete-count">待删除 <strong>{{ summary.deleteRecords }}</strong></span>
          <span class="abnormal-count">异常 <strong>{{ summary.abnormalTables }}</strong></span>
        </div>

        <div v-if="reviewTables.length" class="diff-review-layout">
          <aside class="diff-table-nav">
            <button v-for="table in reviewTables" :key="table.sourceTable" type="button"
              :class="{ active: activeReviewTable?.sourceTable === table.sourceTable }" @click="selectReviewTable(table.sourceTable)">
              <strong>{{ table.sourceTable }}</strong>
              <span>{{ table.insertRecords + table.updateRecords + table.deleteRecords }} 条差异</span>
              <small class="table-diff-counts">
                <span><i class="insert-dot"></i>{{ table.insertRecords }}</span>
                <span><i class="update-dot"></i>{{ table.updateRecords }}</span>
                <span><i class="delete-dot"></i>{{ table.deleteRecords }}</span>
              </small>
            </button>
          </aside>

          <div class="diff-record-panel">
            <div class="diff-record-panel-title">
              <div><h3>{{ activeReviewTable?.sourceTable }}</h3><span>主键：{{ activeReviewTable?.keyColumns?.join(', ') }}</span></div>
              <span>{{ activeReviewRecords.length }} 条记录</span>
            </div>

            <div class="diff-record-columns"><span>差异类型</span><span>主键</span><span>差异摘要</span><span>操作</span></div>
            <div class="diff-record-list">
              <article v-for="record in activeReviewRecords" :key="record.recordId" class="diff-record" :class="`diff-${record.type}`">
                <div class="diff-record-summary" @click="toggleDiffRecord(record.recordId)">
                  <a-tag :color="record.type === 'insert' ? 'green' : record.type === 'delete' ? 'red' : 'orange'">{{ record.typeLabel }}</a-tag>
                  <strong>{{ record.key }}</strong>
                  <span>{{ diffRecordSummary(record) }}</span>
                  <a-button size="mini" @click.stop="toggleDiffRecord(record.recordId)">{{ expandedDiffRecords.includes(record.recordId) ? '收起' : '详情' }}</a-button>
                </div>

                <div v-if="expandedDiffRecords.includes(record.recordId)" class="inline-diff-detail">
                  <table v-if="record.type === 'update'" class="field-diff-table">
                    <thead><tr><th>字段</th><th>源库值</th><th>目标库值</th><th>同步后值</th></tr></thead>
                    <tbody><tr v-for="field in changedRecordFields(record)" :key="field.field"><td>{{ field.field }}</td><td>{{ formatCellValue(field.sourceValue) }}</td><td>{{ formatCellValue(field.targetValue) }}</td><td>{{ formatCellValue(field.sourceValue) }}</td></tr></tbody>
                  </table>
                  <div v-else class="full-row-data">
                    <div v-for="column in activeReviewTable.columns" :key="column"><span>{{ column }}</span><strong>{{ formatCellValue(record.values?.[column]) }}</strong></div>
                  </div>
                </div>
              </article>
            </div>
            <p v-if="activeReviewTable?.details?.insertTruncated || activeReviewTable?.details?.updateTruncated || activeReviewTable?.details?.deleteTruncated" class="detail-limit-tip">明细最多展示每类 {{ activeReviewTable.details.limit }} 条，统计数量不受影响。</p>
          </div>
        </div>
        <a-empty v-else description="未发现数据差异" />

        <div class="sync-action-dock">
          <div class="sync-strategy-bar">
            <span class="strategy-label">同步范围</span>
            <label class="strategy-option" :class="{ selected: form.syncInserts }"><a-checkbox v-model="form.syncInserts" />新增 <small>{{ summary.insertRecords }}</small></label>
            <label class="strategy-option" :class="{ selected: form.syncUpdates }"><a-checkbox v-model="form.syncUpdates" />更新 <small>{{ summary.updateRecords }}</small></label>
            <label class="strategy-option delete-option" :class="{ selected: form.deleteTargetOnly }"><a-checkbox v-model="form.deleteTargetOnly" />删除 <small>{{ summary.deleteRecords }}</small></label>
            <span v-if="form.deleteTargetOnly" class="delete-risk">将删除目标库数据</span>
          </div>
          <div class="sync-execute-bar">
            <div><span>本次影响</span><strong>插入 {{ impactSummary.insert }} 条、更新 {{ impactSummary.update }} 条、删除 {{ impactSummary.delete }} 条</strong></div>
            <a-button type="primary" size="large" :loading="syncLoading" :disabled="!hasSyncImpact" @click="runSync">执行同步</a-button>
          </div>
        </div>

        <section v-if="syncResult" class="sync-result-review">
          <div class="sync-result-heading">
            <div><h3>执行结果</h3><span>插入 {{ syncResult.rowsInserted || 0 }} 条 · 更新 {{ syncResult.rowsUpdated || 0 }} 条 · 删除 {{ syncResult.rowsDeleted || 0 }} 条</span></div>
            <div><a-button type="text" @click="syncDetailsVisible = !syncDetailsVisible">{{ syncDetailsVisible ? '收起明细' : '查看明细' }}</a-button><a-button @click="downloadSyncReport">下载报告</a-button></div>
          </div>
          <div v-if="syncDetailsVisible" class="sync-detail-groups">
            <article v-for="group in syncDetailGroups" :key="group.table">
              <h4>{{ group.table }}</h4>
              <div class="sync-result-table">
                <div class="sync-result-table-head"><span>动作</span><span>主键</span><span>结果</span><span>变更摘要</span></div>
                <div v-for="detail in group.records" :key="`${detail.type}-${detail.key}`" class="sync-detail-row" :class="`status-${detail.status.toLowerCase()}`">
                  <span>{{ operationActionLabel(detail.type) }}</span><strong>{{ detail.key }}</strong>
                  <a-tag :color="detail.status === 'SUCCESS' ? 'green' : detail.status === 'FAILED' ? 'red' : 'gray'">{{ detail.status === 'SUCCESS' ? '成功' : detail.status === 'FAILED' ? '失败' : '跳过' }}</a-tag>
                  <div><span>{{ operationDescription(detail) }}</span><small v-if="detail.error">{{ detail.error }}</small></div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </section>

      <footer v-if="currentStep < 3" class="model-wizard-footer">
        <a-button :disabled="currentStep === 1 || syncLoading" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 3 步</span>
        <a-button v-if="currentStep === 1" type="primary" :loading="tableLoading" @click="nextStep">加载表映射并继续</a-button>
        <a-button v-else-if="currentStep === 2" type="primary" :loading="compareLoading" :disabled="!selectedRows.length" @click="nextStep">开始比对</a-button>
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

.scope-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e8ef; }
.scope-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; width: 100%; }
.scope-radio-card { width: auto; min-height: 92px; margin: 0; padding: 15px; border: 1px solid #e5e8ef; border-radius: 9px; background: #fff; align-items: flex-start; }
.scope-radio-card:hover,
.scope-radio-card.arco-radio-checked { border-color: #165dff; background: #f2f7ff; }
.scope-radio-card strong,
.scope-radio-card span { display: block; }
.scope-radio-card span { margin-top: 5px; color: #7b899d; font-size: 12px; line-height: 1.5; }
.scope-detail-form { margin-top: 16px; padding: 16px 16px 0; border-radius: 9px; background: #f7f9fc; }

.mapping-heading { margin-bottom: 14px; }
.mapping-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 40px; margin-bottom: 12px; }
.mapping-toolbar > strong { color: #4e5969; font-size: 14px; }
.mapping-toolbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.mapping-auto-tip { color: #86909c; font-size: 12px; cursor: help; }
.mapping-message { margin-bottom: 12px; }
.cell-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-placeholder { color: #b0b7c3; }
.field-detail-link { padding: 0; border: 0; color: #165dff; background: transparent; font: inherit; cursor: pointer; }
.field-detail-link:disabled { color: #b0b7c3; cursor: default; }
:deep(.mapping-row-attention .arco-table-td) { background: #fffaf2; }
:deep(.mapping-row-attention:hover .arco-table-td) { background: #fff7e8; }

.mapping-detail :deep(.arco-form-item) { margin-bottom: 16px; }
.field-mapping-header { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 10px; }
.field-mapping-header span { color: #86909c; font-size: 12px; }
.field-mapping-list { max-height: 360px; overflow: auto; border: 1px solid #e5e8ef; border-radius: 8px; }
.field-mapping-labels { display: grid; grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr); gap: 10px; padding: 9px 12px; color: #86909c; background: #f7f8fa; font-size: 12px; }
.field-mapping-item { display: grid; grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 10px; min-height: 42px; padding: 0 12px; border-bottom: 1px solid #f0f1f3; cursor: pointer; }
.field-mapping-item:last-child { border-bottom: 0; }
.field-mapping-item:hover { background: #f7f8fa; }
.field-mapping-item span,
.field-mapping-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-mapping-item small { color: #86909c; font-size: 12px; }
.field-conflict-summary { margin-top: 16px; padding: 12px; border: 1px solid #f2d6ad; border-radius: 8px; background: #fffaf2; }
.field-conflict-summary p { margin: 6px 0 0; color: #6b7789; font-size: 12px; line-height: 1.6; word-break: break-all; }
.mapping-detail-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e8ef; }

.diff-review-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.diff-review-header h2 { margin: 0 0 5px; font-size: 18px; }
.diff-review-header > div > strong { color: #4e5969; font-size: 14px; font-weight: 500; }
.compare-header-actions { display: flex; gap: 8px; }

.compact-diff-stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
.compact-diff-stats > span { padding: 6px 10px; border-radius: 5px; color: #4e5969; background: #f7f8fa; font-size: 12px; }
.compact-diff-stats strong { margin-left: 5px; font-size: 15px; }
.compact-diff-stats .insert-count strong { color: #00a870; }
.compact-diff-stats .update-count strong { color: #d46b08; }
.compact-diff-stats .delete-count strong,
.compact-diff-stats .abnormal-count strong { color: #d03050; }

.diff-review-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 450px; border: 1px solid #e8eaed; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(29, 33, 41, .04); }
.diff-table-nav { overflow: auto; max-height: 650px; padding: 10px 8px; border-right: 1px solid #edf0f5; background: #fafbfc; }
.diff-table-nav button { display: block; width: 100%; margin-bottom: 4px; padding: 10px 11px; border: 1px solid transparent; border-radius: 6px; color: #4e5969; background: transparent; text-align: left; cursor: pointer; }
.diff-table-nav button:hover,
.diff-table-nav button.active { border-color: #d4e4fa; background: #f2f7ff; }
.diff-table-nav button.active strong { color: #165dff; }
.diff-table-nav strong,
.diff-table-nav span,
.diff-table-nav small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-table-nav span { margin-top: 5px; color: #86909c; font-size: 12px; }
.diff-table-nav small { margin-top: 6px; color: #a0a7b3; font-size: 11px; }
.table-diff-counts { display: flex !important; align-items: center; gap: 12px; }
.table-diff-counts span { display: inline-flex; align-items: center; gap: 5px; margin: 0; color: #6b7789; font-size: 11px; }
.table-diff-counts i { width: 7px; height: 7px; border-radius: 50%; }
.insert-dot { background: #00a870; }
.update-dot { background: #d46b08; }
.delete-dot { background: #d03050; }

.diff-record-panel { min-width: 0; padding: 16px 18px 20px; }
.diff-record-panel-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.diff-record-panel-title h3 { display: inline; margin: 0 10px 0 0; font-size: 15px; }
.diff-record-panel-title span { color: #86909c; font-size: 12px; }
.diff-record-columns { display: grid; grid-template-columns: 82px minmax(100px, 180px) minmax(0, 1fr) 64px; gap: 12px; padding: 8px 13px; border-bottom: 1px solid #edf0f5; color: #86909c; background: #fafbfc; font-size: 11px; }
.diff-record-list { border-bottom: 1px solid #edf0f5; }
.diff-record { position: relative; overflow: hidden; border-bottom: 1px solid #edf0f5; background: #fff; }
.diff-record::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ''; }
.diff-record.diff-insert::before { background: #00a870; }
.diff-record.diff-update::before { background: #d46b08; }
.diff-record.diff-delete::before { background: #d03050; }
.diff-record-summary { display: grid; grid-template-columns: 82px minmax(100px, 180px) minmax(0, 1fr) 64px; align-items: center; gap: 12px; min-height: 50px; padding: 0 13px; cursor: pointer; }
.diff-record-summary:hover { background: #fafbfc; }
.diff-record-summary > span { overflow: hidden; color: #6b7789; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.diff-record-summary :deep(.arco-btn) { color: #4e5969; background: #fff; }
.inline-diff-detail { padding: 12px 14px 14px; border-top: 1px solid #edf0f5; background: #fcfcfd; }
.field-diff-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.field-diff-table th,
.field-diff-table td { padding: 9px 10px; border-bottom: 1px solid #edf0f5; text-align: left; word-break: break-all; }
.field-diff-table th { padding: 8px 10px; border-bottom: 1px solid #e5e8ef; color: #6b7789; background: #f7f8fa; text-align: left; font-weight: 500; }
.field-diff-table tbody tr { background: #fffdf7; box-shadow: inset 3px 0 #f0b44d; }
.full-row-data { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #edf0f5; border-radius: 6px; background: #edf0f5; }
.full-row-data div { min-width: 0; padding: 9px 10px; background: #fff; }
.full-row-data span,
.full-row-data strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.full-row-data span { color: #86909c; font-size: 11px; }
.full-row-data strong { margin-top: 4px; color: #1d2129; font-size: 12px; }
.detail-limit-tip { margin: 12px 0 0; color: #86909c; font-size: 12px; }

.sync-action-dock { position: sticky; bottom: 12px; z-index: 8; margin-top: 16px; overflow: hidden; border: 1px solid #dfe3e8; border-radius: 8px; background: rgba(255, 255, 255, .96); box-shadow: 0 6px 20px rgba(29, 33, 41, .1); backdrop-filter: blur(8px); }
.sync-strategy-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #edf0f5; }
.strategy-label { margin-right: 4px; color: #86909c; font-size: 12px; }
.strategy-option { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 1px solid #e5e8ef; border-radius: 5px; color: #4e5969; background: #fff; font-size: 12px; cursor: pointer; }
.strategy-option.selected { border-color: #b9d3fb; background: #f5f9ff; }
.strategy-option small { min-width: 18px; color: #86909c; text-align: center; }
.strategy-option :deep(.arco-checkbox-label) { display: none; }
.strategy-option.delete-option.selected { border-color: #f0b8c1; background: #fff8f9; }
.delete-risk { color: #d03050; font-size: 12px; }

.sync-execute-bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 14px; background: #fff; }
.sync-execute-bar strong,
.sync-execute-bar span { display: block; }
.sync-execute-bar strong { margin-top: 3px; color: #1d2129; font-size: 14px; }
.sync-execute-bar span { color: #86909c; font-size: 11px; }

.sync-result-review { margin-top: 18px; padding: 16px 0 0; border-top: 1px solid #e5e8ef; background: #fff; }
.sync-result-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.sync-result-heading h3 { margin: 0 0 5px; font-size: 15px; }
.sync-result-heading span { color: #6b7789; font-size: 12px; }
.sync-result-heading > div:last-child { display: flex; gap: 8px; }
.sync-detail-groups { display: grid; gap: 14px; margin-top: 14px; }
.sync-detail-groups article { overflow: hidden; border: 1px solid #e5e8ef; border-radius: 7px; background: #fff; }
.sync-detail-groups h4 { margin: 0; padding: 10px 12px; border-bottom: 1px solid #edf0f5; background: #fafbfc; font-size: 13px; }
.sync-result-table-head,
.sync-detail-row { display: grid; grid-template-columns: 80px minmax(100px, 180px) 72px minmax(0, 1fr); align-items: center; gap: 12px; padding: 0 12px; }
.sync-result-table-head { min-height: 34px; border-bottom: 1px solid #edf0f5; color: #86909c; background: #fff; font-size: 11px; }
.sync-detail-row { min-height: 46px; border-bottom: 1px solid #f0f1f3; }
.sync-detail-row:last-child { border-bottom: 0; }
.sync-detail-row > span,
.sync-detail-row > div > span { color: #4e5969; font-size: 12px; }
.sync-detail-row > div > small { display: block; margin-top: 3px; color: #d03050; }
.sync-detail-row.status-failed { box-shadow: inset 3px 0 #d03050; }
.sync-detail-row.status-skipped { background: #fafbfc; }

@media (max-width: 1050px) {
  .scope-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .full-row-data { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .endpoint-details { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 760px) {
  .endpoint-grid { grid-template-columns: minmax(0, 1fr); }
  .sync-direction { transform: rotate(90deg); }
  .mapping-toolbar { align-items: flex-start; flex-direction: column; }
  .mapping-toolbar-actions { flex-wrap: wrap; justify-content: flex-start; }
  .diff-review-header,
  .sync-execute-bar { align-items: flex-start; flex-direction: column; }
  .compare-header-actions { flex-wrap: wrap; }
  .diff-review-layout { grid-template-columns: minmax(0, 1fr); }
  .diff-table-nav { display: flex; max-height: none; border-right: 0; border-bottom: 1px solid #e5e8ef; }
  .diff-table-nav button { min-width: 180px; }
  .diff-record-summary { grid-template-columns: 76px minmax(80px, 1fr) 70px; }
  .diff-record-columns { display: none; }
  .diff-record-summary > span { grid-column: 1 / -1; grid-row: 2; padding-bottom: 8px; }
  .sync-result-heading { align-items: flex-start; flex-direction: column; }
  .sync-strategy-bar { align-items: flex-start; }
  .strategy-label { width: 100%; }
  .sync-result-table-head { display: none; }
  .sync-detail-row { grid-template-columns: 64px minmax(0, 1fr) 62px; padding: 9px 12px; }
  .sync-detail-row > div { grid-column: 1 / -1; }
  .scope-card-grid,
  .full-row-data { grid-template-columns: minmax(0, 1fr); }
}
</style>
