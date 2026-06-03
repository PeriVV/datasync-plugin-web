<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { downloadExportFile, exportData } from '../api/datasync'
import { listColumns, listDataSources } from '../api/datasource'
import { fetchExportPlan, fetchTableProfile, listExportPlans, listTableProfiles } from '../api/config'
import PageHero from '../components/PageHero.vue'
import ResultPanel from '../components/ResultPanel.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loading = ref(false)
const booting = ref(false)
const result = ref(null)
const dataSources = ref([])
const profiles = ref([])
const exportPlans = ref([])
const selectedPlan = ref(null)
const selectedProfile = ref(null)

function createCondition(seed = {}) {
  return {
    table: seed.table || '',
    field: seed.field || '',
    values: seed.values || '',
    columns: [],
    loading: false,
  }
}

const form = reactive({
  sourceId: '',
  exportPlan: 'none',
  profile: 'zy_all_new.json',
  conditions: [createCondition({ values: '1896780229075202049' })],
  includeFiles: true,
  fileRoot: 'D:\\tmp\\zy',
  fileName: 'task_1896780229075202049.zip',
})

const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)

const isFullDatabasePlan = computed(() => selectedPlan.value?.scopeMode === 'FULL_DATABASE')
const identifierTables = computed(() => (Array.isArray(selectedProfile.value?.detectTables) ? selectedProfile.value.detectTables : []))

function splitTaskIds(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeZipFileName(value) {
  const name = String(value || '').trim() || `task-export-${Date.now()}.zip`
  return name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`
}

function serverOutputPath(fileName) {
  return `output/${normalizeZipFileName(fileName)}`
}

async function chooseSaveHandle(fileName) {
  if (!window.showSaveFilePicker) {
    return null
  }
  try {
    return await window.showSaveFilePicker({
      suggestedName: normalizeZipFileName(fileName),
      types: [
        {
          description: 'ZIP 离线包',
          accept: { 'application/zip': ['.zip'] },
        },
      ],
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      return false
    }
    throw error
  }
}

async function saveBlob(blob, saveHandle, fileName) {
  if (saveHandle) {
    const writable = await saveHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = normalizeZipFileName(fileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return false
}

async function loadOptions() {
  booting.value = true
  try {
    const [sources, profileItems, planItems] = await Promise.all([
      listDataSources(),
      listTableProfiles(),
      listExportPlans(),
    ])
    dataSources.value = Array.isArray(sources) ? sources : []
    profiles.value = Array.isArray(profileItems) ? profileItems : []
    exportPlans.value = Array.isArray(planItems) ? planItems : []
    if (!form.sourceId && dataSources.value.length) {
      form.sourceId = String(dataSources.value[0].id)
    }
    if (profiles.value.some((item) => item.name === 'zy_all_new.json')) {
      form.profile = 'zy_all_new.json'
    } else if (profiles.value.length) {
      form.profile = profiles.value[0].name
    }
    await loadSelectedProfile()
  } finally {
    booting.value = false
  }
}

function columnName(item) {
  return item?.columnName || item?.COLUMN_NAME || item?.Field || Object.values(item || {})[0] || ''
}

async function loadSelectedProfile() {
  if (!form.profile) {
    selectedProfile.value = null
    form.conditions.splice(0, form.conditions.length, createCondition())
    return
  }
  try {
    selectedProfile.value = await fetchTableProfile(form.profile)
    ensureConditionRows()
    for (const condition of form.conditions) {
      if (!identifierTables.value.includes(condition.table)) {
        condition.table = identifierTables.value[0] || ''
      }
    }
    await loadAllConditionColumns()
  } catch (error) {
    Message.error(error?.message || '加载数据库模型失败')
  }
}

function ensureConditionRows() {
  if (!form.conditions.length) {
    form.conditions.push(createCondition({ table: identifierTables.value[0] || '' }))
  }
}

async function loadConditionColumns(condition) {
  const previousField = condition.field
  condition.columns = []
  condition.field = ''
  if (!selectedSource.value || !condition.table) {
    return
  }
  condition.loading = true
  try {
    const columns = await listColumns(selectedSource.value, condition.table)
    condition.columns = Array.isArray(columns) ? columns.map(columnName).filter(Boolean) : []
    condition.field = condition.columns.includes(previousField) ? previousField : condition.columns[0] || ''
  } catch (error) {
    Message.error(error?.message || '加载标识字段失败')
  } finally {
    condition.loading = false
  }
}

async function loadAllConditionColumns() {
  await Promise.all(form.conditions.map((condition) => loadConditionColumns(condition)))
}

function addCondition() {
  const condition = createCondition({ table: identifierTables.value[0] || '' })
  form.conditions.push(condition)
  loadConditionColumns(condition)
}

function removeCondition(index) {
  if (form.conditions.length <= 1) {
    form.conditions.splice(0, 1, createCondition({ table: identifierTables.value[0] || '' }))
    return
  }
  form.conditions.splice(index, 1)
}

function normalizedConditions() {
  return form.conditions
    .map((condition) => ({
      table: condition.table,
      field: condition.field,
      values: splitTaskIds(condition.values),
    }))
    .filter((condition) => condition.table && condition.field && condition.values.length)
}

watch(
  () => form.exportPlan,
  async (name) => {
    selectedPlan.value = null
    if (!name || name === 'none') {
      return
    }
    try {
      const plan = await fetchExportPlan(name)
      selectedPlan.value = plan
      form.profile = plan.profile || form.profile
      await loadSelectedProfile()
    } catch (error) {
      Message.error(error?.message || '加载导出策略失败')
    }
  },
)

watch(
  () => form.profile,
  () => {
    loadSelectedProfile()
  },
)

watch(
  () => form.sourceId,
  () => {
    loadAllConditionColumns()
  },
)

async function submit() {
  if (!selectedSource.value) {
    Message.warning('请先选择数据源')
    return
  }
  const exportConditions = normalizedConditions()
  if (!isFullDatabasePlan.value && !exportConditions.length) {
    Message.warning('请至少填写一组导出条件')
    return
  }
  if (form.includeFiles && !form.fileRoot.trim()) {
    Message.warning('导出本地附件时必须填写文件根目录')
    return
  }
  const saveHandle = await chooseSaveHandle(form.fileName)
  if (saveHandle === false) {
    return
  }
  loading.value = true
  try {
    const outputPath = serverOutputPath(form.fileName)
    const firstCondition = exportConditions[0] || {}
    const payload = {
      sourceId: selectedSource.value.id,
      sourceType: selectedSource.value.type,
      sourceName: selectedSource.value.name,
      exportPlan: form.exportPlan === 'none' ? '' : form.exportPlan,
      profile: form.profile,
      taskIds: firstCondition.values || [],
      identifierTable: firstCondition.table || '',
      identifierField: firstCondition.field || '',
      conditions: exportConditions,
      includeFiles: form.includeFiles,
      fileRoot: form.fileRoot,
      outputPath,
      autoScopeEnabled: !isFullDatabasePlan.value,
    }
    const { data } = await exportData(payload)
    const blob = await downloadExportFile(data?.downloadPath || data?.outputPath || outputPath)
    const savedToSelectedPath = await saveBlob(blob, saveHandle, form.fileName)
    result.value = data
    Message.success(savedToSelectedPath ? '导出包已保存到选定位置' : '导出完成，浏览器已开始下载')
  } finally {
    loading.value = false
  }
}

onMounted(loadOptions)
</script>

<template>
  <div class="page-grid">
    <div>
      <PageHero
        title="离线导出包"
        description="根据任务范围生成离线包，包含数据脚本、附件文件、导出清单和执行日志。"
        hint="先在数据源连接中连接数据库，再选择数据库模型并填写任务标识执行导出。"
      />

      <a-card class="form-card" title="导出参数" :loading="booting">
        <a-form layout="vertical">
          <p class="form-intent">从选中的数据源按任务范围生成 zip 离线包。</p>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="数据源" tip="选择已经在数据源连接中连接成功的数据源。导出会从这个数据库读取任务数据。" />
                </template>
                <a-select v-model="form.sourceId" placeholder="请选择数据源">
                  <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                    {{ item.name }} · {{ item.type }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="导出策略" tip="可选。选择后会读取策略里的数据库模型和导出模式；组合条件仍在当前导出页面填写。" />
                </template>
                <a-select v-model="form.exportPlan">
                  <a-option value="none">不使用导出策略</a-option>
                  <a-option v-for="item in exportPlans" :key="item.name" :value="item.name">
                    {{ item.name }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="数据库模型" tip="长期有效的项目级数据库模型。它定义哪些表导出、每张表的条件模板、文件表和附件路径模板。" />
                </template>
                <a-select v-model="form.profile" placeholder="请选择数据库模型">
                  <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                    {{ item.name }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <div class="section-title-row">
            <FieldLabel
              label="导出条件"
              tip="可以添加多组条件。字段名必须和数据库模型条件里的占位符一致，例如选择 task_id，模板里就写 ${task_id}。"
            />
            <a-button size="small" :disabled="isFullDatabasePlan" @click="addCondition">新增条件</a-button>
          </div>
          <a-row v-for="(condition, index) in form.conditions" :key="index" :gutter="16">
            <a-col :span="7">
              <a-form-item>
                <template #label>
                  <FieldLabel label="标识表" tip="来自数据库模型里的标识表。先选标识表，再选这个表里的标识字段。" />
                </template>
                <a-select
                  v-model="condition.table"
                  :disabled="isFullDatabasePlan"
                  placeholder="请选择标识表"
                  @change="loadConditionColumns(condition)"
                >
                  <a-option v-for="table in identifierTables" :key="table" :value="table">{{ table }}</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="7">
              <a-form-item>
                <template #label>
                  <FieldLabel label="标识字段" tip="从标识表真实字段里选择。条件里的占位符必须和这个字段名一致。" />
                </template>
                <a-select
                  v-model="condition.field"
                  :disabled="isFullDatabasePlan || !condition.table"
                  :loading="condition.loading"
                  placeholder="请选择标识字段"
                >
                  <a-option v-for="column in condition.columns" :key="column" :value="column">{{ column }}</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="7">
              <a-form-item>
                <template #label>
                  <FieldLabel label="字段值" tip="本次导出使用的字段值，支持换行、逗号或空格分隔多个值。" />
                </template>
                <a-input v-model="condition.values" :disabled="isFullDatabasePlan" placeholder="例如：1896780229075202049" />
              </a-form-item>
            </a-col>
            <a-col :span="3">
              <a-form-item label="操作">
                <a-button :disabled="isFullDatabasePlan" status="danger" @click="removeCondition(index)">删除</a-button>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="本地附件根目录" tip="后端服务能访问的附件根目录，例如 zy.file.path=D:\\tmp\\zy。浏览器选择目录不能可靠传真实路径，所以这里直接填写服务端路径。" />
                </template>
                <a-input v-model="form.fileRoot" :disabled="!form.includeFiles" placeholder="D:\\tmp\\zy" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="导出包文件名" tip="点击生成导出包时会弹出本机保存位置选择框。这里填写默认文件名。" />
                </template>
                <a-input v-model="form.fileName" placeholder="task_1896780229075202049.zip" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-space>
            <a-switch v-model="form.includeFiles" type="round" />
            <span>导出本地附件</span>
          </a-space>
          <div class="action-row">
            <a-button type="primary" :loading="loading" @click="submit">生成导出包</a-button>
          </div>
        </a-form>
      </a-card>
    </div>

    <ResultPanel title="导出结果" :data="result" empty-text="生成离线包后，这里会显示导出清单摘要与输出路径。" />
  </div>
</template>
