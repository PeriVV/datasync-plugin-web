<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { downloadExportFile, exportData, previewExport } from '../api/datasync'
import { listDataSources, listTables } from '../api/datasource'
import { fetchTableProfile, listTableProfiles } from '../api/config'
import FieldLabel from '../components/FieldLabel.vue'
import PageHero from '../components/PageHero.vue'

const currentStep = ref(1)
const booting = ref(false)
const loading = ref(false)
const previewing = ref(false)
const dataSources = ref([])
const profiles = ref([])
const selectedProfile = ref(null)
const sourceTables = ref([])
const previewResult = ref(null)
const exportResult = ref(null)
const saveHandle = ref(null)
const saveDestination = ref('')

const form = reactive({
  sourceId: '',
  scopeMode: 'TASK',
  profile: '',
  identifierValuesText: '',
  locatorValues: {},
  publicTables: [],
  includeFiles: true,
  attachmentMissingPolicy: 'CONTINUE',
  failurePolicy: 'STOP',
  compressionFormat: 'ZIP',
  generateLog: true,
  fileRoot: 'D:\\tmp\\zy',
  fileName: 'task_export.zip',
})

const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)
const isFullDatabase = computed(() => form.scopeMode === 'FULL_DATABASE')
const mainTableName = computed(() =>
  selectedProfile.value?.mainTable?.tableName || selectedProfile.value?.autoTaskTables?.[0]?.tableName || '',
)
const mainKeyColumn = computed(() =>
  selectedProfile.value?.mainTable?.keyColumn || selectedProfile.value?.autoTaskTables?.[0]?.keyColumn || '',
)
const businessIdentifierName = computed(() => selectedProfile.value?.businessIdentifierName || '业务标识')
const locatorParams = computed(() => {
  const params = selectedProfile.value?.locatorRule?.params
  if (Array.isArray(params) && params.length) return params
  return [{ label: businessIdentifierName.value, name: 'taskId', required: true }]
})
const modelTableNames = computed(() =>
  new Set((selectedProfile.value?.autoTaskTables || []).map((item) => String(item.tableName).toLowerCase())),
)
const availablePublicTables = computed(() =>
  sourceTables.value.filter((table) => !modelTableNames.value.has(String(table).toLowerCase())),
)
const previewColumns = [
  { title: '数据表', dataIndex: 'tableName', width: 240 },
  { title: '查询范围', dataIndex: 'condition' },
  { title: '记录数', dataIndex: 'recordCount', width: 110 },
  { title: '附件记录', dataIndex: 'attachmentCount', width: 110 },
  { title: '找到文件', dataIndex: 'foundAttachmentCount', width: 110 },
  { title: '缺失文件', dataIndex: 'missingAttachmentCount', width: 110 },
]

function normalizeTable(row) {
  return row?.tableName || row?.TABLE_NAME || row?.name || Object.values(row || {})[0] || ''
}

function splitValues(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizedConditions() {
  if (selectedProfile.value?.locatorRule?.params?.length) {
    return locatorParams.value
      .map((param) => ({
        field: param.name,
        values: splitValues(form.locatorValues[param.name]),
      }))
      .filter((item) => item.field && item.values.length)
  }
  const values = splitValues(form.identifierValuesText)
  return values.length ? [{ table: mainTableName.value, field: 'taskId', values }] : []
}

function publicManualScopes() {
  return form.publicTables.map((table) => ({
    table,
    enabled: true,
    mode: 'ALL',
  }))
}

function normalizeZipFileName(value) {
  const name = String(value || '').trim() || `task-export-${Date.now()}.zip`
  return name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`
}

function serverOutputPath(fileName) {
  return `output/export-${Date.now()}-${normalizeZipFileName(fileName)}`
}

function updateDefaultFileName() {
  const firstParam = locatorParams.value[0]?.name
  const value = splitValues(form.locatorValues[firstParam] || form.identifierValuesText)[0]
  if (value) form.fileName = `task_${value}.zip`
}

async function chooseSaveHandle(fileName) {
  if (!window.showSaveFilePicker) {
    saveHandle.value = null
    saveDestination.value = '浏览器默认下载目录'
    Message.info('当前浏览器不支持选择保存位置，将使用浏览器默认下载目录')
    return true
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: normalizeZipFileName(fileName),
      types: [{ description: 'ZIP 离线包', accept: { 'application/zip': ['.zip'] } }],
    })
    const existingFile = await handle.getFile()
    if (existingFile.size > 0 && !(await confirmOverwrite(existingFile.name))) return false
    saveHandle.value = handle
    saveDestination.value = handle.name
    return true
  } catch (error) {
    if (error?.name === 'AbortError') return false
    throw error
  }
}

function confirmOverwrite(fileName) {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '覆盖同名导出包',
      content: `所选位置已存在「${fileName}」，是否覆盖？`,
      okText: '覆盖',
      cancelText: '取消导出',
      okButtonProps: { status: 'danger' },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    })
  })
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
    const [sources, profileFiles] = await Promise.all([
      listDataSources(),
      listTableProfiles(),
    ])
    dataSources.value = Array.isArray(sources) ? sources : []
    profiles.value = await Promise.all((Array.isArray(profileFiles) ? profileFiles : []).map(async (item) => {
      try {
        const definition = await fetchTableProfile(item.name)
        return { ...item, modelName: definition.name || item.name }
      } catch {
        return { ...item, modelName: item.name }
      }
    }))
    form.sourceId = form.sourceId || String(dataSources.value[0]?.id || '')
    form.profile = form.profile || profiles.value[0]?.name || ''
    await loadSourceTables()
    await loadSelectedProfile()
  } finally {
    booting.value = false
  }
}

async function loadSourceTables() {
  sourceTables.value = []
  if (!selectedSource.value) return
  const rows = await listTables(selectedSource.value)
  sourceTables.value = (Array.isArray(rows) ? rows : []).map(normalizeTable).filter(Boolean)
}

async function loadSelectedProfile() {
  previewResult.value = null
  if (isFullDatabase.value) {
    selectedProfile.value = null
    return
  }
  if (!form.profile || !selectedSource.value) {
    selectedProfile.value = null
    return
  }
  selectedProfile.value = await fetchTableProfile(form.profile)
  locatorParams.value.forEach((param) => {
    if (!(param.name in form.locatorValues)) form.locatorValues[param.name] = ''
  })
}

function requestPayload(outputPath = '') {
  const conditions = normalizedConditions()
  return {
    sourceId: selectedSource.value?.id,
    sourceType: selectedSource.value?.type,
    sourceName: selectedSource.value?.name,
    scopeMode: form.scopeMode,
    autoScopeEnabled: !isFullDatabase.value,
    profile: isFullDatabase.value ? '' : form.profile,
    taskIds: conditions[0]?.values || [],
    identifierTable: mainTableName.value,
    identifierField: mainKeyColumn.value,
    conditions,
    manualScopes: publicManualScopes(),
    includeFiles: form.includeFiles,
    attachmentMissingPolicy: form.attachmentMissingPolicy,
    failurePolicy: form.failurePolicy,
    compressionFormat: form.compressionFormat,
    generateLog: form.generateLog,
    fileRoot: form.fileRoot,
    ...(outputPath ? { outputPath } : {}),
  }
}

async function runPreview() {
  if (!validateStepThree()) return false
  previewing.value = true
  try {
    const response = await previewExport(requestPayload())
    previewResult.value = response.data
    if (form.includeFiles && Number(response.data?.missingAttachments || 0) > 0) {
      Message.warning(`发现 ${response.data.missingAttachments} 个附件文件缺失，当前设置为${form.attachmentMissingPolicy === 'STOP' ? '生成时终止' : '继续生成并记录缺失'}`)
    } else {
      Message.success(response.data?.message || '导出内容预览完成')
    }
    return true
  } catch (error) {
    Message.error(error?.message || '预览导出内容失败')
    return false
  } finally {
    previewing.value = false
  }
}

function validateStepOne() {
  if (!selectedSource.value) {
    Message.warning('请选择数据源')
    return false
  }
  return true
}

function validateStepTwo() {
  if (!validateStepOne()) return false
  if (!isFullDatabase.value && (!selectedProfile.value || !locatorParams.value.length)) {
    Message.warning('请选择已配置有效查找条件的数据库模板')
    return false
  }
  return true
}

function validateStepThree() {
  if (!validateStepOne()) return false
  if (!isFullDatabase.value) {
    const missing = locatorParams.value.find((param) => !splitValues(form.locatorValues[param.name]).length)
    if (missing) {
      Message.warning(`请填写${missing.label || missing.name}`)
      return false
    }
  }
  if (form.includeFiles && !form.fileRoot.trim()) {
    Message.warning('包含附件时必须填写附件本地根目录')
    return false
  }
  return true
}

async function nextStep() {
  if (currentStep.value === 1 && !validateStepOne()) return
  if (currentStep.value === 2 && !validateStepTwo()) return
  if (currentStep.value === 3 && !validateStepThree()) return
  if (currentStep.value === 4 && !(await runPreview())) return
  if (currentStep.value === 5) {
    if (!previewResult.value) {
      Message.warning('请先重新预览导出内容')
      return
    }
    if (!saveDestination.value) {
      Message.warning('请先选择导出包的本地保存位置')
      return
    }
  }
  currentStep.value = Math.min(6, currentStep.value + 1)
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

async function submit() {
  if (!validateStepThree()) return
  if (!saveDestination.value && !(await chooseSaveHandle(form.fileName))) return
  loading.value = true
  exportResult.value = null
  try {
    const outputPath = serverOutputPath(form.fileName)
    const { data } = await exportData(requestPayload(outputPath))
    const blob = await downloadExportFile(data?.downloadPath || data?.outputPath || outputPath)
    const savedToSelectedPath = await saveBlob(blob, saveHandle.value, form.fileName)
    const message = savedToSelectedPath ? '导出包已保存到选定位置' : '导出完成，浏览器已开始下载'
    exportResult.value = { status: 'success', title: '导出包生成成功', message }
    Message.success(message)
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || '生成导出包失败'
    exportResult.value = { status: 'error', title: '导出包生成失败', message }
    Message.error(message)
  } finally {
    loading.value = false
  }
}

watch(() => form.sourceId, async () => {
  await loadSourceTables()
  await loadSelectedProfile()
})
watch(() => form.scopeMode, loadSelectedProfile)
watch(() => form.profile, loadSelectedProfile)
watch(() => JSON.stringify(form.locatorValues), updateDefaultFileName)
watch(() => form.fileName, () => {
  exportResult.value = null
  if (saveHandle.value && saveHandle.value.name !== normalizeZipFileName(form.fileName)) {
    saveHandle.value = null
    saveDestination.value = ''
  }
})
watch(
  () => [
    form.sourceId,
    form.scopeMode,
    form.profile,
    JSON.stringify(form.locatorValues),
    JSON.stringify(form.publicTables),
    form.includeFiles,
    form.attachmentMissingPolicy,
    form.failurePolicy,
    form.compressionFormat,
    form.generateLog,
    form.fileRoot,
  ],
  () => {
    previewResult.value = null
    exportResult.value = null
    if (currentStep.value > 2) currentStep.value = 2
  },
)

onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="数据导出" description="选择数据源和数据库模板，填写模板定义的组合条件，再为本次导出设置临时执行选项。"
      hint="数据库模板只负责确定数据范围；附件、日志、压缩和失败处理等策略只在本次导出流程中选择。" />

    <a-card class="form-card export-wizard" :loading="booting">
      <a-steps :current="currentStep" class="model-wizard-steps">
        <a-step title="选择数据源" description="确定导出来源" />
        <a-step title="选择数据库模板" description="确定数据范围规则" />
        <a-step title="填写组合条件" description="填写模板参数" />
        <a-step title="本次导出选项" description="附件、日志和失败处理" />
        <a-step title="预览导出内容" description="确认记录与附件" />
        <a-step title="生成导出包" description="生成并保存文件" />
      </a-steps>

      <section v-if="currentStep === 1" class="model-step-panel">
        <div class="step-title-row"><p>选择本次导出的源数据库。</p></div>
        <a-form layout="vertical">
          <a-form-item label="数据源">
            <a-select v-model="form.sourceId" placeholder="请选择数据源">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} / {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 2" class="model-step-panel">
        <div class="step-title-row"><p>选择数据库模板。模板只定义业务范围和带出表，不包含本次导出的处理策略。</p></div>
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="导出范围类型">
                <a-radio-group v-model="form.scopeMode" direction="vertical">
                  <a-radio value="TASK">按数据库模板导出</a-radio>
                  <a-radio value="FULL_DATABASE">全库导出</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="数据库模板">
                <a-select v-if="!isFullDatabase" v-model="form.profile" placeholder="请选择数据库模板">
                  <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                    {{ item.modelName || item.name }}
                  </a-option>
                </a-select>
                <a-input v-else model-value="全库导出无需数据库模板" disabled />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </section>

      <section v-else-if="currentStep === 3" class="model-step-panel">
        <div class="step-title-row">
          <p>{{ isFullDatabase ? '全库导出无需填写业务条件。' : '填写本次导出需要的业务条件，系统会先定位数据范围再导出相关表和附件。' }}</p>
        </div>
        <a-form v-if="!isFullDatabase" layout="vertical" class="export-condition-list">
          <a-row :gutter="16">
            <a-col v-for="param in locatorParams" :key="param.name" :span="locatorParams.length > 1 ? 8 : 24">
              <a-form-item :label="param.label || param.name">
                <a-input v-model="form.locatorValues[param.name]" :placeholder="`请输入${param.label || param.name}`" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>

        <a-form layout="vertical" class="export-extra-options">
          <a-form-item v-if="!isFullDatabase">
            <template #label>
              <FieldLabel label="本次额外导出的公共表" tip="公共表不与主表关联，将按整表导出。选择只影响本次导出。" />
            </template>
            <a-select v-model="form.publicTables" multiple allow-search allow-clear :max-tag-count="5"
              placeholder="按需选择字典表、配置表等公共表">
              <a-option v-for="table in availablePublicTables" :key="table" :value="table">{{ table }}</a-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="form.includeFiles">
            <template #label>
              <FieldLabel label="附件本地根目录" tip="后端服务读取附件文件的本地根目录。" />
            </template>
            <a-input v-model="form.fileRoot" placeholder="例如 D:\\tmp\\zy" />
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 4" class="model-step-panel">
        <div class="step-title-row"><p>这些选项只对本次导出生效，不会写入数据库模板。</p></div>
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="是否包含附件">
                <a-switch v-model="form.includeFiles" checked-text="包含" unchecked-text="不包含" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="附件缺失时">
                <a-radio-group v-model="form.attachmentMissingPolicy" direction="vertical">
                  <a-radio value="CONTINUE">继续导出并记录缺失</a-radio>
                  <a-radio value="STOP">终止导出</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="是否生成日志">
                <a-switch v-model="form.generateLog" checked-text="生成" unchecked-text="不生成" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="压缩格式">
                <a-select v-model="form.compressionFormat">
                  <a-option value="ZIP">ZIP</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="失败处理方式">
                <a-radio-group v-model="form.failurePolicy" direction="vertical">
                  <a-radio value="STOP">遇到失败立即停止</a-radio>
                  <a-radio value="SKIP">跳过失败表并继续</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="导出文件名">
                <a-input v-model="form.fileName" placeholder="task_export.zip" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item v-if="form.includeFiles" label="附件本地根目录">
            <a-input v-model="form.fileRoot" placeholder="例如 D:\\tmp\\zy" />
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 5" class="model-step-panel">
        <div class="step-title-row">
          <p>预览本次导出涉及的数据表、记录数和附件数。预览只查询数据，不会生成导出包。</p>
          <a-button type="primary" :loading="previewing" @click="runPreview">重新预览</a-button>
        </div>
        <div v-if="previewResult" class="model-test-result">
          <div class="model-test-summary">
            <article><span>涉及表</span><strong>{{ previewResult.tableCount }}</strong></article>
            <article><span>记录总数</span><strong>{{ previewResult.totalRecords }}</strong></article>
            <article><span>附件文件</span><strong>{{ previewResult.totalAttachments }}</strong></article>
            <article><span>实际找到</span><strong>{{ previewResult.foundAttachments || 0 }}</strong></article>
            <article><span>缺失附件</span><strong>{{ previewResult.missingAttachments || 0 }}</strong></article>
          </div>
          <a-alert v-if="form.includeFiles && previewResult.missingAttachments" type="warning" show-icon class="attachment-missing-alert">
            <div>附件根目录或数据模型路径配置不正确，存在 {{ previewResult.missingAttachments }} 个缺失文件。</div>
            <div v-for="file in (previewResult.missingFiles || []).slice(0, 5)" :key="file">{{ file }}</div>
          </a-alert>
          <a-table :columns="previewColumns" :data="previewResult.tables || []" :pagination="{ pageSize: 8 }" size="small" />
          <div class="export-save-location">
            <div>
              <strong>导出包本地保存位置</strong>
              <span>{{ saveDestination || '尚未选择' }}</span>
            </div>
            <a-button type="primary" @click="chooseSaveHandle(form.fileName)">
              {{ saveDestination ? '重新选择' : '选择保存位置' }}
            </a-button>
          </div>
        </div>
        <a-empty v-else description="请先执行导出内容预览。" />
      </section>

      <section v-else class="model-step-panel">
        <div class="step-title-row"><p>确认导出文件名，然后生成并保存 zip 离线包。</p></div>
        <div class="export-package-summary">
          <span>数据库模板：{{ isFullDatabase ? '全库导出' : selectedProfile?.name || form.profile }}</span>
          <span>数据表：{{ previewResult?.tableCount || 0 }} 张</span>
          <span>记录：{{ previewResult?.totalRecords || 0 }} 条</span>
          <span>附件：{{ previewResult?.totalAttachments || 0 }} 个</span>
          <span>保存位置：{{ saveDestination }}</span>
        </div>
        <a-button type="primary" size="large" :loading="loading" @click="submit">生成导出包</a-button>
        <a-result v-if="exportResult" :status="exportResult.status" :title="exportResult.title" :subtitle="exportResult.message" />
      </section>

      <footer class="model-wizard-footer">
        <a-button :disabled="currentStep === 1" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 6 步</span>
        <a-button v-if="currentStep < 6" type="primary" :loading="currentStep === 4 && previewing" @click="nextStep">
          {{ currentStep === 4 ? '预览导出内容' : '下一步' }}
        </a-button>
      </footer>
    </a-card>
  </div>
</template>
