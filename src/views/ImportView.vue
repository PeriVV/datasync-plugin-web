<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { importData } from '../api/datasync'
import { listDataSources } from '../api/datasource'
import PageHero from '../components/PageHero.vue'
import PathPicker from '../components/PathPicker.vue'
import ResultPanel from '../components/ResultPanel.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loading = ref(false)
const booting = ref(false)
const result = ref(null)
const dataSources = ref([])
const form = reactive({
  inputPath: '',
  targetId: '',
  targetFileRoot: '',
  failOnSqlError: true,
})

const selectedTarget = computed(() =>
  dataSources.value.find((item) => String(item.id) === String(form.targetId)) || null,
)

async function loadOptions() {
  booting.value = true
  try {
    const sources = await listDataSources()
    dataSources.value = Array.isArray(sources) ? sources : []
    if (!form.targetId && dataSources.value.length) {
      form.targetId = String(dataSources.value[0].id)
    }
  } finally {
    booting.value = false
  }
}

async function submit() {
  if (!form.inputPath.trim()) {
    Message.warning('请选择离线包路径')
    return
  }
  if (!selectedTarget.value) {
    Message.warning('请选择目标数据库')
    return
  }
  loading.value = true
  try {
    const payload = {
      inputPath: form.inputPath,
      targetId: selectedTarget.value.id,
      targetType: selectedTarget.value.type,
      targetName: selectedTarget.value.name,
      targetFileRoot: form.targetFileRoot,
      failOnSqlError: form.failOnSqlError,
    }
    const { data } = await importData(payload)
    result.value = data
    Message.success('导入任务已执行')
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
        title="离线导入"
        description="回放离线包内的数据脚本与附件文件，适合目标数据库恢复和落库验证。"
        hint="严格模式开启后，遇到单条数据脚本执行失败会立即终止导入。"
      />

      <a-card class="form-card" title="导入参数" :loading="booting">
        <a-form layout="vertical">
          <p class="form-intent">把导出的 zip 离线包恢复到目标数据库。导入会执行包内 SQL，并把附件复制到目标文件根目录。</p>
          <a-form-item>
            <template #label>
              <FieldLabel label="离线包路径" tip="选择 exportData 生成的 zip 文件，包内应包含 sql/data.sql、files、manifest.json 和日志。" />
            </template>
            <PathPicker
              v-model="form.inputPath"
              mode="open-file"
              accept=".zip"
              placeholder="从电脑选择离线包文件"
              button-text="选择文件"
            />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="目标数据库" tip="选择已经在数据源连接中连接成功的数据库，导入会把离线包 SQL 写入这个库。" />
                </template>
                <a-select v-model="form.targetId" placeholder="请选择目标数据库">
                  <a-option v-for="item in dataSources" :key="item.id" :value="String(item.id)">
                    {{ item.name }} · {{ item.type }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="目标文件根目录" tip="附件文件写入的根目录。导入时会保留离线包 files 目录下的相对路径。" />
                </template>
                <PathPicker
                  v-model="form.targetFileRoot"
                  mode="directory"
                  placeholder="从电脑选择目标文件根目录"
                  button-text="选择目录"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item>
            <a-checkbox v-model="form.failOnSqlError">严格模式：遇到单条数据脚本失败立即终止</a-checkbox>
          </a-form-item>
          <div class="action-row">
            <a-button type="primary" status="success" :loading="loading" @click="submit">执行导入</a-button>
          </div>
        </a-form>
      </a-card>
    </div>

    <ResultPanel title="导入结果" :data="result" empty-text="导入完成后会展示新增、更新、跳过和失败数量。" />
  </div>
</template>
