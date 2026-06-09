<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import PageHero from '../components/PageHero.vue'
import { listDataSources, listTables } from '../api/datasource'
import { fetchTableProfile, listTableProfiles } from '../api/config'
import {
  backupData,
  createTaskCopy,
  deleteBackupRecord,
  deleteTaskCopy,
  downloadBackupPackage,
  downloadPrimaryKeyMappings,
  listBackupRecords,
  listTaskCopyRecords,
  precheckTaskCopy,
  previewBackup,
} from '../api/datasync'

const activeTab = ref('execute')
const step = ref(1)
const booting = ref(false)
const previewing = ref(false)
const backingUp = ref(false)
const copyPrechecking = ref(false)
const copyCreating = ref(false)
const profiles = ref([])
const sources = ref([])
const databaseTables = ref([])
const previewResult = ref(null)
const backupResult = ref(null)
const backupRecords = ref([])
const copyRecords = ref([])
const detailVisible = ref(false)
const detailRecord = ref(null)
const detailType = ref('backup')
const copyVisible = ref(false)
const copySource = ref(null)
const precheckResult = ref(null)
const copyResult = ref(null)
const copyProgress = ref('')
const deletingCopyNo = ref('')
const deletingBackupNo = ref('')
const backupDetailsExpanded = ref(false)

const form = reactive({
  profile: '',
  sourceId: '',
  scopeMode: 'CONDITION',
  locatorValues: {},
  commonTables: [],
  includeAttachments: true,
})

const copyForm = reactive({ sourceTaskId: '', newTaskId: '', attachmentPolicy: 'DEEP_COPY' })

const selectedProfile = computed(() => profiles.value.find((item) => item.name === form.profile) || null)
const selectedSource = computed(() => sources.value.find((item) => String(item.id) === String(form.sourceId)) || null)
const commonTableOptions = computed(() => databaseTables.value)
const visibleCopyChecks = computed(() => (precheckResult.value?.checks || []).filter((item) => item.status !== 'PASS'))
const visibleBackupDetails = computed(() => {
  const details = backupResult.value?.details || []
  return backupDetailsExpanded.value ? details : details.slice(0, 5)
})
const locatorParams = computed(() => {
  const params = selectedProfile.value?.definition?.locatorRule?.params
  return Array.isArray(params) && params.length ? params : [{ name: 'taskId', label: '任务ID' }]
})

const previewColumns = [
  { title: '数据库', dataIndex: 'database', width: 180 },
  { title: '表名', dataIndex: 'tableName', width: 280 },
  { title: '查询条件', dataIndex: 'condition', ellipsis: true, tooltip: true },
  { title: '记录数量', dataIndex: 'recordCount', width: 110 },
  { title: '附件数量', dataIndex: 'attachmentCount', width: 110 },
]

const backupColumns = [
  { title: '备份编号', dataIndex: 'backupNo', width: 190 },
  { title: '数据库模板', slotName: 'profile', width: 320 },
  { title: '备份范围', slotName: 'scopeMode', width: 120 },
  { title: '记录数', dataIndex: 'recordCount', width: 90 },
  { title: '附件数', dataIndex: 'attachmentCount', width: 90 },
  { title: '执行时间', slotName: 'executedAt', width: 180 },
  { title: '操作', slotName: 'actions', width: 270 },
]

const copyColumns = [
  { title: '副本编号', dataIndex: 'copyNo', width: 190 },
  { title: '源备份编号', dataIndex: 'backupNo', width: 190 },
  { title: '源任务ID', dataIndex: 'sourceTaskId', width: 150 },
  { title: '新任务ID', dataIndex: 'newTaskId', width: 150 },
  { title: '写入记录数', dataIndex: 'recordCount', width: 110 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '执行时间', slotName: 'executedAt', width: 180 },
  { title: '操作', slotName: 'actions', width: 180 },
]

const detailColumns = [
  { title: '数据库', dataIndex: 'database', width: 180 },
  { title: '表名', dataIndex: 'tableName', width: 280 },
  { title: '记录数量', dataIndex: 'recordCount', width: 110 },
  { title: '附件数量', dataIndex: 'attachmentCount', width: 110 },
  { title: '状态', slotName: 'status', width: 100 },
]
const backupResultColumns = [
  { title: '表名', dataIndex: 'tableName' },
  { title: '记录数', dataIndex: 'recordCount', width: 110 },
  { title: '附件数', dataIndex: 'attachmentCount', width: 110 },
  { title: '状态', slotName: 'status', width: 100 },
]

const mappingColumns = [
  { title: '表名', dataIndex: 'tableName' },
  { title: '源主键', dataIndex: 'sourcePrimaryKey' },
  { title: '新主键', dataIndex: 'newPrimaryKey' },
  { title: '处理方式', dataIndex: 'method' },
  { title: '状态', slotName: 'status' },
]

function tableName(item) {
  return item?.tableName || item?.tablename || item?.TABLE_NAME || item?.table || item?.name || String(item || '')
}

function normalizeTableList(rows) {
  return [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((item) => String(tableName(item) || '').trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

function formatDateTime(value) {
  if (!value) return '-'
  const matched = String(value).match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/)
  return matched ? `${matched[1]} ${matched[2]}` : String(value)
}

function profileDisplay(value) {
  return String(value || '-').replaceAll('\\', '/').split('/').pop()
}

function profileDisplayName(record) {
  if (record?.profileDisplayName) return record.profileDisplayName
  const fileName = profileDisplay(record?.profile)
  const profile = profiles.value.find((item) => item.name === fileName)
  return profile?.modelName || profile?.definition?.name || fileName
}

function scopeDisplay(value) {
  return value === 'FULL_DATABASE' ? '全库备份' : '按组合条件备份'
}

function statusDisplay(value) {
  return value === 'SUCCESS' || value === 'PASS' ? '成功' : value === 'FAILED' || value === 'FAIL' ? '失败' : value === 'WARNING' ? '警告' : value || '-'
}

function conditionDisplay(value) {
  if (!value || typeof value !== 'object') return '-'
  return Object.entries(value).map(([key, items]) => `${key}=${Array.isArray(items) ? items.join('、') : items}`).join('；') || '-'
}

function detailItems(record, type) {
  if (!record) return []
  if (type === 'copy') {
    return [
      ['副本编号', record.copyNo], ['源备份编号', record.backupNo], ['源任务ID', record.sourceTaskId],
      ['新任务ID', record.newTaskId], ['写入数据库', record.database], ['写入表数量', record.tableCount],
      ['写入记录数量', record.recordCount], ['附件复制数量', record.attachmentCount], ['执行人', record.operator],
      ['执行时间', formatDateTime(record.executedAt)], ['状态', statusDisplay(record.status)],
      ['附件处理', record.attachmentTablesSkipped ? '附件预检查未通过，已跳过附件表' : '按所选附件策略执行'],
    ]
  }
  return [
    ['备份编号', record.backupNo], ['数据库模板', profileDisplayName(record)], ['备份范围', scopeDisplay(record.scopeMode)],
    ['组合条件', conditionDisplay(record.conditions)], ['涉及数据库', (record.databases || []).join('、') || '-'],
    ['备份表数量', record.tableCount], ['备份记录数量', record.recordCount], ['附件数量', record.attachmentCount],
    ['备份包路径', record.packagePath], ['执行人', record.operator], ['执行时间', formatDateTime(record.executedAt)],
    ['状态', statusDisplay(record.status)],
  ]
}

function values(value) {
  return String(value || '').split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean)
}

function conditions() {
  return locatorParams.value.map((param) => ({ field: param.name, values: values(form.locatorValues[param.name]) })).filter((item) => item.values.length)
}

function payload(extra = {}) {
  return {
    profile: form.profile,
    sourceId: selectedSource.value?.id,
    sourceType: selectedSource.value?.type,
    sourceName: selectedSource.value?.name,
    scopeMode: form.scopeMode,
    conditions: conditions(),
    commonTables: form.scopeMode === 'CONDITION' ? form.commonTables : [],
    includeAttachments: form.includeAttachments,
    ...extra,
  }
}

function validateStepOne() {
  if (!selectedProfile.value || !selectedSource.value) {
    Message.warning('请选择已绑定数据源的数据库模板')
    return false
  }
  if (form.scopeMode === 'CONDITION') {
    const missing = locatorParams.value.find((item) => !values(form.locatorValues[item.name]).length)
    if (missing) {
      Message.warning(`请填写${missing.label || missing.name}`)
      return false
    }
  }
  return true
}

async function loadOptions() {
  booting.value = true
  try {
    const [sourceItems, profileFiles] = await Promise.all([listDataSources(), listTableProfiles()])
    sources.value = Array.isArray(sourceItems) ? sourceItems : []
    profiles.value = await Promise.all((profileFiles || []).map(async (item) => {
      const definition = await fetchTableProfile(item.name)
      return { ...item, definition, modelName: definition.name || item.name }
    }))
    form.profile = profiles.value[0]?.name || ''
    applyProfile()
    await loadRecords()
  } catch (error) {
    Message.error(error?.message || '加载备份配置失败')
  } finally {
    booting.value = false
  }
}

async function applyProfile() {
  const source = selectedProfile.value?.definition?.dataSource
  form.sourceId = String(source?.id || '')
  locatorParams.value.forEach((param) => { if (!(param.name in form.locatorValues)) form.locatorValues[param.name] = '' })
  form.commonTables = []
  databaseTables.value = []
  if (selectedSource.value) {
    try {
      databaseTables.value = normalizeTableList(await listTables(selectedSource.value))
    } catch {
      databaseTables.value = []
    }
  }
  resetResult()
}

async function runPreview() {
  if (!validateStepOne()) return false
  previewing.value = true
  try {
    const { data } = await previewBackup(payload())
    previewResult.value = data
    Message.success(data?.message || '备份范围预览完成')
    return true
  } catch (error) {
    Message.error(error?.message || '备份范围预览失败')
    return false
  } finally {
    previewing.value = false
  }
}

async function nextStep() {
  if (step.value === 1) {
    if (!validateStepOne() || !(await runPreview())) return
  }
  step.value++
}

function resetResult() {
  previewResult.value = null
  backupResult.value = null
  if (step.value > 2) step.value = 2
}

function startBackup() {
  if (!previewResult.value?.tableCount) return Message.warning('请先完成备份范围预览')
  Modal.confirm({
    title: '确认开始备份',
    content: `本次将备份 ${previewResult.value.tableCount} 张表、${previewResult.value.recordCount} 条记录，仅生成备份包，不写回数据库。`,
    okText: '开始备份',
    async onOk() {
      backingUp.value = true
      try {
        const { data } = await backupData(payload())
        backupResult.value = data
        backupDetailsExpanded.value = false
        Message.success(data?.message || '业务数据备份完成')
        try {
          await loadRecords()
        } catch (refreshError) {
          Message.warning(`业务数据已备份成功，但列表刷新失败：${refreshError?.message || '请手动刷新页面'}`)
        }
      } finally {
        backingUp.value = false
      }
    },
  })
}

async function downloadBackup(record) {
  if (!record?.backupNo) return
  try {
    const blob = await downloadBackupPackage(record.backupNo)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${record.backupNo}.zip`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    Message.error(error?.message || '下载备份包失败')
  }
}

async function loadRecords() {
  const [backups, copies] = await Promise.all([listBackupRecords(), listTaskCopyRecords()])
  backupRecords.value = backups?.data || backups || []
  copyRecords.value = copies?.data || copies || []
}

function showDetail(record, type) {
  detailRecord.value = record
  detailType.value = type
  detailVisible.value = true
}

function openCopy(record) {
  copySource.value = record
  copyForm.sourceTaskId = sourceTaskId(record)
  copyForm.newTaskId = ''
  copyForm.attachmentPolicy = 'DEEP_COPY'
  precheckResult.value = null
  copyResult.value = null
  copyProgress.value = ''
  copyVisible.value = true
}

function sourceTaskId(record) {
  const conditionValues = Object.values(record?.conditions || {})
  return conditionValues[0]?.[0] || ''
}

function copyPayload(extra = {}) {
  const profileSource = profiles.value.find((item) => item.name === profileDisplay(copySource.value?.profile))?.definition?.dataSource
  const source = sources.value.find((item) => String(item.id) === String(copySource.value?.sourceId || profileSource?.id))
    || sources.value.find((item) => item.name === copySource.value?.sourceName)
  return {
    profile: copySource.value?.profile,
    sourceId: source?.id || profileSource?.id,
    sourceType: source?.type || profileSource?.type,
    sourceName: source?.name || copySource.value?.sourceName || profileSource?.name,
    ...extra,
  }
}

function copyRecordPayload(record) {
  const backup = backupRecords.value.find((item) => item.backupNo === record.backupNo)
  const profileFile = profileDisplay(backup?.profile)
  const profileSource = profiles.value.find((item) => item.name === profileFile)?.definition?.dataSource
  const source = sources.value.find((item) => String(item.id) === String(backup?.sourceId || profileSource?.id))
    || sources.value.find((item) => item.name === backup?.sourceName)
  return {
    copyNo: record.copyNo,
    profile: backup?.profile,
    sourceId: source?.id || backup?.sourceId || profileSource?.id,
    sourceType: source?.type || backup?.sourceType || profileSource?.type,
    sourceName: source?.name || backup?.sourceName || profileSource?.name,
  }
}

async function runCopyPrecheck() {
  if (!copyForm.sourceTaskId.trim()) return Message.warning('请输入源任务ID')
  if (!copyForm.newTaskId.trim()) return Message.warning('请输入新的任务ID')
  copyPrechecking.value = true
  copyProgress.value = '正在连接数据库并检查新任务ID、主键规则、唯一字段和附件目录，请稍候...'
  Message.info('正在执行任务副本预检查')
  const startedAt = performance.now()
  try {
    const { data } = await precheckTaskCopy(copyPayload({
      backupNo: copySource.value.backupNo,
      sourceTaskId: copyForm.sourceTaskId.trim(),
      newTaskId: copyForm.newTaskId.trim(),
      attachmentPolicy: copyForm.attachmentPolicy,
    }))
    console.info(`[task-copy-web] precheck returned in ${Math.round(performance.now() - startedAt)} ms`, data)
    precheckResult.value = data
    if (data.canCopy && data.skipAttachmentTables) {
      copyProgress.value = '业务数据预检查已通过；附件不可复制，创建时将自动跳过附件表。'
      Message.warning('附件预检查未通过，但仍可创建副本；本次将跳过附件表')
    } else {
      copyProgress.value = data.canCopy ? '预检查已通过，可以创建任务副本。' : '预检查未通过，请处理下方检查项。'
      Message[data.canCopy ? 'success' : 'warning'](data.canCopy ? '预检查通过' : '预检查未通过')
    }
  } catch (error) {
    console.warn(`[task-copy-web] precheck failed in ${Math.round(performance.now() - startedAt)} ms`, error)
    copyProgress.value = `预检查失败：${error?.message || '服务未返回结果'}`
    Message.error(copyProgress.value)
  } finally {
    copyPrechecking.value = false
  }
}

async function executeCopy() {
  if (!copyForm.sourceTaskId.trim()) return Message.warning('请输入源任务ID')
  if (!copyForm.newTaskId.trim()) return Message.warning('请输入新的任务ID')
  copyCreating.value = true
  let phase = 'precheck'
  const startedAt = performance.now()
  try {
    if (!precheckResult.value) {
      copyProgress.value = '正在执行创建前预检查，检查通过后才会写入数据库...'
      Message.info('正在执行任务副本预检查')
      const { data: checked } = await precheckTaskCopy(copyPayload({
        backupNo: copySource.value.backupNo,
        sourceTaskId: copyForm.sourceTaskId.trim(),
        newTaskId: copyForm.newTaskId.trim(),
        attachmentPolicy: copyForm.attachmentPolicy,
      }))
      console.info(`[task-copy-web] create precheck returned in ${Math.round(performance.now() - startedAt)} ms`, checked)
      precheckResult.value = checked
    }
    if (!precheckResult.value.canCopy) {
      copyProgress.value = '预检查未通过，本次未执行任何数据库写入。请处理下方失败项后重新预检查。'
      Message.warning('预检查未通过，未执行任务副本创建')
      return
    }
    phase = 'create'
    copyProgress.value = precheckResult.value.skipAttachmentTables
      ? '业务数据预检查已通过，正在创建任务副本；本次将跳过附件表...'
      : '预检查已通过，正在重新生成主键、替换任务ID、重写外键并写入数据库，请勿关闭页面...'
    Message.info(precheckResult.value.skipAttachmentTables ? '正在创建任务副本，本次跳过附件表' : '预检查已通过，任务副本正在创建')
    const { data } = await createTaskCopy(copyPayload({
      backupNo: copySource.value.backupNo,
      sourceTaskId: copyForm.sourceTaskId.trim(),
      newTaskId: copyForm.newTaskId.trim(),
      attachmentPolicy: copyForm.attachmentPolicy,
    }))
    console.info(`[task-copy-web] create returned in ${Math.round(performance.now() - startedAt)} ms`, data)
    copyResult.value = data
    copyProgress.value = data.attachmentTablesSkipped
      ? `任务副本创建完成，共写入 ${data.recordCount || 0} 条业务记录；附件表已跳过。`
      : `任务副本创建完成，共写入 ${data.recordCount || 0} 条记录。`
    Message.success(data.message || '任务副本创建完成')
    try {
      await loadRecords()
    } catch (refreshError) {
      Message.warning(`任务副本已创建成功，但列表刷新失败：${refreshError?.message || '请手动刷新页面'}`)
    }
  } catch (error) {
    console.warn(`[task-copy-web] ${phase} failed in ${Math.round(performance.now() - startedAt)} ms`, error)
    copyProgress.value = `${phase === 'precheck' ? '预检查' : '任务副本创建'}失败：${error?.message || '服务未返回结果'}`
    Message.error(copyProgress.value)
  } finally {
    copyCreating.value = false
  }
}

function confirmDeleteCopy(record) {
  Modal.confirm({
    title: '确认删除任务副本',
    content: `将从数据库中删除新任务 ${record.newTaskId} 的 ${record.recordCount || 0} 条副本数据，并移除副本记录。该操作不可恢复。`,
    okText: '删除副本',
    okButtonProps: { status: 'danger' },
    cancelText: '取消',
    async onOk() {
      deletingCopyNo.value = record.copyNo
      Message.info('正在从数据库中删除任务副本，请稍候')
      try {
        const { data } = await deleteTaskCopy(copyRecordPayload(record))
        copyRecords.value = copyRecords.value.filter((item) => item.copyNo !== record.copyNo)
        Message.success(data?.message || '任务副本已删除')
      } catch (error) {
        Message.error(error?.message || '任务副本删除失败')
        throw error
      } finally {
        deletingCopyNo.value = ''
      }
    },
  })
}

function confirmDeleteBackup(record) {
  Modal.confirm({
    title: '确认删除备份记录',
    content: `将删除备份 ${record.backupNo} 的平台记录和备份包文件。已基于该备份创建的任务副本不会被删除。`,
    okText: '删除备份',
    okButtonProps: { status: 'danger' },
    cancelText: '取消',
    async onOk() {
      deletingBackupNo.value = record.backupNo
      Message.info('正在删除备份记录和备份包，请稍候')
      try {
        const { data } = await deleteBackupRecord(record.backupNo)
        backupRecords.value = backupRecords.value.filter((item) => item.backupNo !== record.backupNo)
        Message.success(data?.message || '备份记录已删除')
      } catch (error) {
        Message.error(error?.message || '备份记录删除失败')
        throw error
      } finally {
        deletingBackupNo.value = ''
      }
    },
  })
}

async function downloadMappings(record) {
  const blob = await downloadPrimaryKeyMappings(record.copyNo)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${record.copyNo}-主键映射.json`
  link.click()
  URL.revokeObjectURL(url)
}

watch(() => form.profile, applyProfile)
watch(() => [form.scopeMode, JSON.stringify(form.locatorValues), JSON.stringify(form.commonTables), form.includeAttachments], resetResult)
watch(() => [copyForm.sourceTaskId, copyForm.newTaskId, copyForm.attachmentPolicy], () => {
  precheckResult.value = null
  copyResult.value = null
  copyProgress.value = ''
})
onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="业务数据备份" description="先把源业务数据保存为独立备份包，再由用户基于备份记录自主创建任务副本。"
      hint="备份阶段不写数据库，不存在主键冲突；创建副本时才重新生成主键、替换任务ID并重写外键和附件路径。" />

    <a-card class="form-card" :loading="booting">
      <a-tabs v-model:active-key="activeTab" @change="loadRecords">
        <a-tab-pane key="execute" title="执行备份">
          <a-steps :current="step" class="model-wizard-steps">
            <a-step title="选择备份范围" />
            <a-step title="备份选项与预览" />
            <a-step title="开始备份" />
          </a-steps>

          <section v-if="step === 1" class="panel">
            <a-form layout="vertical">
              <a-form-item label="备份范围">
                <a-radio-group v-model="form.scopeMode" type="button">
                  <a-radio value="CONDITION">按组合条件备份</a-radio>
                  <a-radio value="FULL_DATABASE">全库备份</a-radio>
                </a-radio-group>
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="数据库模板"><a-select v-model="form.profile"><a-option v-for="item in profiles" :key="item.name" :value="item.name">{{ item.definition?.name || item.name }}</a-option></a-select></a-form-item></a-col>
                <a-col :span="12"><a-form-item label="模板绑定数据源"><a-input :model-value="selectedSource ? `${selectedSource.name} / ${selectedSource.type}` : '模板未绑定可用数据源'" disabled /></a-form-item></a-col>
              </a-row>
              <template v-if="form.scopeMode === 'CONDITION'">
                <a-divider orientation="left">组合条件</a-divider>
                <a-row :gutter="16"><a-col v-for="param in locatorParams" :key="param.name" :span="12"><a-form-item :label="param.label || param.name"><a-input v-model="form.locatorValues[param.name]" :placeholder="`请输入${param.label || param.name}`" /></a-form-item></a-col></a-row>
              <a-form-item label="本次额外备份的公共表">
                <a-select v-model="form.commonTables" multiple allow-search placeholder="从当前数据源中选择任意表；所选表将整表备份">
                  <a-option v-for="item in commonTableOptions" :key="tableName(item)" :value="tableName(item)">{{ tableName(item) }}</a-option>
                </a-select>
              </a-form-item>
              </template>
              <a-form-item label="是否备份附件"><a-switch v-model="form.includeAttachments" /></a-form-item>
            </a-form>
          </section>

          <section v-else-if="step === 2" class="panel">
            <a-spin :loading="previewing" tip="正在读取各关联表的记录数量..." class="preview-spin">
            <template v-if="previewResult">
              <div class="summary"><article><span>备份表数量</span><strong>{{ previewResult.tableCount }}</strong></article><article><span>记录数量</span><strong>{{ previewResult.recordCount }}</strong></article><article><span>附件数量</span><strong>{{ previewResult.attachmentCount }}</strong></article></div>
              <a-table :columns="previewColumns" :data="previewResult.tables" row-key="tableName" :pagination="{ pageSize: 10 }" />
            </template>
            <a-empty v-else description="正在生成备份范围预览" />
            </a-spin>
          </section>

          <section v-else class="panel">
            <div class="execute-summary"><p>范围：{{ form.scopeMode === 'FULL_DATABASE' ? '全库备份' : '按组合条件备份' }}</p><p>共 {{ previewResult?.tableCount || 0 }} 张表，{{ previewResult?.recordCount || 0 }} 条记录，{{ previewResult?.attachmentCount || 0 }} 个附件</p></div>
            <div class="center"><a-button type="primary" size="large" :loading="backingUp" @click="startBackup">开始备份</a-button></div>
            <section v-if="backupResult" class="execution-result">
              <div class="execution-result-heading"><div><strong>业务数据备份完成</strong><span>备份包已生成，可查看表级结果或创建任务副本。</span></div><a-tag color="green">成功</a-tag></div>
              <a-descriptions :column="2" bordered size="small" class="result-descriptions">
                <a-descriptions-item label="备份编号">{{ backupResult.backupNo }}</a-descriptions-item>
                <a-descriptions-item label="数据库模板">{{ profileDisplayName(backupResult) }}</a-descriptions-item>
                <a-descriptions-item label="备份范围">{{ scopeDisplay(backupResult.scopeMode) }}</a-descriptions-item>
                <a-descriptions-item label="组合条件">{{ conditionDisplay(backupResult.conditions) }}</a-descriptions-item>
                <a-descriptions-item label="备份表数量">{{ backupResult.tableCount || 0 }}</a-descriptions-item>
                <a-descriptions-item label="记录数量">{{ backupResult.recordCount || 0 }}</a-descriptions-item>
                <a-descriptions-item label="附件数量">{{ backupResult.attachmentCount || 0 }}</a-descriptions-item>
                <a-descriptions-item label="备份包路径"><a-tooltip :content="backupResult.packagePath"><span class="result-path">{{ backupResult.packagePath }}</span></a-tooltip></a-descriptions-item>
              </a-descriptions>
              <div class="result-section-heading"><strong>表级备份结果</strong><a-button v-if="(backupResult.details || []).length > 5" type="text" @click="backupDetailsExpanded = !backupDetailsExpanded">{{ backupDetailsExpanded ? '收起' : `查看全部（${backupResult.details.length}）` }}</a-button></div>
              <a-table :columns="backupResultColumns" :data="visibleBackupDetails" :pagination="false" size="small"><template #status="{ record }"><a-tag color="green">{{ statusDisplay(record.status) }}</a-tag></template></a-table>
              <div class="result-actions"><a-button @click="showDetail(backupResult, 'backup')">查看明细</a-button><a-button @click="downloadBackup(backupResult)">下载备份包</a-button><a-button type="primary" @click="openCopy(backupResult)">基于备份创建副本</a-button></div>
            </section>
          </section>

          <footer class="wizard-footer"><a-button :disabled="step === 1" @click="step--">上一步</a-button><span>第 {{ step }} / 3 步</span><a-button v-if="step < 3" type="primary" @click="nextStep">下一步</a-button></footer>
        </a-tab-pane>

        <a-tab-pane key="records" title="备份记录">
          <a-table :columns="backupColumns" :data="backupRecords" row-key="backupNo" :pagination="{ pageSize: 10 }" :scroll="{ x: 1300 }">
            <template #profile="{ record }">{{ profileDisplayName(record) }}</template>
            <template #scopeMode="{ record }">{{ record.scopeMode === 'FULL_DATABASE' ? '全库备份' : '组合条件' }}</template>
            <template #executedAt="{ record }">{{ formatDateTime(record.executedAt) }}</template>
            <template #actions="{ record }"><a-space><a-button size="small" @click="showDetail(record, 'backup')">详情</a-button><a-button size="small" type="primary" @click="openCopy(record)">创建任务副本</a-button><a-button size="small" status="danger" :loading="deletingBackupNo === record.backupNo" @click="confirmDeleteBackup(record)">删除</a-button></a-space></template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="copies" title="任务副本记录">
          <a-table :columns="copyColumns" :data="copyRecords" row-key="copyNo" :pagination="{ pageSize: 10 }">
            <template #status="{ record }"><a-tag color="green">{{ statusDisplay(record.status) }}</a-tag></template>
            <template #executedAt="{ record }">{{ formatDateTime(record.executedAt) }}</template>
            <template #actions="{ record }"><a-space><a-button size="small" @click="showDetail(record, 'copy')">详情</a-button><a-button size="small" status="danger" :loading="deletingCopyNo === record.copyNo" @click="confirmDeleteCopy(record)">删除副本</a-button></a-space></template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-modal v-model:visible="detailVisible" :title="detailType === 'backup' ? '备份详情' : '任务副本详情'" width="980px" :footer="false">
      <a-descriptions :column="3" bordered size="small">
        <a-descriptions-item v-for="item in detailItems(detailRecord, detailType)" :key="item[0]" :label="item[0]" :span="['组合条件', '备份包路径'].includes(item[0]) ? 3 : 1">{{ item[1] ?? '-' }}</a-descriptions-item>
      </a-descriptions>
      <a-divider orientation="left">按表执行详情</a-divider>
      <a-table :columns="detailColumns" :data="detailRecord?.details || []" :pagination="false" :scroll="{ x: 800 }"><template #status="{ record }"><a-tag color="green">{{ statusDisplay(record.status) }}</a-tag></template></a-table>
      <template v-if="detailType === 'copy'">
        <a-divider orientation="left">主键映射（默认前 20 条）</a-divider>
        <a-button class="download-button" @click="downloadMappings(detailRecord)">下载完整主键映射表</a-button>
        <a-table :columns="mappingColumns" :data="(detailRecord?.primaryKeyMappings || []).slice(0, 20)" :pagination="false"><template #status="{ record }"><a-tag color="green">{{ record.status }}</a-tag></template></a-table>
      </template>
    </a-modal>

    <a-modal v-model:visible="copyVisible" title="创建任务副本" width="820px" :footer="false">
      <a-alert type="info">系统将基于备份 {{ copySource?.backupNo }} 创建可修改的新任务数据，不会修改源任务。</a-alert>
      <a-form layout="vertical" class="copy-form">
        <a-form-item label="源任务ID"><a-input v-model="copyForm.sourceTaskId" placeholder="组合条件备份会自动带入；全库备份请输入要复制的源任务ID" /></a-form-item>
        <a-form-item label="新的任务ID"><a-input v-model="copyForm.newTaskId" placeholder="请输入新的任务ID，例如 newTaskId" /></a-form-item>
        <a-form-item label="附件策略"><a-radio-group v-model="copyForm.attachmentPolicy"><a-radio value="NONE">不复制附件</a-radio><a-radio value="REFERENCE">引用源附件</a-radio><a-radio value="DEEP_COPY">深拷贝附件</a-radio></a-radio-group></a-form-item>
      </a-form>
      <a-space><a-button :loading="copyPrechecking" :disabled="copyCreating" @click="runCopyPrecheck">{{ precheckResult ? '重新预检查' : '执行预检查' }}</a-button><a-button type="primary" :loading="copyCreating" :disabled="copyPrechecking" @click="executeCopy">创建任务副本</a-button></a-space>
      <a-alert v-if="copyProgress" class="copy-progress" :type="copyResult || precheckResult?.canCopy ? 'success' : precheckResult ? 'warning' : 'info'">{{ copyProgress }}</a-alert>
      <div v-if="visibleCopyChecks.length" class="checks"><article v-for="item in visibleCopyChecks" :key="item.name"><a-tag :color="item.status === 'WARNING' ? 'orange' : 'red'">{{ statusDisplay(item.status) }}</a-tag><strong>{{ item.name }}</strong><span>{{ item.detail }}</span></article></div>
      <template v-if="copyResult">
        <a-result status="success" title="任务副本创建完成" :subtitle="copyResult.attachmentTablesSkipped
          ? `副本编号 ${copyResult.copyNo}，写入 ${copyResult.tableCount || 0} 张业务表、${copyResult.recordCount || 0} 条记录；附件表已跳过`
          : `副本编号 ${copyResult.copyNo}，写入 ${copyResult.tableCount || 0} 张表、${copyResult.recordCount || 0} 条记录，复制 ${copyResult.attachmentCount || 0} 个附件`" />
        <a-table :columns="detailColumns" :data="copyResult.details || []" :pagination="{ pageSize: 8 }"><template #status="{ record }"><a-tag color="green">{{ statusDisplay(record.status) }}</a-tag></template></a-table>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.panel { padding: 24px 4px; min-height: 420px; }
.preview-spin { display: block; width: 100%; min-height: 360px; }
.toolbar, .wizard-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 18px; }
.summary article { display: grid; gap: 8px; padding: 18px; border: 1px solid #e7edf5; border-radius: 10px; background: #fafcff; }
.summary span { color: #7b899d; }
.summary strong { color: #2d6fff; font-size: 26px; }
.wizard-footer { padding-top: 20px; border-top: 1px solid #edf0f5; }
.center { display: flex; justify-content: center; padding: 28px; }
.execute-summary { padding: 18px; border: 1px solid #dce8ff; border-radius: 10px; background: #f8fbff; }
.copy-form { margin-top: 18px; }
.checks { display: grid; gap: 10px; margin-top: 18px; }
.checks article { display: grid; grid-template-columns: 60px 150px 1fr; align-items: center; gap: 10px; padding: 10px; background: #f7f9fc; border-radius: 8px; }
.checks span { color: #68778d; }
.download-button { margin-bottom: 12px; }
.copy-progress { margin-top: 16px; }
</style>
