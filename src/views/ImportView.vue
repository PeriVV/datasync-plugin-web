<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { importData, inspectImportPackage, precheckImport } from '../api/datasync'
import { listDataSources } from '../api/datasource'
import { userFacingMessage } from '../api/http'
import PageHero from '../components/PageHero.vue'
import PathPicker from '../components/PathPicker.vue'
import FieldLabel from '../components/FieldLabel.vue'

const currentStep = ref(1)
const booting = ref(false)
const loading = ref(false)
const analyzing = ref(false)
const checking = ref(false)
const tablesExpanded = ref(false)
const dataSources = ref([])
const packageInfo = ref(null)
const precheckResult = ref(null)
const precheckError = ref('')
const importResult = ref(null)
const importFailures = ref([])
const selectedPackageFile = ref(null)

const form = reactive({
  inputPath: '',
  targetId: '',
  conflictPolicy: 'UPDATE',
  failurePolicy: 'SKIP',
})

const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)
const tableNames = computed(() => packageInfo.value?.tableNames || [])
const visibleTableNames = computed(() => tablesExpanded.value ? tableNames.value : tableNames.value.slice(0, 12))
const recordCount = computed(() => Number(packageInfo.value?.recordCount || 0))
const precheckChecks = computed(() => precheckResult.value?.checks || [])
const blockingChecks = computed(() => precheckChecks.value.filter((item) => item.status === 'FAIL'))
const canContinue = computed(() => Boolean(precheckResult.value?.canImport) && !checking.value)

const statusColor = { PASS: 'green', WARNING: 'orange', FAIL: 'red' }
const statusText = { PASS: '通过', WARNING: '警告', FAIL: '失败' }
const conflictPolicyText = {
  SKIP: '已存在则跳过',
  UPDATE: '已存在则更新，保留已有附件',
  OVERWRITE: '已存在则覆盖，包括附件文件',
  STOP: '遇到冲突停止',
}
const failurePolicyText = {
  STOP: '遇到失败立即停止',
  SKIP: '跳过失败数据并继续',
}
const conflictOptions = [
  { value: 'SKIP', title: '跳过已有数据', description: '目标库中已存在的数据保持不变，本次不再写入。' },
  { value: 'UPDATE', title: '更新已有数据', description: '已存在则更新业务字段，并保留目标库中已有附件。' },
  { value: 'OVERWRITE', title: '完整覆盖', description: '已存在则覆盖数据，同时覆盖对应附件文件。' },
  { value: 'STOP', title: '冲突即停止', description: '发现任意数据冲突后立即停止本次导入。' },
]
const failureOptions = [
  { value: 'STOP', title: '失败即停止', description: '遇到一条失败数据或文件后立即停止，便于排查问题。' },
  { value: 'SKIP', title: '跳过并继续', description: '记录失败项并继续处理其余数据，适合批量导入。' },
]
const importFailureColumns = [
  { title: '失败阶段', dataIndex: 'phase', width: 120 },
  { title: '失败表', dataIndex: 'table', width: 180 },
  { title: '主键', dataIndex: 'key', width: 150 },
  { title: '失败原因', dataIndex: 'reason' },
  { title: '处理建议', dataIndex: 'suggestion' },
]

async function loadOptions() {
  booting.value = true
  try {
    const sources = await listDataSources()
    dataSources.value = Array.isArray(sources) ? sources : []
  } catch (error) {
    Message.error(error?.message || '加载目标数据库失败')
  } finally {
    booting.value = false
  }
}

async function analyzePackage() {
  if (!form.inputPath.trim()) {
    Message.warning('请选择离线导入包')
    return false
  }
  analyzing.value = true
  try {
    const payload = selectedPackageFile.value
      ? { inputPath: form.inputPath, file: selectedPackageFile.value }
      : { inputPath: form.inputPath }
    const { data } = await inspectImportPackage(payload)
    if (data?.packagePath) form.inputPath = data.packagePath
    selectedPackageFile.value = null
    packageInfo.value = data
    precheckResult.value = null
    precheckError.value = ''
    importResult.value = null
    importFailures.value = []
    tablesExpanded.value = false
    Message.success(data?.message || '导入包识别完成')
    return true
  } catch (error) {
    packageInfo.value = null
    Message.error(error?.message || '无法识别导入包')
    return false
  } finally {
    analyzing.value = false
  }
}

function handlePackageChange(event) {
  packageInfo.value = null
  precheckResult.value = null
  precheckError.value = ''
  importResult.value = null
  importFailures.value = []
  selectedPackageFile.value = event?.files?.[0] || null
  if (selectedPackageFile.value || form.inputPath) analyzePackage()
}

function targetPayload() {
  return {
    inputPath: form.inputPath,
    targetId: selectedTarget.value?.id,
    targetType: selectedTarget.value?.type,
    targetName: selectedTarget.value?.name,
  }
}

async function runPrecheck() {
  if (!packageInfo.value) {
    Message.warning('请先选择并识别导入包')
    return false
  }
  if (!selectedTarget.value) {
    Message.warning('请选择目标数据库')
    return false
  }
  checking.value = true
  precheckResult.value = null
  precheckError.value = ''
  importFailures.value = []
  try {
    const { data } = await precheckImport(targetPayload())
    precheckResult.value = data
    importResult.value = null
    const message = data.canImport
      ? data?.message || '导入预检查完成'
      : userFacingMessage(data?.message, '预检查未通过，请根据检查结果处理后重试')
    Message[data.canImport ? 'success' : 'error'](message)
    return data.canImport
  } catch (error) {
    precheckError.value = error?.message || '导入预检查失败，请检查目标数据库连接和附件目录配置'
    Message.error(precheckError.value)
    return false
  } finally {
    checking.value = false
  }
}

async function nextStep() {
  if (currentStep.value === 1) {
    if (!packageInfo.value && !(await analyzePackage())) return
    currentStep.value = 2
    return
  }
  if (currentStep.value === 2 && canContinue.value) currentStep.value = 3
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

async function submit() {
  if (!precheckResult.value?.canImport) {
    Message.error('预检查未通过，不能执行导入')
    return
  }
  loading.value = true
  importFailures.value = []
  try {
    const { data } = await importData({
      ...targetPayload(),
      conflictPolicy: form.conflictPolicy,
      failurePolicy: form.failurePolicy,
    })
    importResult.value = data
    importFailures.value = data?.failureDetails || []
    Message[importFailures.value.length ? 'warning' : 'success'](data?.message || (importFailures.value.length ? '导入完成，但存在失败项' : '导入完成'))
  } catch (error) {
    const serverFailure = error?.response?.data?.failure
    importFailures.value = [serverFailure || parseImportFailure(error?.message)]
    Message.error(importFailures.value[0].reason || '执行导入失败')
  } finally {
    loading.value = false
  }
}

function parseImportFailure(message) {
  const text = String(message || '执行导入失败')
  const table = text.match(/(?:写入表|写入|表)\s+([A-Za-z0-9_.]+)/i)?.[1] || '-'
  const key = text.match(/(?:主键|key)\s*[=:：]?\s*['\"]?([A-Za-z0-9_.-]+)/i)?.[1] || '-'
  const duplicate = /duplicate|主键冲突|已存在/i.test(text)
  const packageFailure = /导入包|压缩包|解压|zip|manifest/i.test(text)
  const attachmentFailure = /附件|文件复制|目录/i.test(text)
  const phase = packageFailure ? '导入包解析' : attachmentFailure ? '附件恢复' : '数据库写入'
  const suggestion = duplicate
    ? '选择“更新已有数据”或更换主键后重新导入。'
    : packageFailure
      ? '检查导入包是否完整、格式是否正确后重新上传。'
      : attachmentFailure
        ? '检查附件目录权限、磁盘空间和文件完整性后重试。'
        : '检查目标表结构、字段类型和约束后重试。'
  return {
    phase,
    table,
    key,
    reason: text,
    suggestion,
  }
}

watch(() => form.targetId, () => {
  precheckResult.value = null
  precheckError.value = ''
  importResult.value = null
  importFailures.value = []
  if (currentStep.value === 2 && selectedTarget.value && packageInfo.value) runPrecheck()
})

onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="离线导入" description="识别离线包内容，完成目标库预检查后，确认导入策略并执行写入。"
      hint="附件由后端服务恢复到服务器配置目录，浏览器只负责选择并上传 zip 导入包。" />

    <a-card class="form-card import-wizard" :loading="booting">
      <a-steps :current="currentStep" class="model-wizard-steps">
        <a-step title="选择并识别导入包" description="确认包内数据和附件范围" />
        <a-step title="目标位置与预检查" description="检查目标库和附件目录" />
        <a-step title="执行导入" description="确认策略和写入规模" />
      </a-steps>

      <section v-if="currentStep === 1" class="model-step-panel import-step-panel">
        <div class="step-title-row">
          <div>
            <h3>选择并识别导入包</h3>
            <p>选择由数据同步工具生成的 zip 包，系统会自动识别表、记录和附件数量。</p>
          </div>
          <a-button v-if="form.inputPath" :loading="analyzing" @click="analyzePackage">重新识别</a-button>
        </div>

        <a-form layout="vertical">
          <a-form-item>
            <template #label><FieldLabel label="离线导入包" tip="导入包必须包含 manifest.json 和对应的数据文件。" /></template>
            <PathPicker v-model="form.inputPath" mode="open-file" accept=".zip" placeholder="从电脑选择 zip 包"
              button-text="选择 zip 包" @change="handlePackageChange" />
          </a-form-item>
        </a-form>

        <div v-if="analyzing" class="import-state-panel">
          <a-spin :loading="true" />
          <div><strong>正在识别导入包</strong><span>正在读取清单、数据表和附件信息……</span></div>
        </div>

        <template v-else-if="packageInfo">
          <div class="package-identity-card">
            <div class="package-icon">ZIP</div>
            <div class="package-identity-content">
              <span>导入包名称</span>
              <a-tooltip :content="packageInfo.packageName || '-'">
                <strong class="single-line-ellipsis">{{ packageInfo.packageName || '-' }}</strong>
              </a-tooltip>
              <a-tooltip :content="packageInfo.packagePath || form.inputPath">
                <small class="single-line-ellipsis">{{ packageInfo.packagePath || form.inputPath }}</small>
              </a-tooltip>
            </div>
          </div>

          <div class="import-stat-grid">
            <article><span>包名</span><a-tooltip :content="packageInfo.packageName || '-'"><strong class="stat-package-name">{{ packageInfo.packageName || '-' }}</strong></a-tooltip></article>
            <article><span>包含表数量</span><strong>{{ packageInfo.tableCount || 0 }}</strong></article>
            <article><span>包含记录数量</span><strong>{{ recordCount }}</strong></article>
            <article><span>包含附件数量</span><strong>{{ packageInfo.attachmentCount || 0 }}</strong></article>
          </div>

          <a-alert v-if="recordCount === 0" type="warning" show-icon class="import-zero-alert">
            导入包未识别到数据记录，请检查导入包内容和 manifest.json 中的数据文件配置。
          </a-alert>

          <div class="package-table-section">
            <div class="section-heading-row">
              <div><strong>包含表</strong><span>共 {{ tableNames.length }} 张</span></div>
              <a-button v-if="tableNames.length > 12" type="text" size="small" @click="tablesExpanded = !tablesExpanded">
                {{ tablesExpanded ? '收起' : `展开全部（${tableNames.length}）` }}
              </a-button>
            </div>
            <div :class="['package-table-tags', { expanded: tablesExpanded }]">
              <a-tooltip v-for="table in visibleTableNames" :key="table" :content="table">
                <a-tag class="table-name-tag">{{ table }}</a-tag>
              </a-tooltip>
              <a-empty v-if="!tableNames.length" description="导入包中未识别到数据表" />
            </div>
          </div>

          <a-descriptions v-if="packageInfo.taskIds?.length" :column="1" bordered class="import-extra-info">
            <a-descriptions-item label="任务标识">{{ packageInfo.taskIds.join('、') }}</a-descriptions-item>
          </a-descriptions>
        </template>
        <a-empty v-else description="选择 zip 包后将在这里展示识别结果" />
      </section>

      <section v-else-if="currentStep === 2" class="model-step-panel import-step-panel">
        <div class="step-title-row">
          <div>
            <h3>目标位置与预检查</h3>
            <p>选择目标数据库后，系统自动检查表结构、主键冲突、重复内容和附件目录。</p>
          </div>
        </div>

        <a-form layout="vertical" class="target-select-form">
          <a-form-item label="目标数据库">
            <a-select v-model="form.targetId" allow-search placeholder="请选择目标数据库">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} / {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>

        <template v-if="selectedTarget">
          <div class="attachment-restore-card">
            <div><strong>附件恢复方式</strong><span>由后端服务直接恢复到服务器附件目录</span></div>
            <a-tooltip :content="precheckResult?.targetFileRoot || '预检查完成后显示具体目录'">
              <code class="single-line-ellipsis">{{ precheckResult?.targetFileRoot || '预检查完成后显示具体目录' }}</code>
            </a-tooltip>
          </div>

          <div class="precheck-section">
            <div class="section-heading-row">
              <div><strong>预检查结果</strong><span>阻断错误必须处理后才能继续</span></div>
              <a-button v-if="!checking" :disabled="!selectedTarget" @click="runPrecheck">
                {{ precheckResult || precheckError ? '重新预检查' : '开始预检查' }}
              </a-button>
            </div>

            <div v-if="checking" class="import-state-panel precheck-loading-panel">
              <a-spin :loading="true" />
              <div><strong>正在执行预检查</strong><span>正在检查目标库表结构、主键冲突和附件目录……</span></div>
            </div>

            <a-alert v-else-if="precheckError" type="error" show-icon class="precheck-error-alert">
              <template #title>预检查执行失败</template>
              {{ precheckError }}
              <template #action><a-button size="small" status="danger" @click="runPrecheck">重新预检查</a-button></template>
            </a-alert>

            <template v-else-if="precheckResult">
              <a-alert v-if="!precheckResult.canImport" type="error" show-icon class="precheck-error-alert">
                <template #title>预检查未通过</template>
                {{ blockingChecks.map((item) => `${item.name}：${item.detail}`).join('；') || precheckResult.message || '存在阻断错误' }}
                <template #action><a-button size="small" status="danger" @click="runPrecheck">重新预检查</a-button></template>
              </a-alert>
              <a-alert v-else type="success" show-icon class="precheck-success-alert">预检查已完成，可以进入下一步确认导入策略。</a-alert>

              <div class="precheck-grid">
                <article v-for="item in precheckChecks" :key="item.name" :class="`status-${String(item.status).toLowerCase()}`">
                  <a-tag :color="statusColor[item.status]">{{ statusText[item.status] || item.status }}</a-tag>
                  <div><strong>{{ item.name }}</strong><span>{{ item.detail }}</span></div>
                </article>
              </div>
            </template>
            <a-empty v-else description="正在等待预检查，请确认目标数据库" />
          </div>
        </template>
        <a-empty v-else description="选择目标数据库后将自动执行预检查" />
      </section>

      <section v-else class="model-step-panel import-step-panel">
        <div class="step-title-row">
          <div>
            <h3>执行导入</h3>
            <p>确认即将写入的目标和数据规模，再选择冲突与失败处理策略。</p>
          </div>
        </div>

        <div class="strategy-section">
          <div class="section-heading-row"><div><strong>冲突处理方式</strong><span>目标库已有相同数据时如何处理</span></div></div>
          <a-radio-group v-model="form.conflictPolicy" class="strategy-card-grid">
            <a-radio v-for="item in conflictOptions" :key="item.value" :value="item.value" class="strategy-radio-card">
              <div><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div>
            </a-radio>
          </a-radio-group>
        </div>

        <div class="strategy-section">
          <div class="section-heading-row"><div><strong>失败处理方式</strong><span>单条数据或附件写入失败时如何处理</span></div></div>
          <a-radio-group v-model="form.failurePolicy" class="strategy-card-grid failure-grid">
            <a-radio v-for="item in failureOptions" :key="item.value" :value="item.value" class="strategy-radio-card">
              <div><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div>
            </a-radio>
          </a-radio-group>
        </div>

        <div class="import-confirm-section">
          <div class="section-heading-row"><div><strong>导入前确认</strong><span>以下内容将写入目标数据库</span></div></div>
          <a-descriptions :column="2" bordered class="import-confirmation">
            <a-descriptions-item label="导入包">
              <a-tooltip :content="packageInfo?.packageName || '-'"><span class="confirmation-ellipsis">{{ packageInfo?.packageName || '-' }}</span></a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="目标数据库">{{ selectedTarget?.name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="数据规模">{{ packageInfo?.tableCount || 0 }} 张表 / {{ recordCount }} 条记录</a-descriptions-item>
            <a-descriptions-item label="附件规模">{{ packageInfo?.attachmentCount || 0 }} 个文件</a-descriptions-item>
            <a-descriptions-item label="冲突处理">{{ conflictPolicyText[form.conflictPolicy] }}</a-descriptions-item>
            <a-descriptions-item label="失败处理">{{ failurePolicyText[form.failurePolicy] }}</a-descriptions-item>
          </a-descriptions>

          <a-alert v-if="recordCount === 0" type="warning" show-icon class="import-zero-alert">
            导入包未识别到数据记录，请检查导入包内容。继续执行可能不会写入任何业务数据。
          </a-alert>
          <div class="import-execute-row">
            <a-button type="primary" status="success" size="large" :loading="loading" @click="submit">
              {{ importResult ? '重新执行导入' : '执行导入' }}
            </a-button>
          </div>
        </div>

        <template v-if="importResult">
          <a-result :status="importResult.failed ? 'warning' : 'success'" title="导入执行完成"
            :subtitle="`目标数据库：${importResult.targetDatabase || selectedTarget?.name}，附件恢复目录：${importResult.targetFileRoot || '服务器配置目录'}`" />
          <div class="import-stat-grid result-stat-grid">
            <article><span>成功</span><strong>{{ importResult.inserted || 0 }}</strong></article>
            <article><span>更新</span><strong>{{ importResult.updated || 0 }}</strong></article>
            <article><span>跳过</span><strong>{{ importResult.skipped || 0 }}</strong></article>
            <article><span>失败</span><strong>{{ importResult.failed || 0 }}</strong></article>
            <article><span>附件写入</span><strong>{{ importResult.filesCopied || 0 }}</strong></article>
            <article><span>附件跳过</span><strong>{{ importResult.filesSkipped || 0 }}</strong></article>
          </div>
        </template>
        <section v-if="importFailures.length" class="execution-result failure-result">
          <div class="execution-result-heading"><div><strong>数据导入失败</strong><span>本次导入未完整完成，请根据失败明细处理后重试。</span></div><a-tag color="red">失败</a-tag></div>
          <a-table :columns="importFailureColumns" :data="importFailures" :pagination="importFailures.length > 5 ? { pageSize: 5 } : false" size="small" />
          <div class="result-actions"><a-button @click="currentStep = 2">返回预检查</a-button><a-button type="primary" @click="submit">重新执行导入</a-button></div>
        </section>
      </section>

      <footer class="model-wizard-footer">
        <a-button :disabled="currentStep === 1 || loading" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 3 步</span>
        <a-button v-if="currentStep === 1" type="primary" :loading="analyzing" :disabled="!packageInfo && !form.inputPath" @click="nextStep">下一步</a-button>
        <a-button v-else-if="currentStep === 2" type="primary" :loading="checking" :disabled="!canContinue" @click="nextStep">
          {{ checking ? '正在预检查' : '确认预检查并继续' }}
        </a-button>
        <span v-else class="footer-placeholder"></span>
      </footer>
    </a-card>
  </div>
</template>

<style scoped>
.import-step-panel {
  min-height: 500px;
}

.step-title-row h3,
.step-title-row p {
  margin: 0;
}

.step-title-row p {
  margin-top: 6px;
  color: #86909c;
}

.package-identity-card,
.attachment-restore-card,
.import-state-panel {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e5e8ef;
  border-radius: 10px;
  background: #fff;
}

.package-icon {
  flex: 0 0 auto;
  padding: 10px 8px;
  border-radius: 8px;
  color: #165dff;
  background: #e8f3ff;
  font-size: 12px;
  font-weight: 700;
}

.package-identity-content,
.import-state-panel > div,
.attachment-restore-card > div {
  min-width: 0;
  flex: 1;
}

.package-identity-content span,
.package-identity-content strong,
.package-identity-content small,
.import-state-panel strong,
.import-state-panel span,
.attachment-restore-card strong,
.attachment-restore-card span {
  display: block;
}

.package-identity-content span,
.package-identity-content small,
.import-state-panel span,
.attachment-restore-card span {
  color: #86909c;
  font-size: 12px;
}

.package-identity-content strong {
  margin: 4px 0;
  color: #1d2129;
  font-size: 15px;
  font-weight: 600;
}

.single-line-ellipsis,
.confirmation-ellipsis {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.import-stat-grid article {
  min-width: 0;
  padding: 16px;
  border: 1px solid #dbeafe;
  border-radius: 9px;
  background: #f5f9ff;
}

.import-stat-grid span,
.import-stat-grid strong {
  display: block;
}

.import-stat-grid span {
  color: #64748b;
  font-size: 12px;
}

.import-stat-grid strong {
  margin-top: 8px;
  color: #1d4ed8;
  font-size: 22px;
  line-height: 1.25;
}

.import-stat-grid .stat-package-name {
  overflow: hidden;
  color: #1d2129;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-table-section,
.precheck-section,
.strategy-section,
.import-confirm-section {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid #e5e8ef;
  border-radius: 10px;
  background: #fff;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-heading-row strong,
.section-heading-row span {
  display: block;
}

.section-heading-row span {
  margin-top: 3px;
  color: #86909c;
  font-size: 12px;
}

.package-table-tags {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.package-table-tags.expanded {
  max-height: 300px;
  padding-right: 5px;
  overflow-y: auto;
}

.table-name-tag {
  display: block;
  width: 100%;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-extra-info,
.import-zero-alert,
.precheck-error-alert,
.precheck-success-alert {
  margin-top: 16px;
}

.target-select-form {
  max-width: 640px;
}

.attachment-restore-card {
  justify-content: space-between;
}

.attachment-restore-card code {
  max-width: 55%;
  padding: 6px 9px;
  border-radius: 6px;
  color: #4e5969;
  background: #f2f3f5;
  font-size: 12px;
}

.import-state-panel {
  justify-content: center;
  min-height: 112px;
  margin-top: 16px;
  background: #f7f8fa;
}

.import-state-panel > div {
  flex: 0 1 auto;
}

.precheck-loading-panel {
  margin-top: 0;
}

.precheck-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.precheck-grid article {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e5e8ef;
  border-left-width: 4px;
  border-radius: 9px;
  background: #fff;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.precheck-grid article.status-pass { border-left-color: #00b42a; }
.precheck-grid article.status-warning { border-left-color: #ff7d00; }
.precheck-grid article.status-fail { border-left-color: #f53f3f; }

.precheck-grid article > div {
  min-width: 0;
}

.precheck-grid strong,
.precheck-grid span {
  display: block;
}

.precheck-grid span {
  margin-top: 5px;
  color: #86909c;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.strategy-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.strategy-card-grid.failure-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.strategy-radio-card {
  width: auto;
  min-height: 78px;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid #e5e8ef;
  border-radius: 9px;
  background: #fbfcff;
  align-items: flex-start;
}

.strategy-radio-card:hover,
.strategy-radio-card.arco-radio-checked {
  border-color: #165dff;
  background: #f2f7ff;
}

.strategy-radio-card strong,
.strategy-radio-card span {
  display: block;
}

.strategy-radio-card span {
  margin-top: 5px;
  color: #86909c;
  font-size: 12px;
  line-height: 1.5;
}

.import-confirmation {
  width: 100%;
}

.confirmation-ellipsis {
  max-width: 360px;
}

.import-execute-row {
  display: flex;
  justify-content: center;
  padding: 24px 0 4px;
}

.result-stat-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.footer-placeholder {
  width: 88px;
}

@media (max-width: 1100px) {
  .import-stat-grid,
  .package-table-tags,
  .result-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .import-stat-grid,
  .package-table-tags,
  .precheck-grid,
  .strategy-card-grid,
  .strategy-card-grid.failure-grid,
  .result-stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .attachment-restore-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .attachment-restore-card code {
    max-width: 100%;
    width: 100%;
  }
}
</style>
