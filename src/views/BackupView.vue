<script setup>
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { backupData } from '../api/datasync'
import PageHero from '../components/PageHero.vue'
import ResultPanel from '../components/ResultPanel.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loading = ref(false)
const result = ref(null)
const form = reactive({
  taskId: 'T-100',
  sourceEnv: 'center',
  backupProfile: 'zy_all_new',
})

const tableTags = computed(() => result.value?.writtenTables || [])

async function submit() {
  loading.value = true
  try {
    const { data } = await backupData({ ...form })
    result.value = data
    Message.success('备份任务已完成')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-grid">
    <div>
      <PageHero
        title="任务级备份"
        description="按任务标识把当前业务数据复制到备份表，不处理附件文件，只保留数据库留痕。"
      />

      <a-card class="form-card" title="备份参数">
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
                <a-select v-model="form.sourceEnv">
                  <a-option value="center">中心库</a-option>
                  <a-option value="node">节点库</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="表模型" tip="选择包含 backupTables 映射的表模型。没有配置备份映射时不会写入备份表。" />
                </template>
                <a-select v-model="form.backupProfile">
                  <a-option value="zy_all_new">业务表模型</a-option>
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
