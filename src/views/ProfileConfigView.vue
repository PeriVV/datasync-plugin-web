<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { fetchTableProfile, listTableProfiles, saveTableProfile } from '../api/config'
import PageHero from '../components/PageHero.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loadingList = ref(false)
const loadingProfile = ref(false)
const saving = ref(false)
const profiles = ref([])
const activeProfileName = ref('')

const profile = reactive({
  name: '',
  detectTablesText: '',
  autoTaskTables: [],
  syncTables: [],
  backupTables: [],
})

const tableColumns = [
  { title: '表名', dataIndex: 'tableName', slotName: 'tableName', width: 170 },
  { title: '键列', dataIndex: 'keyColumn', slotName: 'keyColumn', width: 110 },
  { title: '任务条件模板', dataIndex: 'taskConditionTemplate', slotName: 'taskConditionTemplate' },
  { title: '文件表', dataIndex: 'fileTable', slotName: 'fileTable', width: 90 },
  { title: '文件列', dataIndex: 'fileColumn', slotName: 'fileColumn', width: 120 },
  { title: '文件路径模板', dataIndex: 'filePathTemplate', slotName: 'filePathTemplate', width: 210 },
  { title: '操作', slotName: 'actions', width: 78 },
]

const backupColumns = [
  { title: '源表', dataIndex: 'sourceTable', slotName: 'sourceTable' },
  { title: '备份表', dataIndex: 'targetTable', slotName: 'targetTable' },
  { title: '任务条件模板', dataIndex: 'taskConditionTemplate', slotName: 'taskConditionTemplate' },
  { title: '操作', slotName: 'actions', width: 78 },
]

function splitLines(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanTableScope(row) {
  return {
    tableName: row.tableName || '',
    keyColumn: row.keyColumn || 'id',
    taskConditionTemplate: row.taskConditionTemplate || null,
    fileTable: Boolean(row.fileTable),
    fileColumn: row.fileTable && row.fileColumn ? row.fileColumn : null,
    filePathTemplate: row.fileTable && row.filePathTemplate ? row.filePathTemplate : null,
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

function applyProfile(data = {}) {
  profile.name = data.name || ''
  profile.detectTablesText = Array.isArray(data.detectTables) ? data.detectTables.join(', ') : ''
  profile.autoTaskTables = Array.isArray(data.autoTaskTables)
    ? data.autoTaskTables.map(toEditableTableScope)
    : []
  profile.syncTables = Array.isArray(data.syncTables)
    ? data.syncTables.map(toEditableTableScope)
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
  detectTables: splitLines(profile.detectTablesText),
  autoTaskTables: profile.autoTaskTables.filter(nonEmptyTableScope).map(cleanTableScope),
  syncTables: profile.syncTables.filter(nonEmptyTableScope).map(cleanTableScope),
  backupTables: profile.backupTables.filter(nonEmptyBackup).map(cleanBackup),
}))

const profileJson = computed(() => JSON.stringify(profileJsonObject.value, null, 2))

function addTable(target) {
  profile[target].push({
    tableName: '',
    keyColumn: 'id',
    taskConditionTemplate: "task_id = '${taskId}'",
    fileTable: false,
    fileColumn: '',
    filePathTemplate: '',
    dependencyOrder: 0,
  })
}

function removeTable(target, index) {
  profile[target].splice(index, 1)
}

function copyAutoToSync() {
  profile.syncTables = profile.autoTaskTables.map((row) => ({ ...row }))
  Message.success('已同步到在线同步表')
}

function addBackupTable() {
  profile.backupTables.push({
    sourceTable: '',
    targetTable: '',
    taskConditionTemplate: "task_id = '${taskId}'",
  })
}

function removeBackupTable(index) {
  profile.backupTables.splice(index, 1)
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
    applyProfile(data)
  } catch (error) {
    Message.error(error?.message || '加载表模型失败')
  } finally {
    loadingProfile.value = false
  }
}

async function saveCurrentProfile() {
  if (!activeProfileName.value) {
    Message.warning('请先选择表模型文件')
    return
  }
  saving.value = true
  try {
    const res = await saveTableProfile(activeProfileName.value, profileJsonObject.value)
    Message.success(res?.message || '表模型已保存')
    await loadProfiles(activeProfileName.value)
  } catch (error) {
    Message.error(error?.message || '保存表模型失败')
  } finally {
    saving.value = false
  }
}

async function copyJson() {
  await navigator.clipboard.writeText(profileJson.value)
  Message.success('表模型 JSON 已复制')
}

function downloadProfile() {
  const blob = new Blob([profileJson.value], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${profileJsonObject.value.name || 'table-profile'}.json`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadProfiles()
})
</script>

<template>
  <div class="config-page">
    <PageHero
      title="表模型配置"
      description="读取后端真实表模型配置，用于识别业务库结构，并驱动自动导出、同步比对和备份映射。"
      hint="左侧是 config/table-profiles 下的配置文件列表，未来新增项目配置后会自动出现在这里。"
    />

    <div class="config-layout">
      <a-card class="profile-list-card" title="表模型列表" :loading="loadingList">
        <template #extra>
          <a-button size="small" @click="loadProfiles()">刷新</a-button>
        </template>
        <div class="profile-file-list">
          <a-empty v-if="profiles.length === 0" description="暂无表模型配置" />
          <button
            v-for="item in profiles"
            :key="item.name"
            type="button"
            class="profile-file-item"
            :class="{ active: item.name === activeProfileName }"
            @click="loadProfile(item.name)"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.path }}</span>
          </button>
        </div>
      </a-card>

      <div class="config-main">
        <a-card class="form-card config-section" title="表模型" :loading="loadingProfile">
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
                    <FieldLabel label="模型名称" tip="写入 name。用于标识这套表模型，例如 zy_all_new。" />
                  </template>
                  <a-input v-model="profile.name" />
                </a-form-item>
              </a-col>
              <a-col :span="16">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="识别表" tip="写入 detectTables。tableProfilePath 指向目录时，后端用这些表判断当前数据库匹配哪套模型。" />
                  </template>
                  <a-input v-model="profile.detectTablesText" placeholder="zy_task, set_calc_param" />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>

          <a-tabs class="profile-tabs" default-active-key="auto">
            <a-tab-pane key="auto" title="自动导出表">
              <div class="config-table-header">
                <strong>{{ profile.autoTaskTables.length }} 张表</strong>
                <a-space>
                  <a-button size="small" @click="copyAutoToSync">复制到同步表</a-button>
                  <a-button size="small" type="primary" @click="addTable('autoTaskTables')">新增表</a-button>
                </a-space>
              </div>
              <a-table
                :columns="tableColumns"
                :data="profile.autoTaskTables"
                :pagination="{ pageSize: 12, showTotal: true }"
                row-key="tableName"
                size="small"
                class="config-edit-table"
              >
                <template #tableName="{ record }">
                  <a-input v-model="record.tableName" placeholder="表名" />
                </template>
                <template #keyColumn="{ record }">
                  <a-input v-model="record.keyColumn" placeholder="id" />
                </template>
                <template #taskConditionTemplate="{ record }">
                  <a-input v-model="record.taskConditionTemplate" placeholder="task_id = '${taskId}'" />
                </template>
                <template #fileTable="{ record }">
                  <a-switch v-model="record.fileTable" size="small" />
                </template>
                <template #fileColumn="{ record }">
                  <a-input v-model="record.fileColumn" :disabled="!record.fileTable" placeholder="relative_path" />
                </template>
                <template #filePathTemplate="{ record }">
                  <a-input v-model="record.filePathTemplate" :disabled="!record.fileTable" placeholder="${relative_path}/${id}-${filename}" />
                </template>
                <template #actions="{ rowIndex }">
                  <a-button size="mini" status="danger" @click="removeTable('autoTaskTables', rowIndex)">删除</a-button>
                </template>
              </a-table>
            </a-tab-pane>

            <a-tab-pane key="sync" title="同步比对表">
              <div class="config-table-header">
                <strong>{{ profile.syncTables.length }} 张表</strong>
                <a-button size="small" type="primary" @click="addTable('syncTables')">新增表</a-button>
              </div>
              <a-table
                :columns="tableColumns"
                :data="profile.syncTables"
                :pagination="{ pageSize: 12, showTotal: true }"
                row-key="tableName"
                size="small"
                class="config-edit-table"
              >
                <template #tableName="{ record }">
                  <a-input v-model="record.tableName" placeholder="表名" />
                </template>
                <template #keyColumn="{ record }">
                  <a-input v-model="record.keyColumn" placeholder="id" />
                </template>
                <template #taskConditionTemplate="{ record }">
                  <a-input v-model="record.taskConditionTemplate" placeholder="task_id = '${taskId}'" />
                </template>
                <template #fileTable="{ record }">
                  <a-switch v-model="record.fileTable" size="small" />
                </template>
                <template #fileColumn="{ record }">
                  <a-input v-model="record.fileColumn" :disabled="!record.fileTable" placeholder="relative_path" />
                </template>
                <template #filePathTemplate="{ record }">
                  <a-input v-model="record.filePathTemplate" :disabled="!record.fileTable" placeholder="${relative_path}/${id}-${filename}" />
                </template>
                <template #actions="{ rowIndex }">
                  <a-button size="mini" status="danger" @click="removeTable('syncTables', rowIndex)">删除</a-button>
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
                <template #sourceTable="{ record }">
                  <a-input v-model="record.sourceTable" placeholder="源表" />
                </template>
                <template #targetTable="{ record }">
                  <a-input v-model="record.targetTable" placeholder="备份表" />
                </template>
                <template #taskConditionTemplate="{ record }">
                  <a-input v-model="record.taskConditionTemplate" placeholder="task_id = '${taskId}'" />
                </template>
                <template #actions="{ rowIndex }">
                  <a-button size="mini" status="danger" @click="removeBackupTable(rowIndex)">删除</a-button>
                </template>
              </a-table>
            </a-tab-pane>
          </a-tabs>
        </a-card>
      </div>

      <a-card class="result-panel config-preview" title="表模型 JSON 预览">
        <div class="config-preview-actions">
          <a-button size="small" @click="copyJson">复制 JSON</a-button>
          <a-button size="small" type="primary" @click="downloadProfile">下载表模型</a-button>
        </div>
        <pre>{{ profileJson }}</pre>
      </a-card>
    </div>
  </div>
</template>
