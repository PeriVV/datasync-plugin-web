<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { IconDelete, IconEdit, IconPlus, IconRefresh, IconStorage } from '@arco-design/web-vue/es/icon'
import {
  connectDataSource,
  deleteDataSource,
  fetchDataSourceInfo,
  fetchDataSourceStatus,
  listDataSources,
  listTables,
  previewTableRows,
  testDataSource,
} from '../api/datasource'
import PageHero from '../components/PageHero.vue'
import FieldLabel from '../components/FieldLabel.vue'

const supportedTypes = [
  { type: 'MYSQL', name: 'MySQL', port: 3306, user: '' },
  { type: 'DM8', name: 'DM8', port: 5236, user: 'SYSDBA' },
]

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const tablesLoading = ref(false)
const rowsLoading = ref(false)
const modalVisible = ref(false)
const connections = ref([])
const activeId = ref(null)
const tables = ref([])
const activeTable = ref('')
const tableKeyword = ref('')
const rowsResult = ref(null)

const form = reactive({
  id: null,
  type: 'MYSQL',
  name: '',
  host: '127.0.0.1',
  port: 3306,
  database: '',
  url: '',
  username: '',
  password: '',
  driverClassName: '',
})

const currentConnection = computed(() => connections.value.find((item) => item.id === activeId.value) || null)

const filteredTables = computed(() => {
  const keyword = tableKeyword.value.trim().toLowerCase()
  if (!keyword) return tables.value
  return tables.value.filter((item) => tableName(item).toLowerCase().includes(keyword))
})

const previewColumns = computed(() => {
  const columns = rowsResult.value?.columns || []
  return columns.map((column) => ({
    title: column,
    dataIndex: column,
    ellipsis: true,
    tooltip: true,
    width: 160,
  }))
})

const previewRows = computed(() =>
  (rowsResult.value?.rows || []).map((row, index) => ({ __row_key: index, ...row })),
)

watch(
  () => form.type,
  (type) => {
    const preset = supportedTypes.find((item) => item.type === type)
    if (!preset) return
    form.port = preset.port
    form.username = preset.user
  },
)

function tableName(item) {
  return item?.tableName || Object.values(item || {})[0] || ''
}

function displayType(type) {
  return supportedTypes.find((item) => item.type === type)?.name || type
}

function statusColor(item) {
  if (item.enabled === false) return 'gray'
  if (item.ok === false) return 'orangered'
  if (item.ok === true) return 'green'
  return 'arcoblue'
}

function statusText(item) {
  if (item.enabled === false) return '已禁用'
  if (item.ok === false) return '异常'
  if (item.ok === true) return '正常'
  return '未检测'
}

function resetForm(type = 'MYSQL') {
  const preset = supportedTypes.find((item) => item.type === type) || supportedTypes[0]
  form.id = null
  form.type = preset.type
  form.name = ''
  form.host = '127.0.0.1'
  form.port = preset.port
  form.database = ''
  form.url = ''
  form.username = preset.user
  form.password = ''
  form.driverClassName = ''
}

function parseJdbcUrl(url = '') {
  const match = String(url).match(/^jdbc:[a-z0-9]+:\/\/(\[[^\]]+\]|[^/?#:]+)(?::(\d+))?(?:\/([^?]*))?(?:\?(.*))?/i)
  if (!match) return
  form.host = (match[1] || '').replace(/^\[|\]$/g, '')
  if (match[2]) form.port = Number(match[2])
  if (form.type === 'DM8') {
    const schema = new URLSearchParams(match[4] || '').get('SCHEMA')
    form.database = schema || ''
  } else {
    form.database = match[3] || ''
  }
}

function buildJdbcUrl() {
  const host = form.host.trim()
  const database = form.database.trim()
  if (!host) {
    Message.warning('请输入主机名')
    return
  }
  if (form.type === 'DM8') {
    const schema = database || 'SYSDBA'
    form.url = `jdbc:dm://${host}:${form.port}?SCHEMA=${schema}&LOGINMODE=4`
    return
  }
  if (!database) {
    Message.warning('请输入数据库名')
    return
  }
  form.url = `jdbc:mysql://${host}:${form.port}/${database}?useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`
}

function buildPayload() {
  const payload = {
    id: form.id || undefined,
    name: form.name.trim(),
    url: form.url.trim(),
    username: form.username.trim(),
    password: form.password,
    driverClassName: form.driverClassName.trim() || undefined,
  }
  if (!payload.name) {
    Message.warning('请输入连接名称')
    return null
  }
  if (!payload.url) {
    Message.warning('请输入或生成连接URL')
    return null
  }
  if (!payload.username) {
    Message.warning('请输入用户名')
    return null
  }
  return payload
}

function openCreateModal() {
  resetForm(currentConnection.value?.type || 'MYSQL')
  modalVisible.value = true
}

async function openEditModal() {
  const item = currentConnection.value
  if (!item) return
  let detail = item
  try {
    detail = await fetchDataSourceInfo(item)
  } catch (error) {
    Message.warning(error?.message || '加载连接详情失败')
  }
  resetForm(item.type)
  form.id = detail.id
  form.type = detail.type
  form.name = detail.name || ''
  form.url = detail.url || ''
  form.username = detail.username || ''
  form.password = detail.password || ''
  form.driverClassName = detail.driverClassName || ''
  parseJdbcUrl(form.url)
  modalVisible.value = true
}

async function refreshConnections(preferredId = activeId.value) {
  loading.value = true
  try {
    connections.value = await listDataSources()
    const exists = connections.value.some((item) => item.id === preferredId)
    activeId.value = exists ? preferredId : connections.value[0]?.id || null
    if (currentConnection.value) {
      await refreshTables()
    }
  } catch (error) {
    Message.error(error?.message || '加载连接列表失败')
  } finally {
    loading.value = false
  }
}

async function refreshStatus() {
  const item = currentConnection.value
  if (!item) return
  try {
    const status = await fetchDataSourceStatus(item)
    Object.assign(item, status)
    Message.success(status?.message || '状态已刷新')
  } catch (error) {
    Message.error(error?.message || '刷新状态失败')
  }
}

async function testCurrentForm() {
  const payload = buildPayload()
  if (!payload) return
  testing.value = true
  try {
    const res = await testDataSource(form.type, payload)
    if (res?.success === false) {
      Message.error(res?.message || '连接失败')
      return
    }
    Message.success(res?.message || '连接成功')
  } catch (error) {
    Message.error(error?.message || '连接失败')
  } finally {
    testing.value = false
  }
}

async function saveConnection() {
  const payload = buildPayload()
  if (!payload) return
  saving.value = true
  try {
    const res = await connectDataSource(form.type, payload)
    if (res?.success === false) {
      Message.error(res?.message || '连接失败')
      return
    }
    Message.success(res?.message || '连接成功')
    modalVisible.value = false
    await refreshConnections(res.id)
  } catch (error) {
    Message.error(error?.message || '连接失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete() {
  const item = currentConnection.value
  if (!item) return
  Modal.confirm({
    title: '删除连接',
    content: `确认删除连接「${item.name}」？`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      const res = await deleteDataSource(item)
      if (res?.success === false) {
        Message.error(res?.message || '删除失败')
        return
      }
      Message.success('已删除')
      await refreshConnections(null)
    },
  })
}

async function refreshTables() {
  const item = currentConnection.value
  if (!item) return
  tablesLoading.value = true
  rowsResult.value = null
  try {
    const result = await listTables(item)
    if (Array.isArray(result) && result[0]?.error) {
      Message.error(result[0].error)
      tables.value = []
      activeTable.value = ''
      return
    }
    tables.value = Array.isArray(result) ? result : []
    activeTable.value = tableName(tables.value[0]) || ''
    if (activeTable.value) {
      await loadRows()
    }
  } catch (error) {
    Message.error(error?.message || '加载数据表失败')
  } finally {
    tablesLoading.value = false
  }
}

async function selectTable(name) {
  activeTable.value = name
  await loadRows()
}

async function loadRows() {
  const item = currentConnection.value
  if (!item || !activeTable.value) return
  rowsLoading.value = true
  try {
    const result = await previewTableRows(item, activeTable.value, 1, 20)
    if (result?.success === false) {
      Message.error(result.message || '读取表数据失败')
      return
    }
    rowsResult.value = result
  } catch (error) {
    Message.error(error?.message || '读取表数据失败')
  } finally {
    rowsLoading.value = false
  }
}

onMounted(() => {
  refreshConnections()
})
</script>

<template>
  <div class="environment-page">
    <PageHero
      title="数据源配置"
      description="维护中心库、节点库、导入目标库等数据库连接，测试连通性，并查看目标库中的表和样例数据。"
      hint="这些连接信息会用于后续导出、导入、比对、同步和备份流程。"
    />

    <section class="environment-layout">
      <a-card class="environment-card" title="数据源连接">
        <template #extra>
          <a-space size="small">
            <a-button size="small" @click="refreshConnections()" :loading="loading">
              <template #icon><icon-refresh /></template>
              刷新
            </a-button>
            <a-button size="small" type="primary" @click="openCreateModal">
              <template #icon><icon-plus /></template>
              新增
            </a-button>
          </a-space>
        </template>

        <div class="connection-list">
          <a-empty v-if="connections.length === 0" description="暂无连接" />
          <button
            v-for="item in connections"
            :key="item.id"
            class="connection-item"
            :class="{ active: item.id === activeId }"
            type="button"
            @click="activeId = item.id; refreshTables()"
          >
            <span>
              <strong>{{ item.name }}</strong>
              <small>{{ displayType(item.type) }} · {{ item.url }}</small>
            </span>
            <a-tag size="small" :color="statusColor(item)">{{ statusText(item) }}</a-tag>
          </button>
        </div>
      </a-card>

      <div class="environment-main">
        <a-card class="environment-card" title="连接详情">
          <template #extra>
            <a-space size="small">
              <a-button size="small" :disabled="!currentConnection" @click="refreshStatus">测试连通</a-button>
              <a-button size="small" :disabled="!currentConnection" @click="openEditModal">
                <template #icon><icon-edit /></template>
                编辑
              </a-button>
              <a-button size="small" status="danger" :disabled="!currentConnection" @click="confirmDelete">
                <template #icon><icon-delete /></template>
                删除
              </a-button>
            </a-space>
          </template>

          <a-descriptions v-if="currentConnection" :column="2" bordered size="small">
            <a-descriptions-item label="名称">{{ currentConnection.name }}</a-descriptions-item>
            <a-descriptions-item label="类型">{{ displayType(currentConnection.type) }}</a-descriptions-item>
            <a-descriptions-item label="URL" :span="2">{{ currentConnection.url }}</a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="statusColor(currentConnection)">{{ statusText(currentConnection) }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="说明">{{ currentConnection.message || '-' }}</a-descriptions-item>
          </a-descriptions>
          <a-empty v-else description="请选择或新增一个连接" />
        </a-card>

        <a-card class="environment-card table-browser" title="数据表预览">
          <template #extra>
            <a-space size="small">
              <a-input-search v-model="tableKeyword" size="small" allow-clear placeholder="搜索表名" />
              <a-button size="small" :disabled="!currentConnection" :loading="tablesLoading" @click="refreshTables">
                <template #icon><icon-refresh /></template>
                刷新表
              </a-button>
            </a-space>
          </template>

          <div class="table-browser-grid">
            <div class="table-list">
              <a-empty v-if="filteredTables.length === 0" description="暂无数据表" />
              <button
                v-for="item in filteredTables"
                :key="tableName(item)"
                class="table-list-item"
                :class="{ active: tableName(item) === activeTable }"
                type="button"
                @click="selectTable(tableName(item))"
              >
                <icon-storage />
                <span>{{ tableName(item) }}</span>
              </button>
            </div>
            <div class="table-preview">
              <a-table
                :columns="previewColumns"
                :data="previewRows"
                :loading="rowsLoading"
                :pagination="false"
                :scroll="{ x: 900, y: 360 }"
                row-key="__row_key"
              />
            </div>
          </div>
        </a-card>
      </div>
    </section>

    <a-modal
      v-model:visible="modalVisible"
      title="数据源连接"
      ok-text="保存并连接"
      :confirm-loading="saving"
      width="720px"
      @ok="saveConnection"
    >
      <a-form :model="form" layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="名称" tip="给这条连接起一个业务可识别的名字，例如中心库、节点库或导入目标库。" />
              </template>
              <a-input v-model="form.name" placeholder="例如：中心库 / 节点库 / 导入目标库" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="数据库类型" tip="选择数据库方言。插件会根据类型生成默认端口、驱动和连接 URL。" />
              </template>
              <a-select v-model="form.type">
                <a-option v-for="item in supportedTypes" :key="item.type" :value="item.type">
                  {{ item.name }}
                </a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="主机名" tip="数据库服务地址，可以是 IP、域名或本机 127.0.0.1。" />
              </template>
              <a-input v-model="form.host" placeholder="127.0.0.1" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="端口" tip="数据库监听端口。MySQL 默认 3306，DM8 默认 5236。" />
              </template>
              <a-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="数据库名 / Schema" tip="MySQL 填数据库名；DM8 填 Schema，生成 URL 时会写入对应参数。" />
              </template>
              <a-input v-model="form.database" placeholder="MySQL 数据库名或 DM8 Schema" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required>
              <template #label>
                <FieldLabel label="用户名" tip="数据库登录账号。需要有读取、写入、建表或查询元数据等对应权限。" />
              </template>
              <a-input v-model="form.username" placeholder="请输入用户名" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item>
              <template #label>
                <FieldLabel label="密码" tip="数据库登录密码，会提交到当前后端服务用于建立连接。" />
              </template>
              <a-input-password v-model="form.password" placeholder="请输入密码" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item>
              <template #label>
                <FieldLabel label="驱动类" tip="通常可以留空，由后端根据数据库类型自动选择。只有特殊驱动时才需要填写。" />
              </template>
              <a-input v-model="form.driverClassName" placeholder="默认自动选择" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item required>
              <template #label>
                <FieldLabel label="连接URL" tip="JDBC 连接串。可以手动填写，也可以由主机、端口和数据库名生成。" />
              </template>
              <a-input v-model="form.url" placeholder="可手动输入，也可以由主机/端口/数据库名生成">
                <template #append>
                  <a-button @click="buildJdbcUrl">生成URL</a-button>
                </template>
              </a-input>
            </a-form-item>
          </a-col>
        </a-row>
        <a-space>
          <a-button @click="testCurrentForm" :loading="testing">测试连接</a-button>
          <a-button type="outline" @click="resetForm(form.type)">重置</a-button>
        </a-space>
      </a-form>
    </a-modal>
  </div>
</template>
