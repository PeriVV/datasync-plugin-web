<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { deleteTableProfile, fetchTableProfile, listTableProfiles, saveTableProfile } from '../api/config'
import { listDataSources, listTables } from '../api/datasource'
import PageHero from '../components/PageHero.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loadingList = ref(false)
const loadingProfile = ref(false)
const loadingDataSources = ref(false)
const saving = ref(false)
const profiles = ref([])
const dataSources = ref([])
const activeProfileName = ref('')
const activeProfilePath = ref('')
const previewVisible = ref(false)
const previewLoading = ref(false)
const previewProfileName = ref('')
const previewProfileJson = ref('')
const createProfileVisible = ref(false)
const creatingProfile = ref(false)
const createProfileForm = reactive({
  fileName: '',
  name: '',
  dataSourceId: '',
  detectTablesText: '',
})
const tablePickerVisible = ref(false)
const tablePickerLoadingSources = ref(false)
const tablePickerLoadingTables = ref(false)
const tablePickerTarget = ref('autoTaskTables')
const tablePickerSources = ref([])
const tablePickerSourceId = ref('')
const tablePickerTables = ref([])
const tablePickerSelectedTables = ref([])
const fileConfigVisible = ref(false)
const activeFileRow = ref(null)

const profile = reactive({
  name: '',
  dataSourceId: '',
  dataSourceType: '',
  dataSourceName: '',
  dataSourceUrl: '',
  detectTablesText: '',
  autoTaskTables: [],
  backupTables: [],
})

const taskConditionTip = "表示这张表导出数据的 WHERE 条件。占位符必须和导出页选择的标识字段一致，例如标识字段选 task_id，这里就写 ${task_id}。"
const boundDataSource = computed(() => findDataSource(profile.dataSourceId, profile.dataSourceType, profile.dataSourceName))
const createBoundDataSource = computed(() => findDataSource(createProfileForm.dataSourceId))
const tablePickerTitle = computed(() => '选择导出表')
const tablePickerSource = computed(() =>
  tablePickerSources.value.find((item) => String(item.id) === String(tablePickerSourceId.value)) || null,
)

const tableColumns = [
  { title: '表名', dataIndex: 'tableName', slotName: 'tableName', width: 190 },
  { title: '键列', dataIndex: 'keyColumn', slotName: 'keyColumn', width: 110 },
  { title: '条件', titleSlotName: 'taskConditionTitle', dataIndex: 'taskConditionTemplate', slotName: 'taskConditionTemplate', width: 420 },
  { title: '附件', dataIndex: 'fileTable', slotName: 'fileTable', width: 150 },
  { title: '操作', slotName: 'actions', width: 78 },
]

const backupColumns = [
  { title: '源表', dataIndex: 'sourceTable', slotName: 'sourceTable' },
  { title: '备份表', dataIndex: 'targetTable', slotName: 'targetTable' },
  { title: '条件', titleSlotName: 'taskConditionTitle', dataIndex: 'taskConditionTemplate', slotName: 'taskConditionTemplate', width: 300 },
  { title: '操作', slotName: 'actions', width: 78 },
]

function splitLines(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanTableScope(row) {
  const attachmentMode = row.attachmentMode || (row.filePathTemplate ? 'template' : 'column')
  return {
    tableName: row.tableName || '',
    keyColumn: row.keyColumn || 'id',
    taskConditionTemplate: row.taskConditionTemplate || null,
    fileTable: Boolean(row.fileTable),
    fileColumn: row.fileTable && attachmentMode === 'column' && row.fileColumn ? row.fileColumn : null,
    filePathTemplate: row.fileTable && attachmentMode === 'template' && row.filePathTemplate ? row.filePathTemplate : null,
    dependencyOrder: Number(row.dependencyOrder || 0),
  }
}

function toEditableTableScope(row = {}) {
  return {
    tableName: row.tableName || '',
    keyColumn: row.keyColumn || 'id',
    taskConditionTemplate: row.taskConditionTemplate || '',
    fileTable: Boolean(row.fileTable),
    fileColumn: row.fileColumn || '',
    filePathTemplate: row.filePathTemplate || '',
    attachmentMode: row.filePathTemplate ? 'template' : 'column',
    dependencyOrder: Number(row.dependencyOrder || 0),
  }
}

function toEditableBackup(row = {}) {
  return {
    sourceTable: row.sourceTable || '',
    targetTable: row.targetTable || '',
    taskConditionTemplate: row.taskConditionTemplate || '',
  }
}

function dataSourceSnapshot(source) {
  if (!source) {
    return null
  }
  return {
    id: String(source.id || ''),
    type: source.type || '',
    name: source.name || '',
    url: source.url || '',
  }
}

function findDataSource(id, type = '', name = '') {
  if (id !== undefined && id !== null && String(id).trim()) {
    const found = dataSources.value.find((item) => String(item.id) === String(id))
    if (found) {
      return found
    }
  }
  if (type && name) {
    return dataSources.value.find(
      (item) => String(item.type) === String(type) && String(item.name) === String(name),
    ) || null
  }
  return null
}

function applyDataSourceToProfile(source) {
  profile.dataSourceId = source ? String(source.id || '') : ''
  profile.dataSourceType = source?.type || ''
  profile.dataSourceName = source?.name || ''
  profile.dataSourceUrl = source?.url || ''
}

function currentProfileDataSource() {
  const source = dataSourceSnapshot(boundDataSource.value)
  if (source) {
    return source
  }
  if (profile.dataSourceId || profile.dataSourceType || profile.dataSourceName || profile.dataSourceUrl) {
    return {
      id: profile.dataSourceId || '',
      type: profile.dataSourceType || '',
      name: profile.dataSourceName || '',
      url: profile.dataSourceUrl || '',
    }
  }
  return null
}

function applyProfile(data = {}) {
  profile.name = data.name || ''
  const dataSource = data.dataSource || {}
  profile.dataSourceId = dataSource.id ? String(dataSource.id) : ''
  profile.dataSourceType = dataSource.type || ''
  profile.dataSourceName = dataSource.name || ''
  profile.dataSourceUrl = dataSource.url || ''
  profile.detectTablesText = Array.isArray(data.detectTables) ? data.detectTables.join(', ') : ''
  profile.autoTaskTables = Array.isArray(data.autoTaskTables)
    ? data.autoTaskTables.map(toEditableTableScope)
    : []
  profile.backupTables = Array.isArray(data.backupTables)
    ? data.backupTables.map(toEditableBackup)
    : []
}

function cleanBackup(row) {
  return {
    sourceTable: row.sourceTable || '',
    targetTable: row.targetTable || '',
    taskConditionTemplate: row.taskConditionTemplate || null,
  }
}

function nonEmptyTableScope(row) {
  return row.tableName && row.tableName.trim()
}

function nonEmptyBackup(row) {
  return row.sourceTable && row.sourceTable.trim() && row.targetTable && row.targetTable.trim()
}

const profileJsonObject = computed(() => ({
  name: profile.name || 'custom_profile',
  ...(currentProfileDataSource() ? { dataSource: currentProfileDataSource() } : {}),
  detectTables: splitLines(profile.detectTablesText),
  autoTaskTables: profile.autoTaskTables.filter(nonEmptyTableScope).map(cleanTableScope),
  backupTables: profile.backupTables.filter(nonEmptyBackup).map(cleanBackup),
}))

const profileJson = computed(() => JSON.stringify(profileJsonObject.value, null, 2))

function tableName(item) {
  return item?.tableName || Object.values(item || {})[0] || ''
}

function createTableScope(table = '') {
  return {
    tableName: table,
    keyColumn: 'id',
    taskConditionTemplate: "task_id = '${task_id}'",
    fileTable: false,
    fileColumn: '',
    filePathTemplate: '',
    attachmentMode: 'column',
    dependencyOrder: 0,
  }
}

function normalizeProfileFileName(value) {
  const name = String(value || '').trim()
  if (!name) {
    return ''
  }
  return name.toLowerCase().endsWith('.json') ? name : `${name}.json`
}

function toProfileName(value) {
  return normalizeProfileFileName(value).replace(/\.json$/i, '')
}

async function openCreateProfile() {
  await loadDataSources()
  const baseName = `dm_sample_${Date.now()}`
  createProfileForm.fileName = `${baseName}.json`
  createProfileForm.name = baseName
  createProfileForm.dataSourceId = profile.dataSourceId || (dataSources.value[0] ? String(dataSources.value[0].id) : '')
  createProfileForm.detectTablesText = ''
  createProfileVisible.value = true
}

async function createProfile() {
  const fileName = normalizeProfileFileName(createProfileForm.fileName)
  if (!fileName) {
    Message.warning('请填写数据库模型文件名')
    return
  }
  if (!/^[A-Za-z0-9_-]+\.json$/.test(fileName)) {
    Message.warning('文件名只能包含字母、数字、下划线和中划线')
    return
  }
  if (profiles.value.some((item) => item.name.toLowerCase() === fileName.toLowerCase())) {
    Message.warning('数据库模型文件已存在')
    return
  }
  const dataSource = dataSourceSnapshot(createBoundDataSource.value)
  const nextProfile = {
    name: createProfileForm.name.trim() || toProfileName(fileName),
    ...(dataSource ? { dataSource } : {}),
    detectTables: splitLines(createProfileForm.detectTablesText),
    autoTaskTables: [],
    backupTables: [],
  }
  creatingProfile.value = true
  try {
    const res = await saveTableProfile(fileName, nextProfile)
    Message.success(res?.message || '数据库模型已创建')
    createProfileVisible.value = false
    await loadProfiles(fileName)
  } catch (error) {
    Message.error(error?.message || '创建数据库模型失败')
  } finally {
    creatingProfile.value = false
  }
}

async function addTable(target) {
  tablePickerTarget.value = target
  tablePickerSelectedTables.value = []
  tablePickerTables.value = []
  tablePickerSourceId.value = profile.dataSourceId || tablePickerSourceId.value
  tablePickerVisible.value = true
  await loadTablePickerSources()
}

async function loadTablePickerSources() {
  tablePickerLoadingSources.value = true
  try {
    await loadDataSources()
    tablePickerSources.value = dataSources.value
    if (!tablePickerSources.value.length) {
      tablePickerSourceId.value = ''
      return
    }
    if (!tablePickerSources.value.some((item) => String(item.id) === String(tablePickerSourceId.value))) {
      tablePickerSourceId.value = String(tablePickerSources.value[0].id)
    }
    await loadTablePickerTables()
  } catch (error) {
    Message.error(error?.message || '加载数据源失败')
  } finally {
    tablePickerLoadingSources.value = false
  }
}

async function loadTablePickerTables() {
  if (!tablePickerSource.value) {
    tablePickerTables.value = []
    return
  }
  tablePickerLoadingTables.value = true
  try {
    const result = await listTables(tablePickerSource.value)
    tablePickerTables.value = Array.isArray(result) ? result.map(tableName).filter(Boolean) : []
    tablePickerSelectedTables.value = []
  } catch (error) {
    Message.error(error?.message || '加载数据表失败')
  } finally {
    tablePickerLoadingTables.value = false
  }
}

function selectedTableExists(name) {
  const current = profile[tablePickerTarget.value] || []
  return current.some((row) => String(row.tableName || '').trim().toLowerCase() === String(name || '').trim().toLowerCase())
}

function addSelectedTables() {
  if (!tablePickerSelectedTables.value.length) {
    Message.warning('请选择要新增的表')
    return
  }
  const target = profile[tablePickerTarget.value]
  let added = 0
  for (const name of tablePickerSelectedTables.value) {
    if (selectedTableExists(name)) {
      continue
    }
    target.push(createTableScope(name))
    added++
  }
  if (!added) {
    Message.warning('选择的表已存在')
    return
  }
  if (tablePickerSource.value) {
    applyDataSourceToProfile(tablePickerSource.value)
  }
  Message.success(`已新增 ${added} 张表`)
  tablePickerVisible.value = false
}

function openFileConfig(row) {
  row.fileTable = true
  if (!row.attachmentMode) {
    row.attachmentMode = row.filePathTemplate ? 'template' : 'column'
  }
  activeFileRow.value = row
  fileConfigVisible.value = true
}

function handleFileTableChange(row, checked) {
  if (checked) {
    openFileConfig(row)
    return
  }
  if (activeFileRow.value === row) {
    fileConfigVisible.value = false
    activeFileRow.value = null
  }
}

function removeTable(target, index) {
  profile[target].splice(index, 1)
}

function addBackupTable() {
  profile.backupTables.push({
    sourceTable: '',
    targetTable: '',
    taskConditionTemplate: "task_id = '${task_id}'",
  })
}

function removeBackupTable(index) {
  profile.backupTables.splice(index, 1)
}

async function loadDataSources() {
  loadingDataSources.value = true
  try {
    const items = await listDataSources()
    dataSources.value = Array.isArray(items) ? items : []
  } catch (error) {
    Message.error(error?.message || '加载数据源失败')
  } finally {
    loadingDataSources.value = false
  }
}

async function loadProfiles(preferredName = activeProfileName.value) {
  loadingList.value = true
  try {
    const items = await listTableProfiles()
    profiles.value = Array.isArray(items) ? items : []
    const names = profiles.value.map((item) => item.name)
    const nextName = names.includes(preferredName) ? preferredName : names[0] || ''
    activeProfileName.value = nextName
    if (nextName) {
      await loadProfile(nextName)
    } else {
      activeProfilePath.value = ''
      applyProfile()
    }
  } finally {
    loadingList.value = false
  }
}

async function loadProfile(name) {
  if (!name) return
  activeProfileName.value = name
  loadingProfile.value = true
  try {
    const data = await fetchTableProfile(name)
    const listItem = profiles.value.find((item) => item.name === name)
    activeProfilePath.value = data._path || listItem?.path || ''
    applyProfile(data)
  } catch (error) {
    Message.error(error?.message || '加载数据库模型失败')
  } finally {
    loadingProfile.value = false
  }
}

async function saveCurrentProfile() {
  if (!activeProfileName.value) {
    Message.warning('请先选择数据库模型文件')
    return
  }
  saving.value = true
  try {
    const res = await saveTableProfile(activeProfileName.value, profileJsonObject.value)
    Message.success(res?.message || '数据库模型已保存')
    await loadProfiles(activeProfileName.value)
  } catch (error) {
    Message.error(error?.message || '保存数据库模型失败')
  } finally {
    saving.value = false
  }
}

async function copyJson() {
  await navigator.clipboard.writeText(profileJson.value)
  Message.success('数据库模型 JSON 已复制')
}

async function copyPreviewJson() {
  await navigator.clipboard.writeText(previewProfileJson.value)
  Message.success('数据库模型 JSON 已复制')
}

function downloadPreviewProfile() {
  const blob = new Blob([previewProfileJson.value], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = previewProfileName.value || 'table-profile.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function previewProfile(item) {
  if (!item?.name) return
  previewVisible.value = true
  previewLoading.value = true
  previewProfileName.value = item.name
  previewProfileJson.value = ''
  try {
    const data = await fetchTableProfile(item.name)
    const cleanData = { ...data }
    delete cleanData._fileName
    delete cleanData._path
    previewProfileJson.value = JSON.stringify(cleanData, null, 2)
  } catch (error) {
    Message.error(error?.message || '加载数据库模型失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function confirmDeleteProfile(item) {
  if (!item?.name) return
  Modal.confirm({
    title: '删除数据库模型',
    content: `确认删除数据库模型配置文件「${item.name}」？`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const res = await deleteTableProfile(item.name)
      if (res?.success === false) {
        Message.error(res?.message || '删除数据库模型失败')
        return
      }
      Message.success(res?.message || '数据库模型已删除')
      const nextPreferred = item.name === activeProfileName.value ? '' : activeProfileName.value
      await loadProfiles(nextPreferred)
    },
  })
}

onMounted(() => {
  loadDataSources()
  loadProfiles()
})
</script>

<template>
  <div class="config-page">
    <PageHero
      title="数据库模型配置"
      description="读取后端真实数据库模型配置，用于识别业务库结构，并驱动自动导出和备份映射。"
      hint="左侧是 config/table-profiles 下的配置文件列表，未来新增项目配置后会自动出现在这里。"
    />

    <div class="config-layout">
      <a-card class="profile-list-card" title="数据库模型列表" :loading="loadingList">
        <template #extra>
          <a-space>
            <a-button size="small" @click="loadProfiles()">刷新</a-button>
            <a-button size="small" type="primary" @click="openCreateProfile">新建</a-button>
          </a-space>
        </template>
        <div class="profile-file-list">
          <a-empty v-if="profiles.length === 0" description="暂无数据库模型配置" />
          <div
            v-for="item in profiles"
            :key="item.name"
            class="profile-file-item"
            :class="{ active: item.name === activeProfileName }"
          >
            <button type="button" class="profile-file-main" @click="loadProfile(item.name)">
              <strong>{{ item.name }}</strong>
            </button>
            <div class="profile-file-actions">
              <a-button size="mini" @click="previewProfile(item)">预览</a-button>
              <a-button size="mini" status="danger" @click="confirmDeleteProfile(item)">删除</a-button>
            </div>
          </div>
        </div>
      </a-card>

      <div class="config-main">
        <a-card class="form-card config-section" title="数据库模型" :loading="loadingProfile">
          <template #extra>
            <a-space>
              <a-button size="small" @click="copyJson">复制 JSON</a-button>
              <a-button size="small" type="primary" :loading="saving" @click="saveCurrentProfile">保存配置</a-button>
            </a-space>
          </template>
          <a-form layout="vertical">
            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="模型名称" tip="用于标识这套数据库模型。" />
                  </template>
                  <a-input v-model="profile.name" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="绑定数据源" tip="用于新增表时读取表清单，也会写入数据库模型 JSON 的 dataSource 元数据。" />
                  </template>
                  <a-select
                    v-model="profile.dataSourceId"
                    :loading="loadingDataSources"
                    allow-clear
                    placeholder="请选择数据源"
                    @change="(value) => applyDataSourceToProfile(findDataSource(value))"
                  >
                    <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                      {{ item.name }} / {{ item.type }}
                    </a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="标识表" tip="可以写多个表。当前数据库里有这些标识表，就用这套数据库模型。" />
                  </template>
                  <a-input v-model="profile.detectTablesText" placeholder="多个表用逗号或换行分隔，例如：zy_task, set_calc_param" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-form-item>
              <template #label>
                <FieldLabel label="配置路径" tip="后端自动生成的数据库模型配置文件路径，仅用于定位文件。" />
              </template>
              <a-input :model-value="activeProfilePath" disabled />
            </a-form-item>
          </a-form>

          <a-tabs class="profile-tabs" default-active-key="auto">
            <a-tab-pane key="auto" title="导出配置">
              <div class="config-table-header">
                <strong>{{ profile.autoTaskTables.length }} 张表</strong>
                <a-button size="small" type="primary" @click="addTable('autoTaskTables')">新增表</a-button>
              </div>
              <a-table
                :columns="tableColumns"
                :data="profile.autoTaskTables"
                :pagination="{ pageSize: 12, showTotal: true }"
                row-key="tableName"
                size="small"
                class="config-edit-table"
              >
                <template #taskConditionTitle>
                  <FieldLabel label="条件" :tip="taskConditionTip" />
                </template>
                <template #tableName="{ record }">
                  <a-input v-model="record.tableName" placeholder="表名" />
                </template>
                <template #keyColumn="{ record }">
                  <a-input v-model="record.keyColumn" placeholder="id" />
                </template>
                <template #taskConditionTemplate="{ record }">
                  <a-input v-model="record.taskConditionTemplate" placeholder="按标识字段过滤行，例如：task_id = '${task_id}'" />
                </template>
                <template #fileTable="{ record }">
                  <div class="attachment-cell">
                    <a-switch v-model="record.fileTable" size="small" @change="(checked) => handleFileTableChange(record, checked)" />
                    <a-button v-if="record.fileTable" size="mini" @click="openFileConfig(record)">配置</a-button>
                    <span v-else class="attachment-muted">无</span>
                  </div>
                </template>
                <template #actions="{ rowIndex }">
                  <a-button size="mini" status="danger" @click="removeTable('autoTaskTables', rowIndex)">删除</a-button>
                </template>
              </a-table>
            </a-tab-pane>

            <a-tab-pane key="backup" title="备份表映射">
              <div class="config-table-header">
                <strong>{{ profile.backupTables.length }} 条映射</strong>
                <a-button size="small" type="primary" @click="addBackupTable">新增映射</a-button>
              </div>
              <a-table
                :columns="backupColumns"
                :data="profile.backupTables"
                :pagination="{ pageSize: 12, showTotal: true }"
                row-key="sourceTable"
                size="small"
                class="config-edit-table"
              >
                <template #taskConditionTitle>
                  <FieldLabel label="条件" :tip="taskConditionTip" />
                </template>
                <template #sourceTable="{ record }">
                  <a-input v-model="record.sourceTable" placeholder="源表" />
                </template>
                <template #targetTable="{ record }">
                  <a-input v-model="record.targetTable" placeholder="备份表" />
                </template>
                <template #taskConditionTemplate="{ record }">
                  <a-input v-model="record.taskConditionTemplate" placeholder="按标识字段过滤行，例如：task_id = '${task_id}'" />
                </template>
                <template #actions="{ rowIndex }">
                  <a-button size="mini" status="danger" @click="removeBackupTable(rowIndex)">删除</a-button>
                </template>
              </a-table>
            </a-tab-pane>
          </a-tabs>
        </a-card>
      </div>

      <a-modal
        v-model:visible="createProfileVisible"
        title="新建数据库模型"
        :footer="false"
        width="520px"
      >
        <a-form :model="createProfileForm" layout="vertical">
          <a-form-item>
            <template #label>
              <FieldLabel label="文件名" tip="保存到后端 config/table-profiles 目录。只允许字母、数字、下划线和中划线。" />
            </template>
            <a-input
              v-model="createProfileForm.fileName"
              placeholder="例如：dm_sample_profile.json"
              @blur="createProfileForm.fileName = normalizeProfileFileName(createProfileForm.fileName)"
            />
          </a-form-item>
          <a-form-item>
            <template #label>
              <FieldLabel label="模型名称" tip="写入 JSON 的 name 字段，用于业务识别。" />
            </template>
            <a-input v-model="createProfileForm.name" placeholder="例如：dm_sample_profile" />
          </a-form-item>
          <a-form-item>
            <template #label>
              <FieldLabel label="绑定数据源" tip="新模型会写入这份数据源元数据，并默认从这个数据源新增表。" />
            </template>
            <a-select
              v-model="createProfileForm.dataSourceId"
              :loading="loadingDataSources"
              allow-clear
              placeholder="请选择数据源"
            >
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} / {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item>
            <template #label>
              <FieldLabel label="标识表" tip="可先留空，后续选择数据源表加入模型后再补。" />
            </template>
            <a-input v-model="createProfileForm.detectTablesText" placeholder="例如：DS_TASK, DS_TASK_DETAIL" />
          </a-form-item>
        </a-form>
        <div class="modal-action-row">
          <a-button @click="createProfileVisible = false">取消</a-button>
          <a-button type="primary" :loading="creatingProfile" @click="createProfile">创建</a-button>
        </div>
      </a-modal>

      <a-modal
        v-model:visible="tablePickerVisible"
        :title="tablePickerTitle"
        :footer="false"
        width="680px"
      >
        <a-form layout="vertical">
          <a-form-item>
            <template #label>
              <FieldLabel label="数据源" tip="从已经配置好的数据源读取表清单，然后选择要加入数据库模型的表。" />
            </template>
            <a-select
              v-model="tablePickerSourceId"
              :loading="tablePickerLoadingSources"
              placeholder="请选择数据源"
              @change="loadTablePickerTables"
            >
              <a-option v-for="item in tablePickerSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} / {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item>
            <template #label>
              <FieldLabel label="数据表" tip="可以多选。已存在于当前表格的表会禁用，确认后按默认配置加入。" />
            </template>
            <a-select
              v-model="tablePickerSelectedTables"
              multiple
              allow-search
              allow-clear
              :loading="tablePickerLoadingTables"
              placeholder="请选择要新增的表"
            >
              <a-option
                v-for="name in tablePickerTables"
                :key="name"
                :value="name"
                :disabled="selectedTableExists(name)"
              >
                {{ name }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>
        <div class="modal-action-row">
          <a-button @click="tablePickerVisible = false">取消</a-button>
          <a-button type="primary" @click="addSelectedTables">加入数据库模型</a-button>
        </div>
      </a-modal>

      <a-modal
        v-model:visible="fileConfigVisible"
        title="附件来源"
        :footer="false"
        width="560px"
      >
        <a-form v-if="activeFileRow" :model="activeFileRow" layout="vertical">
          <a-form-item>
            <template #label>
              <FieldLabel label="附件路径来源" tip="大多数业务表选择“字段直接保存路径”。只有路径需要由多个字段组合时，才选择“多字段拼接路径”。" />
            </template>
            <a-radio-group v-model="activeFileRow.attachmentMode" type="button">
              <a-radio value="column">字段直接保存路径</a-radio>
              <a-radio value="template">多字段拼接路径</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item v-if="activeFileRow.attachmentMode !== 'template'">
            <template #label>
              <FieldLabel label="附件路径字段" tip="这个字段的值就是要导出的附件相对路径。相对路径基于导出页填写的附件根目录。" />
            </template>
            <a-input v-model="activeFileRow.fileColumn" placeholder="例如：relative_path" />
          </a-form-item>
          <a-form-item v-else>
            <template #label>
              <FieldLabel label="相对路径表达式" tip="高级场景使用。用多个字段拼出附件相对路径，例如 ${TASK_ID}/${FILE_NAME}。" />
            </template>
            <a-input v-model="activeFileRow.filePathTemplate" placeholder="例如：${relative_path} 或 ${TASK_ID}/${FILE_NAME}" />
          </a-form-item>
        </a-form>
        <div class="modal-action-row">
          <a-button @click="fileConfigVisible = false">关闭</a-button>
        </div>
      </a-modal>

      <a-modal
        v-model:visible="previewVisible"
        :title="`${previewProfileName} JSON 预览`"
        :footer="false"
        width="880px"
      >
        <a-spin :loading="previewLoading">
          <div class="config-preview-actions">
            <a-button size="small" @click="copyPreviewJson">复制 JSON</a-button>
            <a-button size="small" type="primary" @click="downloadPreviewProfile">下载数据库模型</a-button>
          </div>
          <pre class="profile-json-preview">{{ previewProfileJson }}</pre>
        </a-spin>
      </a-modal>
    </div>
  </div>
</template>
