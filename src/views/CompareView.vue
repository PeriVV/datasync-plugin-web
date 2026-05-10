<script setup>
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { compareData } from '../api/datasync'
import PageHero from '../components/PageHero.vue'
import ResultPanel from '../components/ResultPanel.vue'
import FieldLabel from '../components/FieldLabel.vue'

const loading = ref(false)
const result = ref(null)
const form = reactive({
  mode: 'incremental',
  taskId: 'T-100',
  sourceEnv: 'center',
  targetEnv: 'node',
})

const columns = [
  { title: '表名', dataIndex: 'table' },
  { title: '源行数', dataIndex: 'sourceRows' },
  { title: '目标行数', dataIndex: 'targetRows' },
  { title: '是否一致', slotName: 'consistent' },
  { title: '变更键', slotName: 'changed' },
]

const tableData = computed(() => result.value?.tables || [])

async function submit() {
  loading.value = true
  try {
    const { data } = await compareData({ ...form })
    result.value = data
    Message.success('比对结果已刷新')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-grid">
    <div>
      <PageHero
        title="一致性比对"
        description="比较中心库与目标库在任务范围内的差异，优先给出是否还能安全同步。"
      />

      <a-card class="form-card" title="比对参数">
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
                  <FieldLabel label="任务标识" tip="要比对的 taskId。增量模式下会用它替换表模型中的 ${taskId}。" />
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
                  <a-select v-model="form.sourceEnv" style="width: 45%">
                    <a-option value="center">中心库</a-option>
                    <a-option value="node">节点库</a-option>
                  </a-select>
                  <a-input style="width: 10%; text-align: center" model-value="→" readonly />
                  <a-select v-model="form.targetEnv" style="width: 45%">
                    <a-option value="node">节点库</a-option>
                    <a-option value="imported">导入目标库</a-option>
                  </a-select>
                </a-input-group>
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
