<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { IconArrowRight, IconRefresh, IconSearch } from '@arco-design/web-vue/es/icon'
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
  fieldMismatchPolicy: 'MANUAL_CONFIRM',
  failurePolicy: 'ROLLBACK',
  syncAttachmentRecords: true,
  syncAttachmentFiles: false,
})

const mappingColumns = [
  { title: '参与', slotName: 'selected', width: 68 },
  { title: '源表', dataIndex: 'sourceTableName', width: 190 },
  { title: '目标表映射', slotName: 'targetTable', width: 240 },
  { title: '同步字段', slotName: 'fields', width: 300 },
  { title: '匹配情况', slotName: 'matching', width: 210 },
  { title: '人工确认', slotName: 'confirmed', width: 120 },
]

const diffColumns = [
  { title: '源表', dataIndex: 'sourceTable', width: 180 },
  { title: '目标表', dataIndex: 'targetTable', width: 180 },
  { title: '源行数', dataIndex: 'sourceCount', width: 90 },
  { title: '目标行数', dataIndex: 'targetCount', width: 90 },
  { title: '待插入', dataIndex: 'insertRecords', width: 90 },
  { title: '待更新', dataIndex: 'updateRecords', width: 90 },
  { title: '待删除', dataIndex: 'deleteRecords', width: 90 },
  { title: '状态', slotName: 'consistent', width: 90 },
]

const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)
const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)
const businessIdentifierName = computed(() => selectedProfile.value?.businessIdentifierName || '业务主键值')
const selectedRows = computed(() =>
  tableRows.value.filter((row) =>
    row.selected && row.targetTableName && row.selectedColumns.length > 0 && row.confirmed,
  ),
)
const autoMatchedRows = computed(() =>
  tableRows.value.filter((row) => row.autoMatched && row.commonColumns.length > 0),
)
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
const syncPolicyText = computed(() => ({
  INSERT_ONLY: '只插入',
  INSERT_UPDATE: '插入并更新',
  INSERT_UPDATE_DELETE: '插入、更新、删除',
  MIRROR: '目标库完全以源库为准',
}[form.syncPolicy]))
const conflictPolicyText = computed(() => ({
  SOURCE_WINS: '源库优先',
  TARGET_WINS: '目标库优先',
  SKIP: '跳过冲突数据',
}[form.conflictPolicy]))

function normalizeName(row) {
  return String(row?.tableName || row?.TABLE_NAME || row?.table || Object.values(row || {})[0] || '')
}

function normalizeColumn(row) {
  return String(row?.columnName || row?.COLUMN_NAME || row?.Field || row?.field || Object.values(row || {})[0] || '')
}

function sameName(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

function endpointLabel(item) {
  return item ? `${item.name} - ${item.type}` : '未选择'
}

function renderCondition(template) {
  if (!template) return '1 = 1'
  const value = String(form.businessValue || '').replaceAll("'", "''")
  return String(template).replace(/\$\{(?:taskId|task_id)\}/gi, value)
}

function resetResults() {
  compareResult.value = null
  syncResult.value = null
}

async function loadEndpointTables() {
  sourceTables.value = []
  targetTables.value = []
  tableRows.value = []
  resetResults()
  if (!selectedSource.value || !selectedTarget.value || sameName(form.sourceId, form.targetId)) return
  tableLoading.value = true
  try {
    const [source, target] = await Promise.all([
      listTables(selectedSource.value),
      listTables(selectedTarget.value),
    ])
    sourceTables.value = (source || []).map(normalizeName).filter(Boolean)
    targetTables.value = (target || []).map(normalizeName).filter(Boolean)
    form.selectedTables = form.selectedTables.filter((table) => sourceTables.value.includes(table))
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
    Message.error(errorMessage(error, '加载业务数据模型失败'))
  }
}

function scopeCandidates() {
  if (form.scopeMode === 'SELECTED_TABLES') {
    return form.selectedTables.map((tableName) => ({ tableName, condition: '1 = 1' }))
  }
  if (form.scopeMode === 'BUSINESS_MODEL') {
    return (selectedProfile.value?.autoTaskTables || [])
      .filter((item) => item.tableName)
      .map((item) => ({ tableName: item.tableName, condition: renderCondition(item.taskConditionTemplate) }))
  }
  return sourceTables.value.map((tableName) => ({ tableName, condition: '1 = 1' }))
}

async function buildMappingRow(candidate) {
  const targetTableName = targetTables.value.find((table) => sameName(table, candidate.tableName)) || ''
  const [sourceResult, targetResult] = await Promise.all([
    listColumns(selectedSource.value, candidate.tableName),
    targetTableName ? listColumns(selectedTarget.value, targetTableName) : Promise.resolve([]),
  ])
  const sourceColumns = (sourceResult || []).map(normalizeColumn).filter(Boolean)
  const targetColumns = (targetResult || []).map(normalizeColumn).filter(Boolean)
  const commonColumns = sourceColumns.filter((column) => targetColumns.some((target) => sameName(column, target)))
  const unmatchedSource = sourceColumns.filter((column) => !targetColumns.some((target) => sameName(column, target)))
  const unmatchedTarget = targetColumns.filter((column) => !sourceColumns.some((source) => sameName(column, source)))
  return {
    sourceTableName: candidate.tableName,
    targetTableName,
    sourceCondition: candidate.condition,
    targetCondition: candidate.condition,
    sourceColumns,
    targetColumns,
    commonColumns,
    selectedColumns: [...commonColumns],
    unmatchedSource,
    unmatchedTarget,
    selected: Boolean(targetTableName && commonColumns.length),
    autoMatched: Boolean(targetTableName),
    confirmed: Boolean(targetTableName && commonColumns.length && !unmatchedSource.length && !unmatchedTarget.length),
  }
}

async function refreshMappings() {
  if (!validateDirection() || !validateScope()) return false
  tableLoading.value = true
  resetResults()
  try {
    const candidates = scopeCandidates()
    tableRows.value = await Promise.all(candidates.map(buildMappingRow))
    if (!autoMatchedRows.value.length) {
      Message.warning('未发现可自动同步的表，请检查表结构或手动配置表映射关系')
    }
    return true
  } catch (error) {
    tableRows.value = []
    Message.error(errorMessage(error, '加载表和字段失败'))
    return false
  } finally {
    tableLoading.value = false
  }
}

async function changeTargetTable(row, tableName) {
  row.targetTableName = tableName || ''
  row.autoMatched = sameName(row.sourceTableName, tableName)
  row.confirmed = false
  row.targetColumns = []
  row.commonColumns = []
  row.selectedColumns = []
  row.unmatchedSource = [...row.sourceColumns]
  row.unmatchedTarget = []
  resetResults()
  if (!tableName) return
  try {
    const result = await listColumns(selectedTarget.value, tableName)
    row.targetColumns = (result || []).map(normalizeColumn).filter(Boolean)
    row.commonColumns = row.sourceColumns.filter((column) => row.targetColumns.some((target) => sameName(column, target)))
    row.selectedColumns = [...row.commonColumns]
    row.unmatchedSource = row.sourceColumns.filter((column) => !row.targetColumns.some((target) => sameName(column, target)))
    row.unmatchedTarget = row.targetColumns.filter((column) => !row.sourceColumns.some((source) => sameName(column, source)))
    row.selected = row.commonColumns.length > 0
    row.confirmed = Boolean(row.commonColumns.length && !row.unmatchedSource.length && !row.unmatchedTarget.length)
  } catch (error) {
    Message.error(errorMessage(error, `加载目标表 ${tableName} 字段失败`))
  }
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
    Message.warning('请勾选至少一张数据库表')
    return false
  }
  if (form.scopeMode === 'BUSINESS_MODEL' && (!selectedProfile.value || !form.businessValue.trim())) {
    Message.warning(`请选择业务数据模型并填写${businessIdentifierName.value}`)
    return false
  }
  return true
}

function validateMappings() {
  const candidates = tableRows.value.filter((row) => row.selected)
  if (!candidates.length) {
    Message.warning('请选择至少一张要参与比对的表')
    return false
  }
  if (candidates.some((row) => !row.targetTableName || !row.selectedColumns.length)) {
    Message.warning('参与比对的表必须配置目标表并选择同步字段')
    return false
  }
  if (candidates.some((row) => !row.confirmed)) {
    Message.warning('存在未人工确认的字段匹配结果')
    return false
  }
  return true
}

function buildPayload() {
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
    syncAttachmentRecords: form.syncAttachmentRecords,
    syncAttachmentFiles: form.syncAttachmentFiles,
    tables: selectedRows.value.map((row) => ({
      tableName: row.sourceTableName,
      targetTableName: row.targetTableName,
      columns: row.selectedColumns,
      sourceCondition: row.sourceCondition,
      targetCondition: row.targetCondition,
    })),
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
  Modal.confirm({
    title: '确认开始同步',
    content: `将按“${syncPolicyText.value}”策略，把 ${selectedSource.value.name} 的 ${selectedRows.value.length} 张表同步到 ${selectedTarget.value.name}。`,
    okText: '开始同步',
    cancelText: '取消',
    okButtonProps: { status: form.syncPolicy === 'INSERT_ONLY' ? 'normal' : 'danger' },
    async onOk() {
      syncLoading.value = true
      try {
        const { data } = await syncData(buildPayload())
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
  if (currentStep.value === 1 && !validateDirection()) return
  if (currentStep.value === 2 && !(await refreshMappings())) return
  if (currentStep.value === 3 && !(await runCompare())) return
  if (currentStep.value === 4 && !compareResult.value) {
    Message.warning('请先执行差异比对')
    return
  }
  currentStep.value = Math.min(6, currentStep.value + 1)
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
    form.targetId = String(dataSources.value[1]?.id || '')
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
watch(() => [form.scopeMode, form.selectedTables, form.businessValue], resetResults, { deep: true })
onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="比对同步" description="按明确流程选择同步方向和范围，完成字段映射与差异确认后再修改目标数据库。"
      hint="差异比对只读取数据；开始同步后会按所选策略插入、更新或删除目标库数据。" />

    <a-card class="form-card sync-wizard" :loading="booting">
    <a-steps :current="currentStep" class="model-wizard-steps">
      <a-step title="同步方向" description="选择源库和目标库" />
      <a-step title="同步范围" description="确定要比对的数据" />
      <a-step title="必要条件" description="加载并确认表字段" />
      <a-step title="差异比对" description="查看待处理数据" />
      <a-step title="确认同步" description="复核本次选项" />
      <a-step title="开始同步" description="执行并查看结果" />
    </a-steps>

    <section v-if="currentStep === 1" class="model-step-panel">
      <div class="step-intro">
        <h2>选择同步方向</h2>
        <p>数据将从源数据库写入目标数据库，目标数据库可能发生修改。</p>
      </div>
      <div class="sync-endpoint-row">
        <article class="sync-endpoint-panel">
          <h3>源数据库</h3>
          <a-select v-model="form.sourceId" placeholder="请选择源数据库">
            <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
              {{ item.name }} - {{ item.type }}
            </a-option>
          </a-select>
          <strong>{{ endpointLabel(selectedSource) }}</strong>
        </article>
        <div class="sync-direction"><icon-arrow-right /></div>
        <article class="sync-endpoint-panel target">
          <h3>目标数据库</h3>
          <a-select v-model="form.targetId" placeholder="请选择目标数据库">
            <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
              {{ item.name }} - {{ item.type }}
            </a-option>
          </a-select>
          <strong>{{ endpointLabel(selectedTarget) }}</strong>
        </article>
      </div>
    </section>

    <section v-else-if="currentStep === 2" class="model-step-panel">
      <div class="step-intro">
        <h2>选择同步范围</h2>
        <p>全库会处理所有可映射表；业务模型只处理指定业务主键关联的数据。</p>
      </div>
      <a-radio-group v-model="form.scopeMode" class="scope-choice-list">
        <a-radio value="FULL_DATABASE">
          <strong>全库比对</strong>
          <span>加载源数据库中的全部表，并自动匹配目标库同名表。</span>
        </a-radio>
        <a-radio value="SELECTED_TABLES">
          <strong>勾选多个数据库表比对</strong>
          <span>只加载下方选中的源数据库表。</span>
        </a-radio>
        <a-radio value="BUSINESS_MODEL">
          <strong>按业务模型比对</strong>
          <span>根据业务模型中的主表和关联规则，只比对一个业务主键对应的数据。</span>
        </a-radio>
      </a-radio-group>
      <a-form v-if="form.scopeMode === 'SELECTED_TABLES'" layout="vertical" class="scope-detail-form">
        <a-form-item label="选择数据库表">
          <a-select v-model="form.selectedTables" multiple allow-search allow-clear placeholder="可勾选多张表">
            <a-option v-for="table in sourceTables" :key="table" :value="table">{{ table }}</a-option>
          </a-select>
        </a-form-item>
      </a-form>
      <a-form v-if="form.scopeMode === 'BUSINESS_MODEL'" layout="vertical" class="scope-detail-form">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="业务数据模型">
              <a-select v-model="form.profile" placeholder="请选择业务数据模型">
                <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                  {{ item.modelName || item.name }}
                </a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="businessIdentifierName">
              <a-input v-model="form.businessValue" :placeholder="`例如：1896780229075202049`" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-divider orientation="left">本次同步选项</a-divider>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="写入策略">
              <a-select v-model="form.syncPolicy">
                <a-option value="INSERT_ONLY">只新增</a-option>
                <a-option value="INSERT_UPDATE">新增并更新</a-option>
                <a-option value="INSERT_UPDATE_DELETE">新增、更新并删除</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="冲突处理方式">
              <a-select v-model="form.conflictPolicy">
                <a-option value="SOURCE_WINS">源库优先</a-option>
                <a-option value="TARGET_WINS">目标库优先</a-option>
                <a-option value="SKIP">跳过冲突数据</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="字段不一致处理">
              <a-select v-model="form.fieldMismatchPolicy">
                <a-option value="MANUAL_CONFIRM">人工确认字段映射</a-option>
                <a-option value="INTERSECTION">只同步同名字段交集</a-option>
                <a-option value="STOP">字段不一致则终止</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="失败处理方式">
              <a-select v-model="form.failurePolicy">
                <a-option value="ROLLBACK">失败后回滚本次同步</a-option>
                <a-option value="SKIP_FAILED_TABLE">跳过失败表继续</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="同步附件记录">
              <a-switch v-model="form.syncAttachmentRecords" checked-text="同步" unchecked-text="不同步" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="同步实际附件文件">
              <a-switch v-model="form.syncAttachmentFiles" checked-text="同步" unchecked-text="不同步" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </section>

    <section v-else-if="currentStep === 3" class="model-step-panel">
      <div class="step-action-row">
        <div class="step-intro">
          <h2>加载表和字段</h2>
          <p>系统自动匹配同名表和同名字段；存在差异时需要人工确认。</p>
        </div>
        <a-button :loading="tableLoading" @click="refreshMappings">
          <template #icon><icon-refresh /></template>
          刷新字段
        </a-button>
      </div>
      <div v-if="!autoMatchedRows.length" class="sync-empty-guidance">
        <strong>未发现可自动同步的表。</strong>
        <p>可能原因：</p>
        <ol>
          <li>源数据库和目标数据库表名不一致；</li>
          <li>字段尚未加载；</li>
          <li>当前未选择业务数据模型；</li>
          <li>目标数据库缺少对应表结构。</li>
        </ol>
        <p>你可以：</p>
        <ul>
          <li>点击“刷新字段”</li>
          <li>选择业务数据模型</li>
          <li>手动配置表映射关系</li>
        </ul>
      </div>
      <a-table :columns="mappingColumns" :data="tableRows" :loading="tableLoading" :pagination="{ pageSize: 8 }" row-key="sourceTableName">
        <template #selected="{ record }">
          <a-checkbox v-model="record.selected" :disabled="!record.targetTableName || !record.selectedColumns.length" @change="resetResults" />
        </template>
        <template #targetTable="{ record }">
          <a-select :model-value="record.targetTableName" allow-search allow-clear placeholder="手动选择目标表"
            @change="(value) => changeTargetTable(record, value)">
            <a-option v-for="table in targetTables" :key="table" :value="table">{{ table }}</a-option>
          </a-select>
        </template>
        <template #fields="{ record }">
          <a-select v-model="record.selectedColumns" multiple allow-clear placeholder="请选择确认同步的同名字段"
            @change="() => { record.confirmed = false; resetResults() }">
            <a-option v-for="column in record.commonColumns" :key="column" :value="column">{{ column }}</a-option>
          </a-select>
        </template>
        <template #matching="{ record }">
          <div class="matching-status">
            <a-tag :color="record.targetTableName ? 'green' : 'red'">
              {{ record.targetTableName ? `${record.commonColumns.length} 个同名字段` : '未映射目标表' }}
            </a-tag>
            <span v-if="record.unmatchedSource.length || record.unmatchedTarget.length">
              源独有 {{ record.unmatchedSource.length }}，目标独有 {{ record.unmatchedTarget.length }}
            </span>
            <span v-else-if="record.targetTableName">字段完全匹配</span>
          </div>
        </template>
        <template #confirmed="{ record }">
          <a-checkbox v-model="record.confirmed" :disabled="!record.targetTableName || !record.selectedColumns.length" @change="resetResults">
            已确认
          </a-checkbox>
        </template>
      </a-table>
    </section>

    <section v-else-if="currentStep === 4" class="model-step-panel">
      <div class="step-action-row">
        <div class="step-intro">
          <h2>执行差异比对</h2>
          <p>只读取数据，不会修改源数据库或目标数据库。</p>
        </div>
        <a-button type="primary" :loading="compareLoading" @click="runCompare">
          <template #icon><icon-search /></template>
          重新比对
        </a-button>
      </div>
      <div class="diff-summary">
        <article><span>参与表</span><strong>{{ summary.totalTables }}</strong></article>
        <article><span>差异表</span><strong>{{ summary.inconsistentTables }}</strong></article>
        <article><span>源库有、目标库没有：待插入</span><strong>{{ summary.insertRecords }}</strong></article>
        <article><span>两边都有但内容不同：待更新</span><strong>{{ summary.updateRecords }}</strong></article>
        <article><span>源库没有、目标库有：待删除</span><strong>{{ summary.deleteRecords }}</strong></article>
      </div>
      <a-table :columns="diffColumns" :data="diffRows" :pagination="{ pageSize: 8 }" row-key="sourceTable">
        <template #consistent="{ record }">
          <a-tag :color="record.consistent ? 'green' : 'orange'">{{ record.consistent ? '一致' : '有差异' }}</a-tag>
        </template>
      </a-table>
    </section>

    <section v-else-if="currentStep === 5" class="model-step-panel">
      <div class="step-intro">
        <h2>确认本次同步</h2>
        <p>复核差异比对结果和本次执行选项，下一步将真正修改目标数据库。</p>
      </div>
      <a-descriptions bordered :column="2">
        <a-descriptions-item label="写入策略">{{ syncPolicyText }}</a-descriptions-item>
        <a-descriptions-item label="冲突处理">{{ conflictPolicyText }}</a-descriptions-item>
        <a-descriptions-item label="字段不一致">{{ form.fieldMismatchPolicy === 'MANUAL_CONFIRM' ? '人工确认字段映射' : form.fieldMismatchPolicy === 'INTERSECTION' ? '只同步字段交集' : '终止同步' }}</a-descriptions-item>
        <a-descriptions-item label="失败处理">{{ form.failurePolicy === 'ROLLBACK' ? '失败后回滚' : '跳过失败表继续' }}</a-descriptions-item>
        <a-descriptions-item label="附件记录">{{ form.syncAttachmentRecords ? '同步' : '不同步' }}</a-descriptions-item>
        <a-descriptions-item label="实际附件文件">{{ form.syncAttachmentFiles ? '同步' : '不同步' }}</a-descriptions-item>
      </a-descriptions>
      <a-alert type="warning">同步操作会修改目标数据库。源数据库只读，不会被修改。</a-alert>
    </section>

    <section v-else class="model-step-panel">
      <div class="step-intro">
        <h2>开始同步</h2>
        <p>请确认同步方向、范围和策略，执行后查看写入结果。</p>
      </div>
      <div class="sync-confirm-grid">
        <article><span>同步方向</span><strong>{{ endpointLabel(selectedSource) }} → {{ endpointLabel(selectedTarget) }}</strong></article>
        <article><span>参与表</span><strong>{{ selectedRows.length }} 张</strong></article>
        <article><span>同步策略</span><strong>{{ syncPolicyText }}</strong></article>
        <article><span>预计处理</span><strong>插入 {{ summary.insertRecords }} / 更新 {{ summary.updateRecords }} / 删除 {{ summary.deleteRecords }}</strong></article>
      </div>
      <div class="sync-start-row">
        <a-button type="primary" status="danger" size="large" :loading="syncLoading" @click="runSync">开始同步</a-button>
      </div>
      <a-result v-if="syncResult" status="success" title="同步完成"
        :subtitle="`插入 ${syncResult.rowsInserted || 0} 条，更新 ${syncResult.rowsUpdated || 0} 条，删除 ${syncResult.rowsDeleted || 0} 条`" />
    </section>

    <footer class="model-wizard-footer">
      <a-button :disabled="currentStep === 1" @click="previousStep">上一步</a-button>
      <span>第 {{ currentStep }} / 6 步</span>
      <a-button v-if="currentStep < 6" type="primary" :loading="tableLoading || compareLoading" @click="nextStep">
        {{ currentStep === 3 ? '执行差异比对' : '下一步' }}
      </a-button>
    </footer>
    </a-card>
  </div>
</template>

<style scoped>
.sync-wizard {
  min-height: calc(100vh - 84px);
}

.step-intro h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.step-intro p {
  margin: 0;
  color: #7b899d;
}

.step-action-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.sync-endpoint-row {
  display: grid;
  grid-template-columns: 1fr 64px 1fr;
  align-items: stretch;
  gap: 16px;
  margin-top: 24px;
}

.sync-endpoint-panel {
  min-height: 190px;
  padding: 24px;
  border: 1px solid #dbe7ff;
  border-radius: 12px;
  background: #f8fbff;
}

.sync-endpoint-panel.target {
  border-color: #dceee7;
  background: #f8fdfb;
}

.sync-endpoint-panel h3 {
  margin: 0 0 18px;
}

.sync-endpoint-panel strong {
  display: block;
  margin-top: 22px;
  color: #48617f;
}

.sync-direction {
  display: grid;
  place-items: center;
  color: #2d6fff;
  font-size: 28px;
}

.scope-choice-list,
.policy-choice-list {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.scope-choice-list :deep(.arco-radio),
.policy-choice-list :deep(.arco-radio) {
  display: flex;
  align-items: flex-start;
  padding: 16px 18px;
  border: 1px solid #e6ebf2;
  border-radius: 10px;
}

.scope-choice-list :deep(.arco-radio-label),
.policy-choice-list :deep(.arco-radio-label) {
  display: grid;
  gap: 5px;
}

.scope-choice-list span,
.policy-choice-list span {
  color: #7b899d;
}

.scope-detail-form {
  margin-top: 20px;
  padding: 18px;
  border-radius: 10px;
  background: #f7f9fc;
}

.sync-empty-guidance {
  margin-bottom: 16px;
  padding: 16px 20px;
  border: 1px solid #ffd8a8;
  border-radius: 10px;
  color: #5f4b32;
  background: #fffaf2;
}

.sync-empty-guidance p,
.sync-empty-guidance ol,
.sync-empty-guidance ul {
  margin: 8px 0 0;
}

.matching-status {
  display: grid;
  gap: 6px;
  color: #7b899d;
  font-size: 12px;
}

.diff-summary,
.sync-confirm-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0;
}

.diff-summary article,
.sync-confirm-grid article {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid #edf1f7;
  border-radius: 10px;
  background: #fafcff;
}

.diff-summary span,
.sync-confirm-grid span {
  color: #7b899d;
}

.diff-summary strong {
  color: #2d6fff;
  font-size: 24px;
}

.sync-confirm-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sync-start-row {
  display: flex;
  justify-content: center;
  padding: 26px 0 8px;
}
</style>
