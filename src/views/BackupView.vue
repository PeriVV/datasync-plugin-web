<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { backupData } from '../api/datasync'
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
  taskId: 'T-100',
  sourceId: '',
  profile: 'zy_all_new.json',
})

const tableTags = computed(() => result.value?.writtenTables || [])
const selectedSource = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.sourceId)) || null,
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
  if (!selectedSource.value) {
    Message.warning('请选择源数据库')
    return
  }
  loading.value = true
  try {
    const payload = {
      taskId: form.taskId,
      profile: form.profile,
      sourceId: selectedSource.value.id,
      sourceType: selectedSource.value.type,
      sourceName: selectedSource.value.name,
    }
    const { data } = await backupData(payload)
    result.value = data
    Message.success('备份任务已完成')
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
        title="任务级备份"
        description="按任务标识把当前业务数据复制到备份表，不处理附件文件，只保留数据库留痕。"
      />

      <a-card class="form-card" title="备份参数" :loading="booting">
        <a-form layout="vertical">
          <p class="form-intent">把任务范围内的数据复制到配置好的备份表。它只处理数据库记录，不复制附件文件。</p>
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="任务标识" tip="要备份的 taskId。备份表映射会用它筛选源业务表数据。" />
                </template>
                <a-input v-model="form.taskId" placeholder="例如：T-100" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="源环境" tip="选择从哪个数据库读取当前业务数据并写入备份表。" />
                </template>
                <a-select v-model="form.sourceId" placeholder="请选择源数据库">
                  <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                    {{ item.name }} · {{ item.type }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="数据库模型" tip="选择包含 backupTables 映射的数据库模型。没有配置备份映射时不会写入备份表。" />
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
            <a-button type="primary" :loading="loading" @click="submit">执行备份</a-button>
          </div>
        </a-form>
      </a-card>

      <a-card class="table-card" title="写入备份表">
        <a-space wrap>
          <a-tag v-for="tag in tableTags" :key="tag" color="cyan">{{ tag }}</a-tag>
          <span v-if="!tableTags.length" class="muted-text">执行后会列出本轮写入的备份表。</span>
        </a-space>
      </a-card>
    </div>

    <ResultPanel title="备份结果" :data="result" empty-text="备份成功后会展示备份批次标识和复制行数。" />
  </div>
</template>
