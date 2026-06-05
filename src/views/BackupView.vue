<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { backupData, previewBackup } from '../api/datasync'
import { fetchTableProfile, listTableProfiles } from '../api/config'
import { listDataSources } from '../api/datasource'
import PageHero from '../components/PageHero.vue'

const currentStep = ref(1)
const booting = ref(false)
const previewing = ref(false)
const loading = ref(false)
const dataSources = ref([])
const profiles = ref([])
const previewResult = ref(null)
const backupResult = ref(null)

const form = reactive({
  sourceId: '',
  profile: '',
  taskId: 'T-100',
  locatorValues: {},
  includeRecords: true,
  includeAttachments: false,
  includeLogs: true,
  backupMode: 'NEW_SNAPSHOT',
  backupBatchRule: 'AUTO_DAILY_SEQUENCE',
})

const previewColumns = [
  { title: '源业务表', dataIndex: 'sourceTable', width: 210 },
  { title: '备份目标表', dataIndex: 'targetTable', width: 230 },
  { title: '内容类型', slotName: 'contentType', width: 120 },
  { title: '记录数量', dataIndex: 'recordCount', width: 110 },
  { title: '本次备份', slotName: 'included', width: 100 },
]

const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)
const selectedProfile = computed(() => profiles.value.find((item) => item.name === form.profile) || null)
const businessIdentifierName = computed(() => selectedProfile.value?.definition?.businessIdentifierName || '任务ID')
const locatorParams = computed(() => {
  const params = selectedProfile.value?.definition?.locatorRule?.params
  if (Array.isArray(params) && params.length) return params
  return [{ label: businessIdentifierName.value, name: 'taskId' }]
})
const backupModeText = computed(() => ({
  NEW_SNAPSHOT: '新建快照',
  OVERWRITE_LAST: '覆盖上一次快照',
  TIME_VERSIONED: '按时间生成版本',
}[form.backupMode]))
const targetTables = computed(() => backupResult.value?.writtenTables || previewResult.value?.targetTables || [])
const shownBackupTag = computed(() => backupResult.value?.backupTag || previewResult.value?.backupTagPreview || '执行时生成')
const conditionText = computed(() => normalizedConditions()
  .map((item) => `${item.field}=${item.values.join(',')}`)
  .join('；') || form.taskId)

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

function splitValues(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizedConditions() {
  return locatorParams.value
    .map((param) => ({
      field: param.name,
      values: splitValues(form.locatorValues[param.name]),
    }))
    .filter((item) => item.field && item.values.length)
}

function buildPayload() {
  const conditions = normalizedConditions()
  return {
    taskId: splitValues(form.taskId)[0] || conditions[0]?.values?.[0] || '',
    taskIds: conditions[0]?.values || splitValues(form.taskId),
    profile: form.profile,
    sourceId: selectedSource.value?.id,
    sourceType: selectedSource.value?.type,
    sourceName: selectedSource.value?.name,
    conditions,
    includeRecords: form.includeRecords,
    includeAttachments: form.includeAttachments,
    includeLogs: form.includeLogs,
    backupMode: form.backupMode,
    backupBatchRule: form.backupBatchRule,
  }
}

function validateSource() {
  if (!selectedSource.value) {
    Message.warning('请选择源环境')
    return false
  }
  return true
}

function validateProfile() {
  if (!validateSource()) return false
  if (!selectedProfile.value) {
    Message.warning('请选择业务模型')
    return false
  }
  return true
}

function validateConditions() {
  if (!validateProfile()) return false
  const missing = locatorParams.value.find((param) => !splitValues(form.locatorValues[param.name]).length)
  if (missing) {
    Message.warning(`请填写${missing.label || missing.name}`)
    return false
  }
  return true
}

async function loadOptions() {
  booting.value = true
  try {
    const [sources, profileItems] = await Promise.all([listDataSources(), listTableProfiles()])
    dataSources.value = Array.isArray(sources) ? sources : []
    const files = Array.isArray(profileItems) ? profileItems : []
    profiles.value = await Promise.all(files.map(async (item) => {
      try {
        const definition = await fetchTableProfile(item.name)
        return { ...item, definition, modelName: definition.name || item.name }
      } catch {
        return { ...item, definition: null, modelName: item.name }
      }
    }))
    form.sourceId = String(dataSources.value[0]?.id || '')
    form.profile = profiles.value[0]?.name || ''
    locatorParams.value.forEach((param) => {
      if (!(param.name in form.locatorValues)) form.locatorValues[param.name] = form.taskId
    })
  } catch (error) {
    Message.error(errorMessage(error, '加载备份配置失败'))
  } finally {
    booting.value = false
  }
}

async function runPreview() {
  if (!validateConditions()) return false
  previewing.value = true
  backupResult.value = null
  try {
    const { data } = await previewBackup(buildPayload())
    previewResult.value = data
    if (!data?.tableCount) {
      Message.warning('当前业务模型没有符合所选内容的备份表映射')
      return false
    }
    if (form.includeAttachments && !data.attachmentAvailable) {
      Message.warning('当前业务模型没有配置可备份的附件表')
    } else if (form.includeLogs && !data.logAvailable) {
      Message.warning('当前业务模型没有配置可备份的操作日志表')
    } else {
      Message.success(data?.message || '备份范围预览完成')
    }
    return true
  } catch (error) {
    previewResult.value = null
    Message.error(errorMessage(error, '备份范围预览失败'))
    return false
  } finally {
    previewing.value = false
  }
}

function executeBackup() {
  if (!previewResult.value?.tableCount) {
    Message.warning('请先完成备份范围预览')
    return
  }
  Modal.confirm({
    title: '确认执行业务数据备份',
    content: `将按“${backupModeText.value}”方式，把 ${conditionText.value} 的数据写入 ${previewResult.value.tableCount} 张备份表。`,
    okText: '执行备份',
    cancelText: '取消',
    async onOk() {
      loading.value = true
      backupResult.value = null
      try {
        const { data } = await backupData(buildPayload())
        backupResult.value = data
        Message.success(data?.message || '业务数据备份完成')
      } catch (error) {
        Message.error(errorMessage(error, '业务数据备份失败'))
        throw error
      } finally {
        loading.value = false
      }
    },
  })
}

async function nextStep() {
  if (currentStep.value === 1 && !validateSource()) return
  if (currentStep.value === 2 && !validateProfile()) return
  if (currentStep.value === 3 && !validateConditions()) return
  if (currentStep.value === 4 && !(await runPreview())) return
  if (currentStep.value === 5 && !previewResult.value?.tableCount) {
    Message.warning('请先预览备份范围')
    return
  }
  currentStep.value = Math.min(6, currentStep.value + 1)
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

function resetPreview() {
  previewResult.value = null
  backupResult.value = null
  if (currentStep.value > 4) currentStep.value = 4
}

function ensureLocatorValues() {
  locatorParams.value.forEach((param) => {
    if (!(param.name in form.locatorValues)) form.locatorValues[param.name] = form.taskId
  })
}

watch(
  () => [form.sourceId, form.profile, form.taskId, JSON.stringify(form.locatorValues), form.includeRecords, form.includeAttachments, form.includeLogs, form.backupMode, form.backupBatchRule],
  resetPreview,
)
watch(() => form.profile, ensureLocatorValues)
onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="业务数据备份" description="按某个业务标识，把相关业务数据写入备份表并生成可追踪快照，方便后续恢复或审计。"
      hint="数据库模板只决定备份范围和表映射；快照方式、附件、日志和批次号规则只作为本次备份选项。" />

    <a-card class="form-card backup-wizard" :loading="booting">
      <a-steps :current="currentStep" class="model-wizard-steps">
        <a-step title="选择数据源" description="确定备份来源" />
        <a-step title="选择数据库模板" description="确定范围规则" />
        <a-step title="填写组合条件" description="填写模板参数" />
        <a-step title="本次备份选项" description="快照、附件和日志" />
        <a-step title="预览备份范围" description="确认数量和目标表" />
        <a-step title="执行备份" description="生成业务数据快照" />
      </a-steps>

      <section v-if="currentStep === 1" class="model-step-panel">
        <div class="backup-step-intro">
          <h2>选择数据源</h2>
          <p>选择本次备份读取数据的源数据库。</p>
        </div>
        <a-form layout="vertical">
          <a-form-item label="源环境">
            <a-select v-model="form.sourceId" placeholder="请选择源环境">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} - {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 2" class="model-step-panel">
        <div class="backup-step-intro">
          <h2>选择数据库模板</h2>
          <p>模板决定要查询哪些业务表，以及数据最终写入哪些备份表。</p>
        </div>
        <a-form layout="vertical">
          <a-form-item label="数据库模板">
            <a-select v-model="form.profile" placeholder="请选择数据库模板">
              <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                {{ item.modelName }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 3" class="model-step-panel">
        <div class="backup-step-intro">
          <h2>填写组合条件</h2>
          <p>按数据库模板定义的条件填写本次备份范围。</p>
        </div>
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col v-for="param in locatorParams" :key="param.name" :span="locatorParams.length > 1 ? 8 : 24">
              <a-form-item :label="param.label || param.name">
                <a-input v-model="form.locatorValues[param.name]" :placeholder="`请输入${param.label || param.name}`" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </section>

      <section v-else-if="currentStep === 4" class="model-step-panel">
        <div class="backup-step-intro">
          <h2>本次备份选项</h2>
          <p>这些处理方式只对本次备份生效，不保存到数据库模板。</p>
        </div>
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="数据库记录">
                <a-switch v-model="form.includeRecords" disabled checked-text="备份" unchecked-text="不备份" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="是否备份附件">
                <a-switch v-model="form.includeAttachments" checked-text="备份" unchecked-text="不备份" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="是否备份日志">
                <a-switch v-model="form.includeLogs" checked-text="备份" unchecked-text="不备份" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="快照方式">
                <a-radio-group v-model="form.backupMode" direction="vertical">
                  <a-radio value="NEW_SNAPSHOT">新建快照</a-radio>
                  <a-radio value="OVERWRITE_LAST">覆盖上次快照</a-radio>
                  <a-radio value="TIME_VERSIONED">按时间生成版本</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="备份批次号规则">
                <a-select v-model="form.backupBatchRule">
                  <a-option value="AUTO_DAILY_SEQUENCE">按日期自动顺延</a-option>
                  <a-option value="TIME_VERSION">按时间戳生成版本</a-option>
                  <a-option value="MANUAL">执行时手工指定</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </section>

      <section v-else-if="currentStep === 5" class="model-step-panel">
        <div class="backup-step-action">
          <div class="backup-step-intro">
            <h2>预览备份范围</h2>
            <p>以下内容来自源数据库和业务模型的真实备份表映射。</p>
          </div>
          <a-button type="primary" :loading="previewing" @click="runPreview">重新预览</a-button>
        </div>
        <div class="backup-summary">
          <article><span>备份表数量</span><strong>{{ previewResult?.tableCount || 0 }}</strong></article>
          <article><span>记录数量</span><strong>{{ previewResult?.recordCount || 0 }}</strong></article>
          <article><span>附件数量</span><strong>{{ previewResult?.attachmentCount || 0 }}</strong></article>
          <article><span>日志记录</span><strong>{{ previewResult?.logCount || 0 }}</strong></article>
        </div>
        <a-alert v-if="form.includeAttachments && previewResult && !previewResult.attachmentAvailable" type="warning">
          当前业务模型没有配置附件表到备份表的映射，本次不会备份附件文件。
        </a-alert>
        <a-alert v-if="form.includeLogs && previewResult && !previewResult.logAvailable" type="warning">
          当前业务模型没有配置日志表或审计表到备份表的映射，本次不会备份操作日志。
        </a-alert>
        <a-table :columns="previewColumns" :data="previewResult?.tables || []" :pagination="{ pageSize: 8 }" row-key="targetTable">
          <template #contentType="{ record }">
            <a-tag :color="record.contentType === 'ATTACHMENT' ? 'arcoblue' : record.contentType === 'LOG' ? 'purple' : 'green'">
              {{ record.contentType === 'ATTACHMENT' ? '附件' : record.contentType === 'LOG' ? '日志' : '数据库记录' }}
            </a-tag>
          </template>
          <template #included="{ record }">
            <a-tag :color="record.included ? 'green' : 'gray'">{{ record.included ? '是' : '否' }}</a-tag>
          </template>
        </a-table>
      </section>

      <section v-else class="model-step-panel">
        <div class="backup-step-intro">
          <h2>执行备份</h2>
          <p>确认备份目标和备份号后执行，完成后可使用备份号定位本次快照。</p>
        </div>
        <div class="backup-target-panel">
          <div>
            <span>备份号</span>
            <strong>{{ shownBackupTag }}</strong>
          </div>
          <div>
            <span>备份方式</span>
            <strong>{{ backupModeText }}</strong>
          </div>
          <div class="backup-target-tables">
            <span>备份目标</span>
            <a-tag v-for="table in targetTables" :key="table" color="arcoblue">{{ table }}</a-tag>
          </div>
        </div>
        <div class="backup-execute-row">
          <a-button type="primary" size="large" :loading="loading" @click="executeBackup">执行备份</a-button>
        </div>
        <a-result v-if="backupResult" status="success" title="业务数据备份完成"
          :subtitle="`备份号 ${backupResult.backupTag}，写入 ${backupResult.rowsCopied || 0} 条记录，复制 ${backupResult.filesCopied || 0} 个附件文件`">
          <template #extra>
            <div v-if="backupResult.backupDirectory" class="backup-directory">
              附件快照目录：{{ backupResult.backupDirectory }}
            </div>
          </template>
        </a-result>
      </section>

      <footer class="model-wizard-footer">
        <a-button :disabled="currentStep === 1" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 6 步</span>
        <a-button v-if="currentStep < 6" type="primary" :loading="currentStep === 4 && previewing" @click="nextStep">
          {{ currentStep === 4 ? '预览备份范围' : '下一步' }}
        </a-button>
      </footer>
    </a-card>
  </div>
</template>

<style scoped>
.backup-step-intro h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.backup-step-intro p {
  margin: 0;
  color: #7b899d;
}

.backup-content-list,
.backup-mode-list {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.backup-content-list article,
.backup-mode-list :deep(.arco-radio) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border: 1px solid #e6ebf2;
  border-radius: 10px;
}

.backup-content-list article div,
.backup-mode-list :deep(.arco-radio-label) {
  display: grid;
  gap: 6px;
}

.backup-content-list span,
.backup-mode-list span {
  color: #7b899d;
}

.backup-step-action {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.backup-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.backup-summary article {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid #edf1f7;
  border-radius: 10px;
  background: #fafcff;
}

.backup-summary span,
.backup-target-panel span {
  color: #7b899d;
}

.backup-summary strong {
  color: #2d6fff;
  font-size: 24px;
}

.backup-target-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 22px;
  padding: 20px;
  border: 1px solid #dbe7ff;
  border-radius: 12px;
  background: #f8fbff;
}

.backup-target-panel > div {
  display: grid;
  gap: 8px;
}

.backup-target-tables {
  grid-column: 1 / -1;
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
}

.backup-execute-row {
  display: flex;
  justify-content: center;
  padding: 28px 0 8px;
}

.backup-directory {
  color: #5f6f86;
}
</style>
