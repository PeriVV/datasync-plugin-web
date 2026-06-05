<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { deleteTableProfile, fetchTableProfile, listTableProfiles, saveTableProfile } from '../api/config'
import { previewTableProfile, testProfileLocator } from '../api/datasync'
import { listColumns, listDataSources, listTables } from '../api/datasource'
import FieldLabel from '../components/FieldLabel.vue'
import PageHero from '../components/PageHero.vue'

const currentStep = ref(1)
const loadingList = ref(false)
const loadingProfile = ref(false)
const loadingDataSources = ref(false)
const loadingTables = ref(false)
const saving = ref(false)
const testing = ref(false)
const creatingProfile = ref(false)
const relationPage = ref(1)
const relationPageSize = 4
const tablePickerPage = ref(1)
const tablePickerPageSize = 12
const tablePickerKeyword = ref('')
const profiles = ref([])
const dataSources = ref([])
const sourceTables = ref([])
const columnsByTable = reactive({})
const activeProfileName = ref('')
const activeProfilePath = ref('')
const createProfileVisible = ref(false)
const tablePickerVisible = ref(false)
const tablePickerSelectedTables = ref([])
const previewVisible = ref(false)
const previewProfileName = ref('')
const previewProfileJson = ref('')
const testResult = ref(null)
const locatorTesting = ref(false)
const locatorTestResult = ref(null)
const locatorTestValues = reactive({})

const createProfileForm = reactive({
  fileName: '',
  name: '任务数据模型',
  description: '用于导出、导入、同步某个任务及其相关数据',
  dataSourceId: '',
})

const contentTypeOptions = [
  { label: '普通数据表', value: 'DATA' },
  { label: '附件数据表', value: 'ATTACHMENT' },
  { label: '日志表', value: 'LOG' },
  { label: '公共字典表', value: 'DICTIONARY' },
]

const profile = reactive({
  name: '',
  description: '',
  dataSourceId: '',
  dataSourceType: '',
  dataSourceName: '',
  dataSourceUrl: '',
  businessIdentifierName: '任务ID',
  mainTableName: '',
  mainKeyColumn: '',
  locatorRule: {
    mode: 'COMPOSITE',
    params: [],
    query: { conditionTables: [] },
  },
  detectTables: [],
  autoTaskTables: [],
  backupTables: [],
})

const boundDataSource = computed(() => findDataSource(profile.dataSourceId, profile.dataSourceType, profile.dataSourceName))
const createBoundDataSource = computed(() => findDataSource(createProfileForm.dataSourceId))
const relatedScopes = computed(() => profile.autoTaskTables)
const attachmentScopes = computed(() => profile.autoTaskTables.filter((item) => item.fileTable))
const pagedRelatedScopes = computed(() => {
  const start = (relationPage.value - 1) * relationPageSize
  return relatedScopes.value.slice(start, start + relationPageSize)
})
const filteredSourceTables = computed(() => {
  const keyword = tablePickerKeyword.value.trim().toLowerCase()
  return keyword
    ? sourceTables.value.filter((table) => table.toLowerCase().includes(keyword))
    : sourceTables.value
})
const pagedSourceTables = computed(() => {
  const start = (tablePickerPage.value - 1) * tablePickerPageSize
  return filteredSourceTables.value.slice(start, start + tablePickerPageSize)
})
const attachmentTableNames = computed({
  get: () => attachmentScopes.value.map((item) => item.tableName),
  set: (tableNames) => {
    const selectedNames = Array.isArray(tableNames) ? tableNames : []
    profile.autoTaskTables.forEach((row) => {
      const enabled = selectedNames.some((name) => sameName(name, row.tableName))
      row.fileTable = enabled
      row.exportAttachments = enabled
      if (enabled) loadTableColumns(row.tableName)
    })
  },
})
const conditionTables = computed(() => profile.locatorRule.query.conditionTables || [])
const locatorParams = computed(() => conditionTables.value.flatMap((table) =>
  (table.conditions || []).map((condition) => ({ ...condition, table: table.table })),
))
const availableParamNames = computed(() => locatorParams.value.map((item) => item.name).filter(Boolean))
const locatorSummary = computed(() => {
  const labels = locatorParams.value.map((item) => item.label || item.name).filter(Boolean)
  const tableRules = conditionTables.value
    .map((table) => `${table.table || '条件表'}(${(table.conditions || []).map((item) => `${item.field || '字段'} = \${${item.name || 'param'}}`).join(' AND ')})`)
    .join('；')
  return `用户导出时填写${labels.join('、') || '业务条件'}，系统先按组合条件验证 ${tableRules || '条件表'}，再用这些参数带出第 3 步配置的数据表、附件、日志和字典。`
})
const previewColumns = [
  { title: '涉及表', dataIndex: 'tableName', width: 220 },
  { title: '查询条件', dataIndex: 'condition' },
  { title: '记录数', dataIndex: 'recordCount', width: 100 },
  { title: '附件记录', dataIndex: 'attachmentCount', width: 100 },
  { title: '找到附件', dataIndex: 'foundAttachmentCount', width: 100 },
  { title: '缺失附件', dataIndex: 'missingAttachmentCount', width: 100 },
]

function sameName(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
}

function normalizeTable(row) {
  return row?.tableName || row?.tablename || row?.TABLE_NAME || row?.table || Object.values(row || {})[0] || ''
}

function normalizeColumn(row) {
  return row?.columnName || row?.column_name || row?.COLUMN_NAME || row?.Field || row?.field || Object.values(row || {})[0] || ''
}

function simpleRelationField(condition) {
  const match = String(condition || '').match(/^\s*([A-Za-z0-9_."`]+)\s*=\s*'\$\{(?:taskId|task_id)\}'\s*$/i)
  return match ? match[1].replace(/["`]/g, '') : ''
}

function createLocatorParam(overrides = {}) {
  return {
    label: overrides.label || '任务ID',
    name: overrides.name || overrides.paramName || 'taskId',
    field: overrides.field || '',
    table: overrides.table || '',
  }
}

function createConditionTable(table = '') {
  return {
    table,
    conditions: [],
  }
}

function normalizeLocatorRule(data = {}, configuredMain = '', configuredMainKey = '') {
  const source = data.locatorRule || {}
  const sourceTables = Array.isArray(source.query?.conditionTables) ? source.query.conditionTables : []
  let conditionTables = sourceTables.map((group) => ({
    table: group.table || '',
    conditions: Array.isArray(group.conditions) ? group.conditions.map(createLocatorParam) : [],
  })).filter((group) => group.table || group.conditions.length)
  if (!conditionTables.length) {
    const params = Array.isArray(source.params) && source.params.length
      ? source.params.map((item) => createLocatorParam({ ...item, table: item.table || source.query?.table || configuredMain }))
      : [createLocatorParam({
        label: data.businessIdentifierName || '任务ID',
        name: 'taskId',
        field: configuredMainKey,
        table: configuredMain,
      })]
    const grouped = new Map()
    params.forEach((param) => {
      const table = param.table || configuredMain || source.query?.table || ''
      if (!grouped.has(table)) grouped.set(table, createConditionTable(table))
      grouped.get(table).conditions.push(param)
    })
    conditionTables = [...grouped.values()]
  }
  return {
    mode: 'COMPOSITE',
    params: conditionTables.flatMap((group) => group.conditions.map((item) => ({ ...item, table: group.table }))),
    query: { conditionTables },
  }
}

function syncLegacyMainFromLocator() {
  const firstGroup = conditionTables.value[0]
  const firstParam = firstGroup?.conditions?.[0]
  profile.mainTableName = firstGroup?.table || ''
  profile.mainKeyColumn = firstParam?.field || ''
  profile.businessIdentifierName = firstParam?.label || profile.businessIdentifierName || '业务条件'
}

function generatedCondition(row) {
  if (row.contentType === 'DICTIONARY') return '1 = 1'
  const rules = Array.isArray(row.queryRules) ? row.queryRules.filter((item) => item.field && item.paramName) : []
  return rules.length
    ? rules.map((item) => `${item.field} = '\${${item.paramName}}'`).join(' AND ')
    : '请添加查询规则'
}

function toEditableScope(row = {}, mainTableName = '') {
  const parsedField = row.relationField || simpleRelationField(row.taskConditionTemplate)
  const isMain = sameName(row.tableName, mainTableName)
  return {
    tableName: row.tableName || '',
    keyColumn: row.keyColumn || 'id',
    contentType: row.contentType || (row.fileTable ? 'ATTACHMENT' : 'DATA'),
    queryRules: Array.isArray(row.queryRules)
      ? row.queryRules.map((item) => ({ field: item.field || '', paramName: item.paramName || '' }))
      : parsedField
        ? [{ field: parsedField, paramName: 'taskId' }]
        : [],
    relationField: isMain ? row.keyColumn || parsedField || 'id' : parsedField,
    relationTargetTable: row.relationTargetTable || mainTableName,
    relationTargetField: row.relationTargetField || '',
    advancedRule: Boolean(row.taskConditionTemplate) && !parsedField,
    taskConditionTemplate: row.taskConditionTemplate || '',
    fileTable: Boolean(row.fileTable),
    filePathValue: row.fileColumn || row.filePathTemplate || '',
    fileNameColumn: row.fileNameColumn || '',
    exportAttachments: row.exportAttachments !== false,
    dependencyOrder: Number(row.dependencyOrder || 0),
  }
}

function createScope(tableName = '') {
  return {
    tableName,
    keyColumn: 'id',
    contentType: 'DATA',
    queryRules: [],
    relationField: '',
    relationTargetTable: profile.mainTableName,
    relationTargetField: profile.mainKeyColumn,
    advancedRule: false,
    taskConditionTemplate: '',
    fileTable: false,
    filePathValue: '',
    fileNameColumn: '',
    exportAttachments: true,
    dependencyOrder: profile.autoTaskTables.length * 10,
  }
}

function dataSourceSnapshot(source) {
  if (!source) return null
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
    if (found) return found
  }
  if (type && name) {
    return dataSources.value.find((item) => item.type === type && item.name === name) || null
  }
  return null
}

function applyDataSource(source) {
  profile.dataSourceId = source ? String(source.id || '') : ''
  profile.dataSourceType = source?.type || ''
  profile.dataSourceName = source?.name || ''
  profile.dataSourceUrl = source?.url || ''
  testResult.value = null
  loadSourceTables()
}

function currentDataSourceSnapshot() {
  return dataSourceSnapshot(boundDataSource.value) || (
    profile.dataSourceType || profile.dataSourceName || profile.dataSourceUrl
      ? {
        id: profile.dataSourceId || '',
        type: profile.dataSourceType || '',
        name: profile.dataSourceName || '',
        url: profile.dataSourceUrl || '',
      }
      : null
  )
}

function applyProfile(data = {}) {
  const scopes = Array.isArray(data.autoTaskTables) ? data.autoTaskTables : []
  const configuredMain = data.mainTable?.tableName || scopes[0]?.tableName || ''
  const configuredMainKey = data.mainTable?.keyColumn || scopes.find((item) => sameName(item.tableName, configuredMain))?.keyColumn || ''
  profile.name = data.name || ''
  profile.description = data.description || '用于导出、导入、同步某个业务标识及其相关数据'
  profile.dataSourceId = data.dataSource?.id ? String(data.dataSource.id) : ''
  profile.dataSourceType = data.dataSource?.type || ''
  profile.dataSourceName = data.dataSource?.name || ''
  profile.dataSourceUrl = data.dataSource?.url || ''
  const matchedSource = findDataSource(profile.dataSourceId, profile.dataSourceType, profile.dataSourceName)
  if (matchedSource) profile.dataSourceId = String(matchedSource.id)
  profile.businessIdentifierName = data.businessIdentifierName || '任务ID'
  profile.mainTableName = configuredMain
  profile.mainKeyColumn = configuredMainKey
  profile.locatorRule = normalizeLocatorRule(data, configuredMain, configuredMainKey)
  syncLegacyMainFromLocator()
  profile.detectTables = Array.isArray(data.detectTables) ? [...data.detectTables] : []
  profile.autoTaskTables = scopes.map((item) => toEditableScope(item, configuredMain))
  profile.backupTables = Array.isArray(data.backupTables) ? data.backupTables.map((item) => ({ ...item })) : []
  syncMainMetadata()
  testResult.value = null
  currentStep.value = 1
  relationPage.value = 1
  loadSourceTables()
}

function syncMainMetadata() {
  profile.autoTaskTables.forEach((item, index) => {
    item.relationTargetTable = profile.mainTableName
    item.relationTargetField = profile.mainKeyColumn
    item.fileTable = item.contentType === 'ATTACHMENT'
    item.dependencyOrder = index * 10
  })
  if (profile.mainTableName && !profile.detectTables.some((item) => sameName(item, profile.mainTableName))) {
    profile.detectTables.unshift(profile.mainTableName)
  }
}

function cleanScope(row) {
  const taskConditionTemplate = row.advancedRule && row.taskConditionTemplate
    ? row.taskConditionTemplate
    : generatedCondition(row)
  const pathValue = String(row.filePathValue || '').trim()
  const directPathField = /^[A-Za-z_][A-Za-z0-9_]*$/.test(pathValue)
  const fileTable = row.contentType === 'ATTACHMENT'
  return {
    tableName: row.tableName,
    keyColumn: row.keyColumn || 'id',
    contentType: row.contentType || 'DATA',
    queryRules: Array.isArray(row.queryRules) ? row.queryRules : [],
    relationField: row.queryRules?.[0]?.field || row.relationField || null,
    relationTargetTable: profile.mainTableName || null,
    relationTargetField: profile.mainKeyColumn || null,
    taskConditionTemplate,
    fileTable: Boolean(fileTable && row.exportAttachments),
    fileColumn: fileTable && row.exportAttachments && directPathField ? pathValue : null,
    filePathTemplate: fileTable && row.exportAttachments && pathValue && !directPathField ? pathValue : null,
    fileNameColumn: fileTable ? row.fileNameColumn || null : null,
    exportAttachments: Boolean(fileTable && row.exportAttachments),
    dependencyOrder: Number(row.dependencyOrder || 0),
  }
}

function cleanBackup(row) {
  const source = profile.autoTaskTables.find((item) => sameName(item.tableName, row.sourceTable))
  return {
    sourceTable: row.sourceTable || '',
    targetTable: row.targetTable || '',
    taskConditionTemplate: source
      ? source.advancedRule
        ? source.taskConditionTemplate
        : generatedCondition(source)
      : row.taskConditionTemplate || null,
  }
}

function cleanLocatorRule() {
  const groups = conditionTables.value
    .filter((group) => group.table && Array.isArray(group.conditions) && group.conditions.length)
    .map((group) => ({
      table: group.table,
      conditions: group.conditions
        .filter((item) => item.name && item.label && item.field)
        .map((item) => ({
          label: item.label,
          name: item.name,
          field: item.field,
          table: group.table,
        })),
    }))
  return {
    mode: 'COMPOSITE',
    params: groups.flatMap((group) => group.conditions),
    query: { conditionTables: groups },
  }
}

const profileJsonObject = computed(() => {
  syncLegacyMainFromLocator()
  syncMainMetadata()
  const orderedScopes = [...profile.autoTaskTables]
  return {
    name: profile.name || '任务数据模型',
    description: profile.description || '',
    ...(currentDataSourceSnapshot() ? { dataSource: currentDataSourceSnapshot() } : {}),
    businessIdentifierName: profile.businessIdentifierName || '任务ID',
    locatorRule: cleanLocatorRule(),
    mainTable: {
      tableName: profile.mainTableName || '',
      keyColumn: profile.mainKeyColumn || '',
    },
    detectTables: profile.detectTables.filter(Boolean),
    autoTaskTables: orderedScopes.filter((item) => item.tableName).map(cleanScope),
    backupTables: profile.backupTables
      .filter((item) => item.sourceTable && item.targetTable)
      .map(cleanBackup),
  }
})

const profileJson = computed(() => JSON.stringify(profileJsonObject.value, null, 2))

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

async function loadSourceTables() {
  sourceTables.value = []
  if (!boundDataSource.value) return
  loadingTables.value = true
  try {
    const rows = await listTables(boundDataSource.value)
    sourceTables.value = (Array.isArray(rows) ? rows : []).map(normalizeTable).filter(Boolean)
    if (profile.mainTableName) await loadTableColumns(profile.mainTableName)
    await Promise.all(conditionTables.value.map((group) => loadTableColumns(group.table)))
    await Promise.all(attachmentScopes.value.map((item) => loadTableColumns(item.tableName)))
  } catch (error) {
    Message.error(error?.message || '读取数据源表结构失败')
  } finally {
    loadingTables.value = false
  }
}

async function loadTableColumns(tableName) {
  if (!boundDataSource.value || !tableName || columnsByTable[tableName]) return
  try {
    const rows = await listColumns(boundDataSource.value, tableName)
    columnsByTable[tableName] = (Array.isArray(rows) ? rows : []).map(normalizeColumn).filter(Boolean)
  } catch {
    columnsByTable[tableName] = []
  }
}

async function handleMainTableChange(tableName) {
  if (!tableName) {
    profile.mainKeyColumn = ''
    return
  }
  let row = profile.autoTaskTables.find((item) => sameName(item.tableName, tableName))
  if (!row) {
    row = createScope(tableName)
    profile.autoTaskTables.unshift(row)
  }
  profile.mainTableName = tableName
  await loadTableColumns(tableName)
  const columns = columnsByTable[tableName] || []
  if (!columns.some((item) => sameName(item, profile.mainKeyColumn))) {
    profile.mainKeyColumn = columns.find((item) => sameName(item, 'id')) || columns[0] || row.keyColumn || ''
  }
  syncMainMetadata()
  relationPage.value = 1
}

function handleMainKeyChange(value) {
  profile.mainKeyColumn = value || ''
  syncMainMetadata()
}

async function handleConditionTableChange(group, tableName) {
  group.table = tableName || ''
  ;(group.conditions || []).forEach((condition) => { condition.table = group.table })
  await loadTableColumns(tableName)
  syncLegacyMainFromLocator()
  syncMainMetadata()
}

function addConditionTable() {
  conditionTables.value.push(createConditionTable(''))
}

function removeConditionTable(index) {
  if (conditionTables.value.length <= 1) {
    Message.warning('至少保留一张条件表')
    return
  }
  conditionTables.value.splice(index, 1)
}

function addFieldCondition(group) {
  if (!group.conditions) group.conditions = []
  group.conditions.push(createLocatorParam({
    label: '',
    name: '',
    field: '',
    table: group.table || '',
  }))
}

function removeFieldCondition(group, index) {
  if ((group.conditions || []).length <= 1) {
    Message.warning('每张条件表至少保留一个字段条件')
    return
  }
  group.conditions.splice(index, 1)
}

function paramNameDuplicated(name) {
  if (!name) return false
  return locatorParams.value.filter((item) => item.name === name).length > 1
}

function addQueryRule(row) {
  if (!row.queryRules) row.queryRules = []
  row.queryRules.push({ field: '', paramName: availableParamNames.value[0] || '' })
}

function removeQueryRule(row, index) {
  row.queryRules.splice(index, 1)
}

function locatorTestConditions() {
  return locatorParams.value.map((item) => ({
    field: item.name,
    values: [String(locatorTestValues[item.name] || '').trim()].filter(Boolean),
  }))
}

function recordDescriptions(row = {}) {
  return Object.entries(row).map(([label, value]) => ({
    label,
    value: value === null || value === undefined ? '' : String(value),
  }))
}

async function runLocatorTest() {
  if (!validateLocatorRule()) return
  const missing = locatorParams.value.find((item) => !String(locatorTestValues[item.name] || '').trim())
  if (missing) {
    Message.warning(`请输入${missing.label || missing.name}`)
    return
  }
  locatorTesting.value = true
  try {
    const { data } = await testProfileLocator({
      sourceId: boundDataSource.value.id,
      sourceType: boundDataSource.value.type,
      sourceName: boundDataSource.value.name,
      profile: activeProfileName.value,
      profileDefinition: profileJsonObject.value,
      conditions: locatorTestConditions(),
    })
    locatorTestResult.value = data
    Message[data.success ? 'success' : 'error'](data.message || (data.success ? '定位成功' : '定位失败'))
  } catch (error) {
    Message.error(error?.message || '测试定位失败')
  } finally {
    locatorTesting.value = false
  }
}

function openTablePicker() {
  if (!boundDataSource.value) {
    Message.warning('请先在第一步选择适用数据源')
    return
  }
  tablePickerSelectedTables.value = []
  tablePickerKeyword.value = ''
  tablePickerPage.value = 1
  tablePickerVisible.value = true
  loadSourceTables()
}

function tableAlreadyUsed(tableName) {
  return profile.autoTaskTables.some((item) => sameName(item.tableName, tableName))
}

async function addSelectedTables() {
  if (!tablePickerSelectedTables.value.length) {
    Message.warning('请选择带出表')
    return
  }
  for (const tableName of tablePickerSelectedTables.value) {
    if (tableAlreadyUsed(tableName)) continue
    const row = createScope(tableName)
    profile.autoTaskTables.push(row)
    await loadTableColumns(tableName)
    const columns = columnsByTable[tableName] || []
    row.keyColumn = columns.find((item) => sameName(item, 'id')) || columns[0] || 'id'
    const firstParam = locatorParams.value[0]
    const matchedField = firstParam
      ? columns.find((item) => sameName(item, firstParam.field) || sameName(item, firstParam.name))
      : ''
    row.queryRules = matchedField && firstParam ? [{ field: matchedField, paramName: firstParam.name }] : []
    row.relationField = matchedField || ''
  }
  syncMainMetadata()
  relationPage.value = Math.max(1, Math.ceil(relatedScopes.value.length / relationPageSize))
  tablePickerVisible.value = false
}

function removeRelatedTable(row) {
  const index = profile.autoTaskTables.indexOf(row)
  if (index >= 0) profile.autoTaskTables.splice(index, 1)
  relationPage.value = Math.min(
    relationPage.value,
    Math.max(1, Math.ceil(relatedScopes.value.length / relationPageSize)),
  )
}

function addBackupTable() {
  profile.backupTables.push({
    sourceTable: relatedScopes.value[0]?.tableName || '',
    targetTable: '',
    taskConditionTemplate: null,
  })
}

function removeBackupTable(index) {
  profile.backupTables.splice(index, 1)
}

async function loadProfiles(preferredName = activeProfileName.value) {
  loadingList.value = true
  try {
    const items = await listTableProfiles()
    const profileFiles = Array.isArray(items) ? items : []
    profiles.value = await Promise.all(profileFiles.map(async (item) => {
      try {
        const definition = await fetchTableProfile(item.name)
        return {
          ...item,
          modelName: definition.name || item.name,
        }
      } catch {
        return {
          ...item,
          modelName: item.name,
        }
      }
    }))
    const names = profiles.value.map((item) => item.name)
    const nextName = names.includes(preferredName) ? preferredName : names[0] || ''
    if (nextName) await loadProfile(nextName)
  } finally {
    loadingList.value = false
  }
}

async function loadProfile(name) {
  activeProfileName.value = name
  loadingProfile.value = true
  try {
    const data = await fetchTableProfile(name)
    activeProfilePath.value = data._path || profiles.value.find((item) => item.name === name)?.path || ''
    applyProfile(data)
  } catch (error) {
    Message.error(error?.message || '加载业务数据模型失败')
  } finally {
    loadingProfile.value = false
  }
}

function validateModel() {
  if (!profile.name.trim()) {
    Message.warning('请填写模型名称')
    currentStep.value = 1
    return false
  }
  if (!boundDataSource.value) {
    Message.warning('请选择适用数据源')
    currentStep.value = 1
    return false
  }
  if (!validateLocatorRule()) {
    currentStep.value = 2
    return false
  }
  const invalidRelation = relatedScopes.value.find((item) =>
    item.contentType !== 'DICTIONARY'
    && !item.advancedRule
    && !(item.queryRules || []).some((rule) => rule.field && rule.paramName),
  )
  if (invalidRelation) {
    Message.warning(`请为带出表 ${invalidRelation.tableName} 配置查询规则`)
    currentStep.value = 3
    return false
  }
  return true
}

function validateLocatorRule() {
  if (!boundDataSource.value) {
    Message.warning('请先选择适用数据源')
    return false
  }
  if (!conditionTables.value.length || conditionTables.value.some((group) => !group.table)) {
    Message.warning('请至少配置一张条件表')
    return false
  }
  if (!locatorParams.value.length || locatorParams.value.some((item) => !item.label || !item.name || !item.field)) {
    Message.warning('请完整填写每个字段条件的字段、显示名称和参数名')
    return false
  }
  const duplicated = locatorParams.value.find((item) => paramNameDuplicated(item.name))
  if (duplicated) {
    Message.warning(`参数名必须全局唯一：${duplicated.name}`)
    return false
  }
  return true
}

async function saveCurrentProfile() {
  if (!activeProfileName.value || !validateModel()) return false
  saving.value = true
  try {
    const result = await saveTableProfile(activeProfileName.value, profileJsonObject.value)
    Message.success(result?.message || '业务数据模型已保存')
    await loadProfiles(activeProfileName.value)
    return true
  } catch (error) {
    Message.error(error?.message || '保存业务数据模型失败')
    return false
  } finally {
    saving.value = false
  }
}

async function testCurrentProfile() {
  if (!validateModel()) return
  const missing = locatorParams.value.find((item) => !String(locatorTestValues[item.name] || '').trim())
  if (missing) {
    Message.warning(`请输入${missing.label || missing.name}`)
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const response = await previewTableProfile({
      sourceId: boundDataSource.value.id,
      sourceType: boundDataSource.value.type,
      sourceName: boundDataSource.value.name,
      profile: activeProfileName.value,
      profileDefinition: profileJsonObject.value,
      conditions: locatorTestConditions(),
    })
    testResult.value = response.data
    Message.success(response.data?.message || '模型测试完成')
  } catch (error) {
    Message.error(error?.message || '模型测试失败')
  } finally {
    testing.value = false
  }
}

function nextStep() {
  if (currentStep.value === 1 && (!profile.name.trim() || !boundDataSource.value)) {
    Message.warning('请先填写模型名称并选择适用数据源')
    return
  }
  if (currentStep.value === 2 && !validateLocatorRule()) return
  currentStep.value = Math.min(4, currentStep.value + 1)
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

function normalizeProfileFileName(value) {
  const name = String(value || '').trim()
  if (!name) return ''
  return name.toLowerCase().endsWith('.json') ? name : `${name}.json`
}

async function openCreateProfile() {
  await loadDataSources()
  const baseName = `business_model_${Date.now()}`
  createProfileForm.fileName = `${baseName}.json`
  createProfileForm.name = '任务数据模型'
  createProfileForm.description = '用于导出、导入、同步某个任务及其相关数据'
  createProfileForm.dataSourceId = profile.dataSourceId || String(dataSources.value[0]?.id || '')
  createProfileVisible.value = true
}

async function createProfile() {
  const fileName = normalizeProfileFileName(createProfileForm.fileName)
  if (!/^[A-Za-z0-9_-]+\.json$/.test(fileName)) {
    Message.warning('文件名只能包含字母、数字、下划线和中划线')
    return
  }
  const dataSource = dataSourceSnapshot(createBoundDataSource.value)
  creatingProfile.value = true
  try {
    await saveTableProfile(fileName, {
      name: createProfileForm.name.trim() || '任务数据模型',
      description: createProfileForm.description.trim(),
      ...(dataSource ? { dataSource } : {}),
      businessIdentifierName: '任务ID',
      locatorRule: {
        mode: 'COMPOSITE',
        params: [],
        query: { conditionTables: [{ table: '', conditions: [{ label: '任务ID', name: 'taskId', field: '' }] }] },
      },
      mainTable: { tableName: '', keyColumn: '' },
      detectTables: [],
      autoTaskTables: [],
      backupTables: [],
    })
    createProfileVisible.value = false
    await loadProfiles(fileName)
    Message.success('业务数据模型已创建，请继续设置查找条件')
  } catch (error) {
    Message.error(error?.message || '创建业务数据模型失败')
  } finally {
    creatingProfile.value = false
  }
}

async function previewProfile(item) {
  const data = await fetchTableProfile(item.name)
  delete data._fileName
  delete data._path
  previewProfileName.value = item.modelName || data.name || item.name
  previewProfileJson.value = JSON.stringify(data, null, 2)
  previewVisible.value = true
}

function confirmDeleteProfile(item) {
  Modal.confirm({
    title: '删除业务数据模型',
    content: `确认删除「${item.modelName || item.name}」？删除后使用该模型的导出、同步和备份任务将无法执行。`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      await deleteTableProfile(item.name)
      await loadProfiles(item.name === activeProfileName.value ? '' : activeProfileName.value)
      Message.success('业务数据模型已删除')
    },
  })
}

async function copyJson() {
  await navigator.clipboard.writeText(profileJson.value)
  Message.success('模型 JSON 已复制')
}

onMounted(async () => {
  await loadDataSources()
  await loadProfiles()
})
</script>

<template>
  <div class="config-page">
    <PageHero title="数据库模板配置" description="告诉系统：一项业务数据包含哪些表、表之间如何关联、有哪些附件，以及如何通过业务标识查出完整数据。"
      hint="页面会根据组合条件和带出规则自动生成查询范围，用户不需要理解底层表关系或手写 SQL 条件。" />

    <div class="config-layout business-model-layout">
      <a-card class="profile-list-card" title="数据库模板列表" :loading="loadingList">
        <template #extra>
          <a-space>
            <a-button size="small" @click="loadProfiles()">刷新</a-button>
            <a-button size="small" type="primary" @click="openCreateProfile">新建</a-button>
          </a-space>
        </template>
        <div class="profile-file-list">
          <a-empty v-if="profiles.length === 0" description="暂无业务数据模型" />
          <div v-for="item in profiles" :key="item.name" class="profile-file-item"
            :class="{ active: item.name === activeProfileName }">
            <button type="button" class="profile-file-main" @click="loadProfile(item.name)">
              <strong>{{ item.modelName || item.name }}</strong>
            </button>
            <div class="profile-file-actions">
              <a-button size="mini" @click="previewProfile(item)">JSON</a-button>
              <a-button size="mini" status="danger" @click="confirmDeleteProfile(item)">删除</a-button>
            </div>
          </div>
        </div>
      </a-card>

      <a-card class="form-card business-model-wizard" :loading="loadingProfile">
        <template #extra>
          <a-space>
            <a-button size="small" @click="copyJson">复制 JSON</a-button>
            <a-button size="small" type="primary" :loading="saving" @click="saveCurrentProfile">保存模型</a-button>
          </a-space>
        </template>

        <a-steps :current="currentStep" class="model-wizard-steps" @change="(step) => currentStep = step">
          <a-step title="基本信息" description="说明模型用途" />
          <a-step title="设置组合条件" description="定义导出输入" />
          <a-step title="配置带出内容" description="设置表和附件" />
          <a-step title="完整测试模板" description="验证完整链路" />
        </a-steps>

        <section v-if="currentStep === 1" class="model-step-panel">
          <div class="step-title-row">
            <div>
              <p>说明这套模型代表什么业务数据，以及它适用于哪个数据库连接。</p>
            </div>
          </div>
          <a-form layout="vertical">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="模型名称" tip="面向业务人员的名称，例如：任务数据模型。" />
                  </template>
                  <a-input v-model="profile.name" placeholder="例如：任务数据模型" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <FieldLabel label="适用数据源" tip="从该数据源读取表和字段，并用于测试模型。" />
                  </template>
                  <a-select v-model="profile.dataSourceId" :loading="loadingDataSources" placeholder="请选择数据源"
                    @change="(value) => applyDataSource(findDataSource(value))">
                    <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                      {{ item.name }} / {{ item.type }}
                    </a-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
            <a-form-item>
              <template #label>
                <FieldLabel label="说明" tip="说明这套模型会被用于哪些导出、导入、同步或备份场景。" />
              </template>
              <a-textarea v-model="profile.description" :auto-size="{ minRows: 3, maxRows: 5 }"
                placeholder="用于导出、导入、同步某个任务及其相关数据" />
            </a-form-item>
            <a-form-item>
              <template #label>
                <FieldLabel label="配置文件" tip="系统保存模型的后端路径，仅用于定位。" />
              </template>
              <a-input :model-value="activeProfilePath" disabled />
            </a-form-item>
          </a-form>
        </section>

        <section v-else-if="currentStep === 2" class="model-step-panel">
          <div class="step-title-row">
            <div>
              <p>先定义导出、同步、备份时需要填写哪些业务条件。可以在一张条件表下配置多个字段，也可以配置多张条件表共同校验。</p>
            </div>
            <a-button type="primary" @click="addConditionTable">新增条件表</a-button>
          </div>
          <div class="condition-table-list">
            <article v-for="(group, groupIndex) in conditionTables" :key="groupIndex" class="relation-card">
              <div class="config-table-header">
                <strong>条件表 {{ groupIndex + 1 }}</strong>
                <a-space>
                  <a-button size="small" @click="addFieldCondition(group)">新增字段条件</a-button>
                  <a-button size="small" status="danger" @click="removeConditionTable(groupIndex)">删除条件表</a-button>
                </a-space>
              </div>
              <a-form layout="vertical">
                <a-form-item label="条件表">
                  <a-select v-model="group.table" allow-search :loading="loadingTables"
                    placeholder="例如 zy_task、zy_model、zy_stage" @change="(value) => handleConditionTableChange(group, value)">
                    <a-option v-for="table in sourceTables" :key="table" :value="table">{{ table }}</a-option>
                  </a-select>
                </a-form-item>
              </a-form>
              <a-table :data="group.conditions || []" :pagination="false" size="small" class="locator-param-table">
                <template #columns>
                  <a-table-column title="对应字段" :width="180">
                    <template #cell="{ record }">
                      <a-select v-model="record.field" allow-search allow-create placeholder="model_code">
                        <a-option v-for="column in columnsByTable[group.table] || []" :key="column" :value="column">{{ column }}</a-option>
                      </a-select>
                    </template>
                  </a-table-column>
                  <a-table-column title="显示名称" :width="170">
                    <template #cell="{ record }"><a-input v-model="record.label" placeholder="型号" /></template>
                  </a-table-column>
                  <a-table-column title="参数名" :width="170">
                    <template #cell="{ record }">
                      <a-input v-model="record.name" placeholder="modelCode" :status="paramNameDuplicated(record.name) ? 'danger' : undefined" />
                    </template>
                  </a-table-column>
                  <a-table-column title="操作" :width="90">
                    <template #cell="{ rowIndex }"><a-button size="mini" status="danger" @click="removeFieldCondition(group, rowIndex)">删除</a-button></template>
                  </a-table-column>
                </template>
              </a-table>
            </article>
          </div>
          <div class="relationship-example main">
            <span>测试查找</span>
            <strong>{{ locatorSummary }}</strong>
            <div class="model-test-bar">
              <a-input v-for="item in locatorParams" :key="item.name" v-model="locatorTestValues[item.name]"
                :placeholder="`请输入${item.label || item.name}`" />
              <a-button type="primary" :loading="locatorTesting" @click="runLocatorTest">测试查找</a-button>
            </div>
            <a-space v-if="locatorTestResult" direction="vertical" fill class="model-test-result locator-test-result">
              <a-alert :type="locatorTestResult.success ? 'success' : 'warning'" show-icon>
                测试查找共命中 {{ locatorTestResult.matchedRowCount || locatorTestResult.rowCount || 0 }} 条记录。
              </a-alert>
              <a-table :data="locatorTestResult.tableResults || []" :pagination="false" size="small">
                <template #expand-row="{ record }">
                  <a-space direction="vertical" fill>
                    <a-empty v-if="!(record.rows || []).length" description="当前条件表没有命中记录" />
                    <a-card v-for="(row, rowIndex) in record.rows || []" :key="rowIndex" size="small" :title="`命中记录 ${rowIndex + 1}`">
                      <a-descriptions :data="recordDescriptions(row)" layout="inline-horizontal" bordered />
                    </a-card>
                  </a-space>
                </template>
                <template #columns>
                  <a-table-column title="条件表" data-index="table" />
                  <a-table-column title="命中记录" data-index="recordCount" :width="110" />
                  <a-table-column title="状态" :width="110">
                    <template #cell="{ record }">{{ record.success ? '查找成功' : '未命中' }}</template>
                  </a-table-column>
                  <a-table-column title="查询条件" data-index="condition" />
                </template>
              </a-table>
            </a-space>
          </div>
        </section>

        <section v-else-if="currentStep === 3" class="model-step-panel">
          <div class="step-title-row">
            <div>
              <p>设置找到目标数据后要一起处理哪些普通数据表、附件数据表、日志表或公共字典表。</p>
            </div>
            <a-button type="primary" @click="openTablePicker">添加带出表</a-button>
          </div>
          <div class="locator-param-hints">
            <span>可用参数</span>
            <code v-for="name in availableParamNames" :key="name">{{ '${' + name + '}' }}</code>
          </div>
          <a-empty v-if="relatedScopes.length === 0" description="暂无带出表，可先添加普通表、附件表、日志表或公共字典表。" />
          <div v-else class="relation-card-list">
            <article v-for="row in pagedRelatedScopes" :key="row.tableName" class="relation-card">
              <header>
                <div>
                  <strong>{{ row.tableName }}</strong>
                  <span>{{ contentTypeOptions.find((item) => item.value === row.contentType)?.label || '普通数据表' }}</span>
                </div>
                <a-button size="mini" status="danger" @click="removeRelatedTable(row)">删除</a-button>
              </header>
              <a-form layout="vertical">
                <a-row :gutter="14">
                  <a-col :span="24">
                    <a-form-item label="内容类型">
                      <a-select v-model="row.contentType" @change="(value) => { row.fileTable = value === 'ATTACHMENT'; if (value === 'DICTIONARY') row.queryRules = [] }">
                        <a-option v-for="item in contentTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                      </a-select>
                    </a-form-item>
                  </a-col>
                </a-row>
              </a-form>
              <div v-if="row.contentType !== 'DICTIONARY'" class="config-table-header">
                <span>查询规则</span>
                <a-button size="small" @click="addQueryRule(row)">新增规则</a-button>
              </div>
              <div v-if="row.contentType !== 'DICTIONARY'" class="locator-output-list">
                <a-row v-for="(rule, index) in row.queryRules" :key="index" :gutter="12" class="locator-output-row">
                  <a-col :span="10">
                    <a-select v-model="rule.field" allow-search allow-create placeholder="当前表字段"
                      @popup-visible-change="(visible) => visible && loadTableColumns(row.tableName)">
                      <a-option v-for="column in columnsByTable[row.tableName] || []" :key="column" :value="column">{{ column }}</a-option>
                    </a-select>
                  </a-col>
                  <a-col :span="10">
                    <a-select v-model="rule.paramName" placeholder="第 2 步参数">
                      <a-option v-for="name in availableParamNames" :key="name" :value="name">{{ '${' + name + '}' }}</a-option>
                    </a-select>
                  </a-col>
                  <a-col :span="4">
                    <a-button status="danger" @click="removeQueryRule(row, index)">删除</a-button>
                  </a-col>
                </a-row>
              </div>
              <a-row v-if="row.contentType === 'ATTACHMENT'" :gutter="14">
                <a-col :span="8">
                  <a-form-item label="文件路径字段">
                    <a-select v-model="row.filePathValue" allow-search allow-create placeholder="例如 FILE_PATH">
                      <a-option v-for="column in columnsByTable[row.tableName] || []" :key="column" :value="column">{{ column }}</a-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="文件名字段">
                    <a-select v-model="row.fileNameColumn" allow-search allow-clear placeholder="例如 FILE_NAME">
                      <a-option v-for="column in columnsByTable[row.tableName] || []" :key="column" :value="column">{{ column }}</a-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="随数据包导出">
                    <a-switch v-model="row.exportAttachments" checked-text="是" unchecked-text="否" />
                  </a-form-item>
                </a-col>
              </a-row>
              <div class="generated-rule">
                <span>查询条件</span>
                <code>{{ row.advancedRule ? row.taskConditionTemplate : generatedCondition(row) }}</code>
              </div>
            </article>
            <a-pagination v-if="relatedScopes.length > relationPageSize" v-model:current="relationPage"
              :total="relatedScopes.length" :page-size="relationPageSize" :show-total="true" />
          </div>
          <a-collapse class="backup-collapse">
            <a-collapse-item key="backup" header="高级设置：备份表映射">
              <div class="config-table-header">
                <span>备份时会沿用带出表的自动查询规则，无需填写 SQL 条件。</span>
                <a-button size="small" @click="addBackupTable">添加备份映射</a-button>
              </div>
              <div v-for="(row, index) in profile.backupTables" :key="index" class="backup-map-row">
                <a-select v-model="row.sourceTable" placeholder="源表">
                  <a-option v-for="item in profile.autoTaskTables" :key="item.tableName" :value="item.tableName">{{
                    item.tableName }}</a-option>
                </a-select>
                <span>备份到</span>
                <a-select v-model="row.targetTable" allow-search allow-create placeholder="目标备份表">
                  <a-option v-for="table in sourceTables" :key="table" :value="table">{{ table }}</a-option>
                </a-select>
                <a-button size="mini" status="danger" @click="removeBackupTable(index)">删除</a-button>
              </div>
            </a-collapse-item>
          </a-collapse>
        </section>

        <section v-else class="model-step-panel">
          <div class="step-title-row">
            <div>
              <p>输入真实业务条件，预览模型会先执行定位，再查询哪些表、多少条记录和多少个附件。</p>
            </div>
          </div>
          <div class="model-test-bar">
            <a-input v-for="item in locatorParams" :key="item.name" v-model="locatorTestValues[item.name]"
              :placeholder="`请输入${item.label || item.name}`" @press-enter="testCurrentProfile" />
            <a-button type="primary" :loading="testing" @click="testCurrentProfile">开始测试</a-button>
          </div>
          <div v-if="testResult" class="model-test-result">
            <div class="model-test-summary">
              <article><span>涉及表</span><strong>{{ testResult.tableCount }}</strong></article>
              <article><span>记录总数</span><strong>{{ testResult.totalRecords }}</strong></article>
              <article><span>附件记录数</span><strong>{{ testResult.totalAttachments }}</strong></article>
              <article><span>实际找到附件</span><strong>{{ testResult.foundAttachments || 0 }}</strong></article>
              <article><span>缺失附件</span><strong>{{ testResult.missingAttachments || 0 }}</strong></article>
            </div>
            <a-table :columns="previewColumns" :data="testResult.tables || []" :pagination="false" size="small" />
          </div>
          <a-empty v-else description="输入业务标识后开始测试，测试过程只查询数据，不会修改数据库。" />
        </section>

        <footer class="model-wizard-footer">
          <a-button :disabled="currentStep === 1" @click="previousStep">上一步</a-button>
          <span>第 {{ currentStep }} / 4 步</span>
          <a-button v-if="currentStep < 4" type="primary" @click="nextStep">下一步</a-button>
          <a-button v-else type="primary" :loading="saving" @click="saveCurrentProfile">保存模型</a-button>
        </footer>
      </a-card>
    </div>

    <a-modal v-model:visible="createProfileVisible" title="新建业务数据模型" :footer="false" width="560px">
      <a-form :model="createProfileForm" layout="vertical">
        <a-form-item label="配置文件名">
          <a-input v-model="createProfileForm.fileName" placeholder="例如 task_data_model.json" />
        </a-form-item>
        <a-form-item label="模型名称">
          <a-input v-model="createProfileForm.name" />
        </a-form-item>
        <a-form-item label="适用数据源">
          <a-select v-model="createProfileForm.dataSourceId" placeholder="请选择数据源">
            <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">{{ item.name }} / {{ item.type
              }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model="createProfileForm.description" :auto-size="{ minRows: 3, maxRows: 5 }" />
        </a-form-item>
      </a-form>
      <div class="modal-action-row">
        <a-button @click="createProfileVisible = false">取消</a-button>
        <a-button type="primary" :loading="creatingProfile" @click="createProfile">创建并配置</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="tablePickerVisible" title="选择带出表" :footer="false" width="680px">
      <div class="model-table-picker-toolbar">
        <a-input-search v-model="tablePickerKeyword" allow-clear placeholder="搜索表名"
          @input="tablePickerPage = 1" />
        <span>已选择 {{ tablePickerSelectedTables.length }} 张表</span>
      </div>
      <a-empty v-if="filteredSourceTables.length === 0" description="没有匹配的数据表" />
      <a-checkbox-group v-else v-model="tablePickerSelectedTables" class="model-table-picker-grid">
        <a-checkbox v-for="table in pagedSourceTables" :key="table" :value="table"
          :disabled="tableAlreadyUsed(table)">
          {{ table }}
        </a-checkbox>
      </a-checkbox-group>
      <a-pagination v-if="filteredSourceTables.length > tablePickerPageSize" v-model:current="tablePickerPage"
        :total="filteredSourceTables.length" :page-size="tablePickerPageSize" :show-total="true" />
      <div class="modal-action-row model-picker-actions">
        <a-button @click="tablePickerVisible = false">取消</a-button>
        <a-button type="primary" @click="addSelectedTables">加入模型</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="previewVisible" :title="`${previewProfileName} JSON 预览`" :footer="false" width="880px">
      <pre class="profile-json-preview">{{ previewProfileJson }}</pre>
    </a-modal>
  </div>
</template>
