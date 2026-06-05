<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { deleteExportPlan, fetchExportPlan, fetchTableProfile, listExportPlans, listTableProfiles, saveExportPlan } from '../api/config'
import FieldLabel from '../components/FieldLabel.vue'
import PageHero from '../components/PageHero.vue'

const loadingList = ref(false)
const loadingTemplate = ref(false)
const saving = ref(false)
const templates = ref([])
const profiles = ref([])
const activeTemplateFile = ref('')
const activeTemplatePath = ref('')
const previewVisible = ref(false)
const previewTemplateName = ref('')
const previewTemplateJson = ref('')

const template = reactive({
  name: '',
  templateName: '',
  scopeMode: 'TASK',
  profile: '',
  includeFiles: true,
  failurePolicy: 'STOP',
  compressionFormat: 'ZIP',
  generateLog: true,
  manualScopes: [],
  context: {},
})

const isFullDatabase = computed(() => template.scopeMode === 'FULL_DATABASE')

const templateJsonObject = computed(() => ({
  name: template.name || activeTemplateFile.value.replace(/\.json$/i, '') || 'export-template',
  displayName: template.templateName || template.name || '任务离线导出模板',
  profile: isFullDatabase.value ? null : template.profile || null,
  scopeMode: template.scopeMode,
  autoScopeEnabled: !isFullDatabase.value,
  includeFiles: template.includeFiles,
  failurePolicy: template.failurePolicy,
  compressionFormat: template.compressionFormat,
  generateLog: template.generateLog,
  manualScopes: Array.isArray(template.manualScopes) ? template.manualScopes : [],
  context: template.context && typeof template.context === 'object' ? template.context : {},
}))

function applyTemplate(data = {}) {
  template.name = data.name || ''
  template.templateName = data.displayName || data.name || ''
  template.scopeMode = data.scopeMode || 'TASK'
  template.profile = data.profile || ''
  template.includeFiles = data.includeFiles !== false
  template.failurePolicy = data.failurePolicy || 'STOP'
  template.compressionFormat = String(data.compressionFormat || 'ZIP').toUpperCase()
  template.generateLog = data.generateLog !== false
  template.manualScopes = Array.isArray(data.manualScopes) ? data.manualScopes : []
  template.context = data.context && typeof data.context === 'object' ? data.context : {}
}

async function loadOptions() {
  const profileFiles = await listTableProfiles()
  profiles.value = await Promise.all((Array.isArray(profileFiles) ? profileFiles : []).map(async (item) => {
    try {
      const definition = await fetchTableProfile(item.name)
      return { ...item, modelName: definition.name || item.name }
    } catch {
      return { ...item, modelName: item.name }
    }
  }))
}

async function loadTemplates(preferredFile = activeTemplateFile.value) {
  loadingList.value = true
  try {
    await loadOptions()
    const files = await listExportPlans()
    templates.value = await Promise.all((Array.isArray(files) ? files : []).map(async (item) => {
      try {
        const definition = await fetchExportPlan(item.name)
        return { ...item, templateName: definition.displayName || definition.name || item.name }
      } catch {
        return { ...item, templateName: item.name }
      }
    }))
    const fileNames = templates.value.map((item) => item.name)
    const nextFile = fileNames.includes(preferredFile) ? preferredFile : fileNames[0] || ''
    if (nextFile) {
      await loadTemplate(nextFile)
    } else {
      activeTemplateFile.value = ''
      activeTemplatePath.value = ''
      applyTemplate()
    }
  } catch (error) {
    Message.error(error?.message || '加载导出模板失败')
  } finally {
    loadingList.value = false
  }
}

async function loadTemplate(fileName) {
  activeTemplateFile.value = fileName
  loadingTemplate.value = true
  try {
    const data = await fetchExportPlan(fileName)
    activeTemplatePath.value = data._path || templates.value.find((item) => item.name === fileName)?.path || ''
    applyTemplate(data)
  } catch (error) {
    Message.error(error?.message || '加载导出模板失败')
  } finally {
    loadingTemplate.value = false
  }
}

async function saveCurrentTemplate() {
  if (!activeTemplateFile.value) {
    Message.warning('请先选择导出模板')
    return
  }
  if (!template.templateName.trim()) {
    Message.warning('请填写模板名称')
    return
  }
  if (!isFullDatabase.value && !template.profile) {
    Message.warning('按任务ID导出时必须选择适用模型')
    return
  }
  saving.value = true
  try {
    const result = await saveExportPlan(activeTemplateFile.value, templateJsonObject.value)
    Message.success(result?.message || '导出模板已保存')
    await loadTemplates(activeTemplateFile.value)
  } catch (error) {
    Message.error(error?.message || '保存导出模板失败')
  } finally {
    saving.value = false
  }
}

async function previewTemplate(item) {
  const data = await fetchExportPlan(item.name)
  delete data._fileName
  delete data._path
  previewTemplateName.value = item.templateName || data.displayName || data.name || item.name
  previewTemplateJson.value = JSON.stringify(data, null, 2)
  previewVisible.value = true
}

function confirmDeleteTemplate(item) {
  Modal.confirm({
    title: '删除导出模板',
    content: `确认删除「${item.templateName || item.name}」？`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      await deleteExportPlan(item.name)
      await loadTemplates(item.name === activeTemplateFile.value ? '' : activeTemplateFile.value)
      Message.success('导出模板已删除')
    },
  })
}

onMounted(loadTemplates)
</script>

<template>
  <div class="config-page">
    <PageHero
      title="策略模板配置"
      description="数据模型负责定义导哪些表、表之间如何关联；导出模板负责定义采用什么方式导出。"
      hint="按任务ID导出需要选择业务数据模型；全库导出直接导出整个数据库，不需要选择模型。"
    />

    <div class="config-layout">
      <a-card class="profile-list-card" title="导出模板列表" :loading="loadingList">
        <template #extra>
          <a-button size="small" @click="loadTemplates()">刷新</a-button>
        </template>
        <div class="profile-file-list">
          <a-empty v-if="templates.length === 0" description="暂无导出模板" />
          <div v-for="item in templates" :key="item.name" class="profile-file-item"
            :class="{ active: item.name === activeTemplateFile }">
            <button type="button" class="profile-file-main" @click="loadTemplate(item.name)">
              <strong>{{ item.templateName || item.name }}</strong>
            </button>
            <div class="profile-file-actions">
              <a-button size="mini" @click="previewTemplate(item)">JSON</a-button>
              <a-button size="mini" status="danger" @click="confirmDeleteTemplate(item)">删除</a-button>
            </div>
          </div>
        </div>
      </a-card>

      <a-card class="form-card config-section export-template-card" title="模板详情" :loading="loadingTemplate">
        <template #extra>
          <a-button size="small" type="primary" :loading="saving" @click="saveCurrentTemplate">保存模板</a-button>
        </template>

        <a-alert type="info" :show-icon="true" class="template-model-explanation">
          <strong>业务数据模型</strong>决定导出哪些业务表以及表之间的关联关系；
          <strong>导出模板</strong>决定导出范围、附件、压缩、日志和失败处理方式。
        </a-alert>

        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="模板名称" tip="面向用户显示的名称，例如：任务离线导出模板。" />
                </template>
                <a-input v-model="template.templateName" placeholder="任务离线导出模板" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="导出范围" tip="按任务ID导出会使用业务数据模型；全库导出不依赖业务数据模型。" />
                </template>
                <a-select v-model="template.scopeMode">
                  <a-option value="TASK">按任务ID导出</a-option>
                  <a-option value="FULL_DATABASE">全库导出</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <a-form-item>
            <template #label>
              <FieldLabel label="适用模型" tip="模型负责定义需要导出的业务表和表关系。全库导出不需要选择模型。" />
            </template>
            <a-select v-if="!isFullDatabase" v-model="template.profile" placeholder="请选择业务数据模型">
              <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                {{ item.modelName || item.name }}
              </a-option>
            </a-select>
            <a-input v-else model-value="全库导出不需要适用模型" disabled />
          </a-form-item>

          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="是否包含附件">
                <a-radio-group v-model="template.includeFiles" type="button">
                  <a-radio :value="true">是</a-radio>
                  <a-radio :value="false">否</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="失败处理方式">
                <a-radio-group v-model="template.failurePolicy" direction="vertical">
                  <a-radio value="STOP">遇到失败立即停止</a-radio>
                  <a-radio value="SKIP">跳过失败数据，继续导出</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
          </a-row>

          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="压缩格式">
                <a-select v-model="template.compressionFormat">
                  <a-option value="ZIP">zip</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="是否生成日志">
                <a-radio-group v-model="template.generateLog" type="button">
                  <a-radio :value="true">是</a-radio>
                  <a-radio :value="false">否</a-radio>
                </a-radio-group>
              </a-form-item>
            </a-col>
          </a-row>

          <a-form-item>
            <template #label>
              <FieldLabel label="配置路径" tip="系统保存模板的后端路径，仅用于定位。" />
            </template>
            <a-input :model-value="activeTemplatePath" disabled />
          </a-form-item>
        </a-form>
      </a-card>
    </div>

    <a-modal v-model:visible="previewVisible" :title="`${previewTemplateName} JSON 预览`" :footer="false" width="880px">
      <pre class="profile-json-preview">{{ previewTemplateJson }}</pre>
    </a-modal>
  </div>
</template>
