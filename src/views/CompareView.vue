<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { compareData } from '../api/datasync'
import { listDataSources } from '../api/datasource'
import { listTableProfiles } from '../api/config'
import PageHero from '../components/PageHero.vue'
import ResultPanel from '../components/ResultPanel.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loading = ref(false)
const booting = ref(false)
const result = ref(null)
const dataSources = ref([])
const profiles = ref([])
const form = reactive({
  mode: 'incremental',
  taskId: 'T-100',
  sourceId: '',
  targetId: '',
  profile: 'zy_all_new.json',
})

const columns = [
  { title: '表名', dataIndex: 'table' },
  { title: '源行数', dataIndex: 'sourceRows' },
  { title: '目标行数', dataIndex: 'targetRows' },
  { title: '是否一致', slotName: 'consistent' },
  { title: '变更键', slotName: 'changed' },
]

const tableData = computed(() => result.value?.tables || [])
const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
)
const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)

async function loadOptions() {
  booting.value = true
  try {
    const [sources, profileItems] = await Promise.all([listDataSources(), listTableProfiles()])
    dataSources.value = Array.isArray(sources) ? sources : []
    profiles.value = Array.isArray(profileItems) ? profileItems : []
    if (!form.sourceId && dataSources.value.length) {
      form.sourceId = String(dataSources.value[0].id)
    }
    if (!form.targetId && dataSources.value.length > 1) {
      form.targetId = String(dataSources.value[1].id)
    } else if (!form.targetId && dataSources.value.length) {
      form.targetId = String(dataSources.value[0].id)
    }
    if (profiles.value.some((item) => item.name === 'zy_all_new.json')) {
      form.profile = 'zy_all_new.json'
    } else if (profiles.value.length) {
      form.profile = profiles.value[0].name
    }
  } finally {
    booting.value = false
  }
}

async function submit() {
  if (!selectedSource.value || !selectedTarget.value) {
    Message.warning('请选择源库和目标库')
    return
  }
  loading.value = true
  try {
    const payload = {
      mode: form.mode,
      taskId: form.taskId,
      profile: form.profile,
      sourceId: selectedSource.value.id,
      sourceType: selectedSource.value.type,
      sourceName: selectedSource.value.name,
      targetId: selectedTarget.value.id,
      targetType: selectedTarget.value.type,
      targetName: selectedTarget.value.name,
    }
    const { data } = await compareData(payload)
    result.value = data
    Message.success('比对结果已刷新')
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
        title="一致性比对"
        description="比较中心库与目标库在任务范围内的差异，优先给出是否还能安全同步。"
      />

      <a-card class="form-card" title="比对参数" :loading="booting">
        <a-form layout="vertical">
          <p class="form-intent">只做差异检查，不写入数据。建议在同步前后各执行一次，确认任务范围内的表是否收敛。</p>
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="比对模式" tip="增量比对按任务范围检查；全量比对用于确认整张表或更大范围的数据一致性。" />
                </template>
                <a-select v-model="form.mode">
                  <a-option value="incremental">增量比对</a-option>
                  <a-option value="full">全量比对</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="任务标识" tip="要比对的 taskId。增量模式下会用它替换数据库模型中的 ${taskId}。" />
                </template>
                <a-input v-model="form.taskId" placeholder="例如：T-100" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="源库 / 目标库" tip="源库作为标准数据，目标库作为被检查对象。结果会展示仅源库存在、仅目标库存在和内容变化。" />
                </template>
                <a-input-group compact>
                  <a-select v-model="form.sourceId" style="width: 45%" placeholder="源库">
                    <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                      {{ item.name }} · {{ item.type }}
                    </a-option>
                  </a-select>
                  <a-input style="width: 10%; text-align: center" model-value="→" readonly />
                  <a-select v-model="form.targetId" style="width: 45%" placeholder="目标库">
                    <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                      {{ item.name }} · {{ item.type }}
                    </a-option>
                  </a-select>
                </a-input-group>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="数据库模型" tip="选择用于计算任务范围和参与比对表清单的 JSON 数据库模型。" />
                </template>
                <a-select v-model="form.profile" placeholder="请选择数据库模型">
                  <a-option v-for="item in profiles" :key="item.name" :value="item.name">
                    {{ item.name }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <div class="action-row">
            <a-button type="primary" status="warning" :loading="loading" @click="submit">执行比对</a-button>
          </div>
        </a-form>
      </a-card>

      <a-card class="table-card" title="差异明细">
        <a-table :columns="columns" :data="tableData" :pagination="false" row-key="table">
          <template #consistent="{ record }">
            <a-tag :color="record.consistent ? 'green' : 'red'">{{ record.consistent ? '一致' : '有差异' }}</a-tag>
          </template>
          <template #changed="{ record }">
            {{ record.changed?.length ? record.changed.join(', ') : '-' }}
          </template>
        </a-table>
      </a-card>
    </div>

    <ResultPanel title="比对摘要" :data="result" empty-text="比对后会生成总体摘要和按表差异。" />
  </div>
</template>
