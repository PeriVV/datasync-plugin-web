<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { fetchExportPlan, listExportPlans, listTableProfiles, saveExportPlan } from '../api/config'
import PageHero from '../components/PageHero.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loadingList = ref(false)
const loadingPlan = ref(false)
const saving = ref(false)
const plans = ref([])
const profiles = ref([])
const activePlanName = ref('')

const plan = reactive({
  name: '',
  displayName: '',
  profile: 'zy_all_new.json',
  scopeMode: 'TASK',
  autoScopeEnabled: true,
  taskIdsText: '',
  manualScopesText: '[]',
  contextText: '{}',
})

const planJsonObject = computed(() => ({
  name: plan.name || 'export-plan',
  displayName: plan.displayName || plan.name || '',
  profile: plan.profile || 'zy_all_new.json',
  scopeMode: plan.scopeMode,
  autoScopeEnabled: Boolean(plan.autoScopeEnabled),
  taskIds: splitTaskIds(plan.taskIdsText),
  manualScopes: parseJson(plan.manualScopesText, []),
  context: parseJson(plan.contextText, {}),
}))

const planJson = computed(() => JSON.stringify(planJsonObject.value, null, 2))

function splitTaskIds(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseJson(value, fallback) {
  try {
    const trimmed = String(value || '').trim()
    return trimmed ? JSON.parse(trimmed) : fallback
  } catch (error) {
    return fallback
  }
}

function applyPlan(data = {}) {
  plan.name = data.name || ''
  plan.displayName = data.displayName || ''
  plan.profile = data.profile || 'zy_all_new.json'
  plan.scopeMode = data.scopeMode || 'TASK'
  plan.autoScopeEnabled = data.autoScopeEnabled !== false
  plan.taskIdsText = Array.isArray(data.taskIds) ? data.taskIds.join('\n') : ''
  plan.manualScopesText = JSON.stringify(data.manualScopes || [], null, 2)
  plan.contextText = JSON.stringify(data.context || {}, null, 2)
}

async function loadOptions() {
  profiles.value = await listTableProfiles()
}

async function loadPlans(preferredName = activePlanName.value) {
  loadingList.value = true
  try {
    await loadOptions()
    const items = await listExportPlans()
    plans.value = Array.isArray(items) ? items : []
    const names = plans.value.map((item) => item.name)
    const nextName = names.includes(preferredName) ? preferredName : names[0] || ''
    activePlanName.value = nextName
    if (nextName) {
      await loadPlan(nextName)
    } else {
      applyPlan()
    }
  } finally {
    loadingList.value = false
  }
}

async function loadPlan(name) {
  if (!name) return
  activePlanName.value = name
  loadingPlan.value = true
  try {
    const data = await fetchExportPlan(name)
    applyPlan(data)
  } catch (error) {
    Message.error(error?.message || '加载导出策略失败')
  } finally {
    loadingPlan.value = false
  }
}

async function saveCurrentPlan() {
  if (!activePlanName.value) {
    Message.warning('请先选择导出策略文件')
    return
  }
  saving.value = true
  try {
    const res = await saveExportPlan(activePlanName.value, planJsonObject.value)
    Message.success(res?.message || '导出策略已保存')
    await loadPlans(activePlanName.value)
  } catch (error) {
    Message.error(error?.message || '保存导出策略失败')
  } finally {
    saving.value = false
  }
}

async function copyJson() {
  await navigator.clipboard.writeText(planJson.value)
  Message.success('导出策略 JSON 已复制')
}

onMounted(() => {
  loadPlans()
})
</script>

<template>
  <div class="config-page">
    <PageHero
      title="导出策略配置"
      description="读取后端真实导出策略配置，用于定义全库导出、按任务导出以及后续公共表扩展规则。"
      hint="左侧是 config/export-plans 下的策略文件列表，未来新增项目策略后会自动出现在这里。"
    />

    <div class="config-layout">
      <a-card class="profile-list-card" title="导出策略列表" :loading="loadingList">
        <template #extra>
          <a-button size="small" @click="loadPlans()">刷新</a-button>
        </template>
        <div class="profile-file-list">
          <a-empty v-if="plans.length === 0" description="暂无导出策略配置" />
          <button
            v-for="item in plans"
            :key="item.name"
            type="button"
            class="profile-file-item"
            :class="{ active: item.name === activePlanName }"
            @click="loadPlan(item.name)"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.path }}</span>
          </button>
        </div>
      </a-card>

      <div class="config-main">
        <a-card class="form-card config-section" title="策略详情" :loading="loadingPlan">
          <template #extra>
            <a-space>
              <a-button size="small" @click="copyJson">复制 JSON</a-button>
              <a-button size="small" type="primary" :loading="saving" @click="saveCurrentPlan">保存配置</a-button>
            </a-space>
          </template>

          <a-form layout="vertical">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="策略名称" tip="写入 name，作为策略的稳定标识。" />
                  </template>
                  <a-input v-model="plan.name" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="显示名称" tip="写入 displayName，给前端和用户识别。" />
                  </template>
                  <a-input v-model="plan.displayName" />
                </a-form-item>
              </a-col>
            </a-row>

            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="表模型" tip="本策略使用的 table profile 文件。" />
                  </template>
                  <a-select v-model="plan.profile">
                    <a-option v-for="item in profiles" :key="item.name" :value="item.name">{{ item.name }}</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="导出模式" tip="FULL_DATABASE 表示当前数据库全部表；TASK 表示按 taskId 和表模型任务条件导出。" />
                  </template>
                  <a-select v-model="plan.scopeMode">
                    <a-option value="TASK">按任务ID导出</a-option>
                    <a-option value="FULL_DATABASE">全库导出</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>

            <a-form-item>
              <a-checkbox v-model="plan.autoScopeEnabled" :disabled="plan.scopeMode === 'FULL_DATABASE'">
                启用自动任务范围
              </a-checkbox>
            </a-form-item>

            <a-form-item>
              <template #label>
                <FieldLabel label="任务ID" tip="TASK 模式下使用，支持换行或逗号分隔多个任务。" />
              </template>
              <a-textarea v-model="plan.taskIdsText" :disabled="plan.scopeMode === 'FULL_DATABASE'" :auto-size="{ minRows: 3, maxRows: 8 }" />
            </a-form-item>

            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="手工范围 manualScopes" tip="JSON 数组，后续可用于公共表、条件表等额外范围。" />
                  </template>
                  <a-textarea v-model="plan.manualScopesText" :auto-size="{ minRows: 8, maxRows: 16 }" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="上下文 context" tip="JSON 对象，用于替换条件模板中的占位符。" />
                  </template>
                  <a-textarea v-model="plan.contextText" :auto-size="{ minRows: 8, maxRows: 16 }" />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
      </div>

      <a-card class="result-panel config-preview" title="导出策略 JSON 预览">
        <div class="config-preview-actions">
          <a-button size="small" @click="copyJson">复制 JSON</a-button>
        </div>
        <pre>{{ planJson }}</pre>
      </a-card>
    </div>
  </div>
</template>
