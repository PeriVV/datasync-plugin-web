<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { importData, inspectImportPackage, precheckImport } from '../api/datasync'
import { listDataSources } from '../api/datasource'
import PageHero from '../components/PageHero.vue'
import PathPicker from '../components/PathPicker.vue'
import FieldLabel from '../components/FieldLabel.vue'

const currentStep = ref(1)
const booting = ref(false)
const loading = ref(false)
const analyzing = ref(false)
const checking = ref(false)
const dataSources = ref([])
const packageInfo = ref(null)
const precheckResult = ref(null)
const importResult = ref(null)
const selectedPackageFile = ref(null)

const form = reactive({
  inputPath: '',
  targetId: '',
  targetFileRoot: '',
  conflictPolicy: 'UPDATE',
  failurePolicy: 'SKIP',
})

const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)

const statusColor = {
  PASS: 'green',
  WARNING: 'orange',
  FAIL: 'red',
}

async function loadOptions() {
  booting.value = true
  try {
    const sources = await listDataSources()
    dataSources.value = Array.isArray(sources) ? sources : []
    form.targetId = String(dataSources.value[0]?.id || '')
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
    if (data?.packagePath && data.packagePath !== form.inputPath) {
      form.inputPath = data.packagePath
    }
    selectedPackageFile.value = null
    packageInfo.value = data
    precheckResult.value = null
    importResult.value = null
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
  selectedPackageFile.value = event?.files?.[0] || null
  analyzePackage()
}

function targetPayload() {
  return {
    inputPath: form.inputPath,
    targetId: selectedTarget.value?.id,
    targetType: selectedTarget.value?.type,
    targetName: selectedTarget.value?.name,
    targetFileRoot: form.targetFileRoot,
  }
}

async function runPrecheck() {
  if (!selectedTarget.value) {
    Message.warning('请选择目标数据库')
    return false
  }
  if (!form.targetFileRoot.trim()) {
    Message.warning('请选择附件文件目录')
    return false
  }
  checking.value = true
  try {
    const { data } = await precheckImport(targetPayload())
    precheckResult.value = data
    Message[data.canImport ? 'success' : 'error'](data?.message || '导入预检查完成')
    return true
  } catch (error) {
    Message.error(error?.message || '导入预检查失败')
    return false
  } finally {
    checking.value = false
  }
}

async function nextStep() {
  if (currentStep.value === 1 && !packageInfo.value && !(await analyzePackage())) return
  if (currentStep.value === 3 && !(await runPrecheck())) return
  if (currentStep.value === 4 && !precheckResult.value) {
    Message.warning('请先执行导入预检查')
    return
  }
  currentStep.value = Math.min(6, currentStep.value + 1)
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
  try {
    const { data } = await importData({
      ...targetPayload(),
      conflictPolicy: form.conflictPolicy,
      failurePolicy: form.failurePolicy,
    })
    importResult.value = data
    Message.success(data?.message || '导入完成')
  } catch (error) {
    Message.error(error?.message || '执行导入失败')
  } finally {
    loading.value = false
  }
}

watch(() => form.inputPath, () => {
  packageInfo.value = null
  precheckResult.value = null
  importResult.value = null
})
watch(() => [form.targetId, form.targetFileRoot], () => {
  precheckResult.value = null
  importResult.value = null
  if (currentStep.value > 3) currentStep.value = 3
})

onMounted(loadOptions)
</script>

<template>
  <div class="operation-page">
    <PageHero title="离线导入" description="先识别离线包内容并完成目标环境预检查，再按冲突策略执行导入。"
      hint="导入会执行包内数据脚本，并将附件恢复到目标文件目录。" />

    <a-card class="form-card import-wizard" :loading="booting">
      <a-steps :current="currentStep" class="model-wizard-steps">
        <a-step title="选择导入包" />
        <a-step title="查看包内容" />
        <a-step title="选择目标位置" />
        <a-step title="导入预检查" />
        <a-step title="冲突处理" />
        <a-step title="执行导入" />
      </a-steps>

      <section v-if="currentStep === 1" class="model-step-panel">
        <div class="step-title-row"><p>选择由数据同步工具生成的 zip 离线包，系统会自动识别包信息。</p></div>
        <a-form layout="vertical">
          <a-form-item>
            <template #label><FieldLabel label="离线导入包" tip="包内必须包含 manifest.json 和 sql 数据脚本。" /></template>
            <PathPicker v-model="form.inputPath" mode="open-file" accept=".zip" placeholder="从电脑选择 zip 包"
              button-text="选择 zip 包" @change="handlePackageChange" />
          </a-form-item>
        </a-form>
        <a-button type="primary" :loading="analyzing" @click="analyzePackage">识别导入包</a-button>
      </section>

      <section v-else-if="currentStep === 2" class="model-step-panel">
        <div class="step-title-row"><p>确认导入包中包含的数据和附件。</p></div>
        <div class="model-test-summary">
          <article><span>包名称</span><strong>{{ packageInfo?.packageName }}</strong></article>
          <article><span>包含表数量</span><strong>{{ packageInfo?.tableCount || 0 }}</strong></article>
          <article><span>包含记录数量</span><strong>{{ packageInfo?.recordCount || 0 }}</strong></article>
          <article><span>包含附件数量</span><strong>{{ packageInfo?.attachmentCount || 0 }}</strong></article>
        </div>
        <a-descriptions :column="1" bordered>
          <a-descriptions-item label="包含表">{{ (packageInfo?.tableNames || []).join('、') || '无' }}</a-descriptions-item>
          <a-descriptions-item label="任务标识">{{ (packageInfo?.taskIds || []).join('、') || '无' }}</a-descriptions-item>
        </a-descriptions>
      </section>

      <section v-else-if="currentStep === 3" class="model-step-panel">
        <div class="step-title-row"><p>选择导入目标数据库和附件恢复目录。</p></div>
        <a-form layout="vertical">
          <a-form-item label="目标数据库">
            <a-select v-model="form.targetId" placeholder="只能从数据源连接中选择">
              <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                {{ item.name }} / {{ item.type }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="附件文件目录">
            <PathPicker v-model="form.targetFileRoot" mode="directory" placeholder="选择附件恢复目录" button-text="选择目录" />
          </a-form-item>
        </a-form>
      </section>

      <section v-else-if="currentStep === 4" class="model-step-panel">
        <div class="step-title-row">
          <p>检查目标库结构、主键冲突、附件目录和重复文件指纹。</p>
          <a-button type="primary" :loading="checking" @click="runPrecheck">重新预检查</a-button>
        </div>
        <div v-if="precheckResult" class="precheck-list">
          <article v-for="item in precheckResult.checks || []" :key="item.name">
            <a-tag :color="statusColor[item.status]">{{ item.status }}</a-tag>
            <div><strong>{{ item.name }}</strong><span>{{ item.detail }}</span></div>
          </article>
        </div>
        <a-empty v-else description="请执行导入预检查" />
      </section>

      <section v-else-if="currentStep === 5" class="model-step-panel">
        <div class="step-title-row"><p>选择目标位置已存在数据或文件时的处理方式。</p></div>
        <a-form layout="vertical">
          <a-form-item label="冲突处理方式">
            <a-radio-group v-model="form.conflictPolicy" direction="vertical">
              <a-radio value="SKIP">已存在则跳过</a-radio>
              <a-radio value="UPDATE">已存在则更新，保留已有附件文件</a-radio>
              <a-radio value="OVERWRITE">已存在则覆盖，包括附件文件</a-radio>
              <a-radio value="STOP">遇到冲突停止</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="失败处理方式">
            <a-radio-group v-model="form.failurePolicy" direction="vertical">
              <a-radio value="STOP">遇到失败立即停止</a-radio>
              <a-radio value="SKIP">跳过失败数据，继续导入</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-form>
      </section>

      <section v-else class="model-step-panel">
        <div class="step-title-row"><p>确认导入范围和处理策略后执行导入。</p></div>
        <div v-if="importResult" class="model-test-summary">
          <article><span>成功</span><strong>{{ importResult.inserted || 0 }}</strong></article>
          <article><span>更新</span><strong>{{ importResult.updated || 0 }}</strong></article>
          <article><span>跳过</span><strong>{{ importResult.skipped || 0 }}</strong></article>
          <article><span>失败</span><strong>{{ importResult.failed || 0 }}</strong></article>
          <article><span>附件写入</span><strong>{{ importResult.filesCopied || 0 }}</strong></article>
          <article><span>附件跳过</span><strong>{{ importResult.filesSkipped || 0 }}</strong></article>
        </div>
        <a-button type="primary" status="success" size="large" :loading="loading" @click="submit">
          {{ importResult ? '重新执行导入' : '执行导入' }}
        </a-button>
      </section>

      <footer class="model-wizard-footer">
        <a-button :disabled="currentStep === 1" @click="previousStep">上一步</a-button>
        <span>第 {{ currentStep }} / 6 步</span>
        <a-button v-if="currentStep < 6" type="primary" :loading="analyzing || checking" @click="nextStep">
          {{ currentStep === 3 ? '执行预检查' : '下一步' }}
        </a-button>
      </footer>
    </a-card>
  </div>
</template>
