<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { deleteExportPlan, fetchExportPlan, listExportPlans, listTableProfiles, saveExportPlan } from '../api/config'
import { listColumns, listDataSources, listTables } from '../api/datasource'
import PageHero from '../components/PageHero.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loadingList = ref(false)
const loadingPlan = ref(false)
const saving = ref(false)
const plans = ref([])
const profiles = ref([])
const dataSources = ref([])
const pickerSourceId = ref('')
const pickerTables = ref([])
const pickerTablesLoading = ref(false)
const tablePickerVisible = ref(false)
const tablePickerSelected = ref([])
const activePlanName = ref('')
const activePlanPath = ref('')
const previewVisible = ref(false)
const previewLoading = ref(false)
const previewPlanName = ref('')
const previewPlanJson = ref('')

const plan = reactive({
  name: '',
  displayName: '',
  profile: 'zy_all_new.json',
  scopeMode: 'TASK',
  manualScopes: [],
})

const planJsonObject = computed(() => ({
  name: plan.name || 'export-plan',
  displayName: plan.displayName || plan.name || '',
  profile: plan.profile || 'zy_all_new.json',
  scopeMode: plan.scopeMode,
  autoScopeEnabled: plan.scopeMode !== 'FULL_DATABASE',
  manualScopes: plan.scopeMode === 'FULL_DATABASE' ? [] : normalizedManualScopes(),
}))

const selectedPickerSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(pickerSourceId.value)) || null,
)

function createManualScope(seed = {}) {
  return {
    table: seed.table || '',
    mode: seed.mode || 'ALL',
    keyColumn: seed.keyColumn || '',
    idsText: Array.isArray(seed.ids) ? seed.ids.join('\n') : seed.idsText || '',
    conditionField: seed.conditionField || seed.keyColumn || '',
    conditionOperator: seed.conditionOperator || '=',
    conditionValueSource: seed.conditionValueSource || 'EXPORT_CONDITION',
    conditionValue: seed.conditionValue || '',
    conditionSourceField: seed.conditionSourceField || seed.conditionField || seed.keyColumn || '',
    columns: [],
    loadingColumns: false,
  }
}

function splitValues(value) {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function tableName(item) {
  return item?.tableName || item?.TABLE_NAME || item?.name || Object.values(item || {})[0] || ''
}

function columnName(item) {
  return item?.columnName || item?.COLUMN_NAME || item?.Field || Object.values(item || {})[0] || ''
}

function sqlIdentifier(value) {
  return String(value || '').trim()
}

function sqlLiteral(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`
}

function buildCondition(scope) {
  const field = sqlIdentifier(scope.conditionField)
  if (!field) {
    return ''
  }
  const operator = scope.conditionOperator || '='
  const value = scope.conditionValueSource === 'EXPORT_CONDITION'
    ? `\${${scope.conditionSourceField || scope.conditionField}}`
    : scope.conditionValue
  if (!String(value || '').trim()) {
    return ''
  }
  return `${field} ${operator} ${sqlLiteral(value)}`
}

function normalizedManualScopes() {
  return plan.manualScopes
    .map((scope) => {
      const mode = String(scope.mode || 'ALL').toUpperCase()
      const item = {
        table: scope.table,
        enabled: true,
        mode,
      }
      if (!item.table) {
        return null
      }
      if (mode === 'IDS') {
        return {
          ...item,
          keyColumn: scope.keyColumn,
          ids: splitValues(scope.idsText),
        }
      }
      if (mode === 'CONDITION') {
        return {
          ...item,
          condition: buildCondition(scope),
        }
      }
      return item
    })
    .filter((scope) => {
      if (!scope) return false
      if (scope.mode === 'IDS') return scope.keyColumn && scope.ids.length
      if (scope.mode === 'CONDITION') return Boolean(scope.condition)
      return true
    })
}

function applyPlan(data = {}) {
  plan.name = data.name || ''
  plan.displayName = data.displayName || ''
  plan.profile = data.profile || 'zy_all_new.json'
  plan.scopeMode = data.scopeMode || 'TASK'
  plan.manualScopes.splice(
    0,
    plan.manualScopes.length,
    ...(Array.isArray(data.manualScopes) ? data.manualScopes.map(scopeFromSaved) : []),
  )
  for (const scope of plan.manualScopes) {
    loadScopeColumns(scope)
  }
}

async function loadOptions() {
  const [profileItems, sourceItems] = await Promise.all([listTableProfiles(), listDataSources()])
  profiles.value = Array.isArray(profileItems) ? profileItems : []
  dataSources.value = Array.isArray(sourceItems) ? sourceItems : []
  if (!pickerSourceId.value && dataSources.value.length) {
    pickerSourceId.value = String(dataSources.value[0].id)
  }
  await loadPickerTables()
}

async function loadPickerTables() {
  pickerTables.value = []
  if (!selectedPickerSource.value) {
    return
  }
  pickerTablesLoading.value = true
  try {
    const tables = await listTables(selectedPickerSource.value)
    pickerTables.value = Array.isArray(tables) ? tables.map(tableName).filter(Boolean) : []
  } catch (error) {
    Message.error(error?.message || '加载数据表失败')
  } finally {
    pickerTablesLoading.value = false
  }
}

async function changePickerSource() {
  await loadPickerTables()
  await Promise.all(plan.manualScopes.map((scope) => loadScopeColumns(scope)))
}

async function loadScopeColumns(scope) {
  const previousKeyColumn = scope.keyColumn
  const previousConditionField = scope.conditionField
  const previousSourceField = scope.conditionSourceField
  scope.columns = []
  if (!selectedPickerSource.value || !scope.table) {
    return
  }
  scope.loadingColumns = true
  try {
    const columns = await listColumns(selectedPickerSource.value, scope.table)
    scope.columns = Array.isArray(columns) ? columns.map(columnName).filter(Boolean) : []
    scope.keyColumn = scope.columns.includes(previousKeyColumn) ? previousKeyColumn : scope.columns[0] || ''
    scope.conditionField = scope.columns.includes(previousConditionField) ? previousConditionField : scope.columns[0] || ''
    scope.conditionSourceField = scope.columns.includes(previousSourceField) ? previousSourceField : scope.conditionField
  } catch (error) {
    Message.error(error?.message || '加载字段失败')
  } finally {
    scope.loadingColumns = false
  }
}

async function openManualScopePicker() {
  if (!selectedPickerSource.value) {
    Message.warning('请先选择数据源')
    return
  }
  tablePickerVisible.value = true
  tablePickerSelected.value = []
  if (!pickerTables.value.length) {
    await loadPickerTables()
  }
}

function selectAllPickerTables() {
  const existing = new Set(plan.manualScopes.map((scope) => scope.table))
  tablePickerSelected.value = pickerTables.value.filter((table) => !existing.has(table))
}

function clearPickerTables() {
  tablePickerSelected.value = []
}

function confirmManualScopePicker() {
  if (!tablePickerSelected.value.length) {
    Message.warning('请至少选择一张表')
    return
  }
  const existing = new Set(plan.manualScopes.map((scope) => scope.table))
  const added = []
  for (const table of tablePickerSelected.value) {
    if (existing.has(table)) {
      continue
    }
    const scope = createManualScope({ table })
    plan.manualScopes.push(scope)
    added.push(scope)
  }
  tablePickerVisible.value = false
  tablePickerSelected.value = []
  for (const scope of added) {
    loadScopeColumns(scope)
  }
}

function removeManualScope(index) {
  plan.manualScopes.splice(index, 1)
}

function scopeFromSaved(scope = {}) {
  const row = createManualScope(scope)
  if (scope.mode === 'CONDITION' && scope.condition) {
    const parsed = parseSimpleCondition(scope.condition)
    Object.assign(row, parsed)
  }
  return row
}

function parseSimpleCondition(condition) {
  const match = String(condition || '').match(/^\s*([A-Za-z0-9_."`]+)\s*(>=|<=|!=|<>|=|>|<|LIKE)\s*'([^']*)'\s*$/i)
  if (!match) {
    return {
      conditionValueSource: 'FIXED',
      conditionValue: String(condition || ''),
    }
  }
  const value = match[3]
  const placeholder = value.match(/^\$\{([^}]+)\}$/)
  return {
    conditionField: match[1],
    conditionOperator: match[2].toUpperCase(),
    conditionValueSource: placeholder ? 'EXPORT_CONDITION' : 'FIXED',
    conditionValue: placeholder ? '' : value,
    conditionSourceField: placeholder ? placeholder[1] : match[1],
  }
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
      activePlanPath.value = ''
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
    const listItem = plans.value.find((item) => item.name === name)
    activePlanPath.value = data._path || listItem?.path || ''
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

async function copyPreviewJson() {
  await navigator.clipboard.writeText(previewPlanJson.value)
  Message.success('导出策略 JSON 已复制')
}

async function previewPlan(item) {
  if (!item?.name) return
  previewVisible.value = true
  previewLoading.value = true
  previewPlanName.value = item.name
  previewPlanJson.value = ''
  try {
    const data = await fetchExportPlan(item.name)
    const cleanData = { ...data }
    delete cleanData._fileName
    delete cleanData._path
    previewPlanJson.value = JSON.stringify(cleanData, null, 2)
  } catch (error) {
    Message.error(error?.message || '加载导出策略失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function confirmDeletePlan(item) {
  if (!item?.name) return
  Modal.confirm({
    title: '删除导出策略',
    content: `确认删除导出策略配置文件「${item.name}」？`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const res = await deleteExportPlan(item.name)
      if (res?.success === false) {
        Message.error(res?.message || '删除导出策略失败')
        return
      }
      Message.success(res?.message || '导出策略已删除')
      const nextPreferred = item.name === activePlanName.value ? '' : activePlanName.value
      await loadPlans(nextPreferred)
    },
  })
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
          <div
            v-for="item in plans"
            :key="item.name"
            class="profile-file-item"
            :class="{ active: item.name === activePlanName }"
          >
            <button type="button" class="profile-file-main" @click="loadPlan(item.name)">
              <strong>{{ item.name }}</strong>
            </button>
            <div class="profile-file-actions">
              <a-button size="mini" @click="previewPlan(item)">预览</a-button>
              <a-button size="mini" status="danger" @click="confirmDeletePlan(item)">删除</a-button>
            </div>
          </div>
        </div>
      </a-card>

      <div class="config-main">
        <a-card class="form-card config-section" title="策略详情" :loading="loadingPlan">
          <template #extra>
            <a-space>
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

            <a-form-item>
              <template #label>
                <FieldLabel label="配置路径" tip="后端自动生成的导出策略配置文件路径，仅用于定位文件。" />
              </template>
              <a-input :model-value="activePlanPath" disabled />
            </a-form-item>

            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="数据库模型" tip="本策略使用的 table profile 文件。" />
                  </template>
                  <a-select v-model="plan.profile">
                    <a-option v-for="item in profiles" :key="item.name" :value="item.name">{{ item.name }}</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="导出模式" tip="FULL_DATABASE 表示当前数据库全部表；TASK 表示导出时按页面填写的组合条件和数据库模型条件导出。" />
                  </template>
                  <a-select v-model="plan.scopeMode">
                    <a-option value="TASK">按条件导出</a-option>
                    <a-option value="FULL_DATABASE">全库导出</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>

            <template v-if="plan.scopeMode !== 'FULL_DATABASE'">
              <div class="config-table-header">
                <FieldLabel label="额外导出表" tip="按条件导出时，自动范围会按数据库模型导出业务表；这里仅配置还要额外带上的公共表、字典表或配置表。" />
                <a-space>
                  <a-select
                    v-model="pickerSourceId"
                    size="small"
                    style="width: 220px"
                    placeholder="选择取表字段的数据源"
                    @change="changePickerSource"
                  >
                    <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                      {{ item.name }} · {{ item.type }}
                    </a-option>
                  </a-select>
                  <a-button size="small" type="primary" @click="openManualScopePicker">新增额外表</a-button>
                </a-space>
              </div>

              <a-empty v-if="plan.manualScopes.length === 0" description="暂无额外导出表。需要公共表、字典表时再添加。" />
              <div v-else class="manual-scope-list">
              <div v-for="(scope, index) in plan.manualScopes" :key="index" class="manual-scope-row">
                <a-row :gutter="12">
                  <a-col :span="8">
                    <a-form-item>
                      <template #label>
                        <FieldLabel label="数据表" tip="通过新增额外表弹窗选择。保存策略时只保存表名。" />
                      </template>
                      <div class="manual-scope-table-name">{{ scope.table }}</div>
                    </a-form-item>
                  </a-col>
                  <a-col :span="12">
                    <a-form-item>
                      <template #label>
                        <FieldLabel label="导出方式" tip="整表导出适合字典表；按字段条件导出适合租户、项目等公共配置；按字段值列表适合少量固定记录。" />
                      </template>
                      <a-select v-model="scope.mode">
                        <a-option value="ALL">整表导出</a-option>
                        <a-option value="CONDITION">按字段条件导出</a-option>
                        <a-option value="IDS">按字段值列表导出</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                  <a-col :span="4">
                    <a-form-item label="操作">
                      <a-button status="danger" @click="removeManualScope(index)">删除</a-button>
                    </a-form-item>
                  </a-col>
                </a-row>

                <a-row v-if="scope.mode === 'CONDITION'" :gutter="12">
                  <a-col :span="6">
                    <a-form-item label="条件字段">
                      <a-select
                        v-model="scope.conditionField"
                        :loading="scope.loadingColumns"
                        allow-search
                        placeholder="请选择字段"
                      >
                        <a-option v-for="column in scope.columns" :key="column" :value="column">{{ column }}</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                  <a-col :span="4">
                    <a-form-item label="关系">
                      <a-select v-model="scope.conditionOperator">
                        <a-option value="=">等于</a-option>
                        <a-option value="!=">不等于</a-option>
                        <a-option value=">">大于</a-option>
                        <a-option value=">=">大于等于</a-option>
                        <a-option value="<">小于</a-option>
                        <a-option value="<=">小于等于</a-option>
                        <a-option value="LIKE">包含</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                  <a-col :span="6">
                    <a-form-item label="值来源">
                      <a-select v-model="scope.conditionValueSource">
                        <a-option value="EXPORT_CONDITION">来自导出页组合条件</a-option>
                        <a-option value="FIXED">固定值</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                  <a-col :span="8">
                    <a-form-item v-if="scope.conditionValueSource === 'EXPORT_CONDITION'">
                      <template #label>
                        <FieldLabel label="对应导出字段" tip="导出页组合条件里选择同名字段时，这里会自动使用那次导出的字段值。" />
                      </template>
                      <a-select
                        v-model="scope.conditionSourceField"
                        :loading="scope.loadingColumns"
                        allow-search
                        placeholder="请选择对应字段"
                      >
                        <a-option v-for="column in scope.columns" :key="column" :value="column">{{ column }}</a-option>
                      </a-select>
                    </a-form-item>
                    <a-form-item v-else label="固定值">
                      <a-input v-model="scope.conditionValue" placeholder="例如：T1" />
                    </a-form-item>
                  </a-col>
                </a-row>

                <a-row v-if="scope.mode === 'IDS'" :gutter="12">
                  <a-col :span="8">
                    <a-form-item label="字段">
                      <a-select
                        v-model="scope.keyColumn"
                        :loading="scope.loadingColumns"
                        allow-search
                        placeholder="请选择字段"
                      >
                        <a-option v-for="column in scope.columns" :key="column" :value="column">{{ column }}</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                  <a-col :span="16">
                    <a-form-item>
                      <template #label>
                        <FieldLabel label="字段值" tip="支持换行、逗号或空格分隔多个值。" />
                      </template>
                      <a-textarea v-model="scope.idsText" :auto-size="{ minRows: 2, maxRows: 5 }" placeholder="例如：1001&#10;1002" />
                    </a-form-item>
                  </a-col>
                </a-row>
              </div>
              </div>
            </template>
          </a-form>
        </a-card>
      </div>

      <a-modal
        v-model:visible="tablePickerVisible"
        title="选择额外导出表"
        width="720px"
        :footer="false"
      >
        <a-spin :loading="pickerTablesLoading">
          <div class="config-preview-actions">
            <a-button size="small" @click="selectAllPickerTables">全选未添加表</a-button>
            <a-button size="small" @click="clearPickerTables">清空</a-button>
          </div>
          <a-empty v-if="pickerTables.length === 0" description="当前数据源暂无可选表" />
          <a-checkbox-group v-else v-model="tablePickerSelected" class="table-picker-grid">
            <a-checkbox
              v-for="table in pickerTables"
              :key="table"
              :value="table"
              :disabled="plan.manualScopes.some((scope) => scope.table === table)"
            >
              {{ table }}
            </a-checkbox>
          </a-checkbox-group>
          <div class="modal-action-row">
            <a-button @click="tablePickerVisible = false">取消</a-button>
            <a-button type="primary" @click="confirmManualScopePicker">确认添加</a-button>
          </div>
        </a-spin>
      </a-modal>

      <a-modal
        v-model:visible="previewVisible"
        :title="`${previewPlanName} JSON 预览`"
        :footer="false"
        width="880px"
      >
        <a-spin :loading="previewLoading">
          <div class="config-preview-actions">
            <a-button size="small" @click="copyPreviewJson">复制 JSON</a-button>
          </div>
          <pre class="profile-json-preview">{{ previewPlanJson }}</pre>
        </a-spin>
      </a-modal>
    </div>
  </div>
</template>
