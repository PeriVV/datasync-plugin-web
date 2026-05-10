<script setup>
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { syncData } from '../api/datasync'
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
  copyFiles: true,
})

const timeline = computed(() => result.value?.phases || [])

async function submit() {
  loading.value = true
  try {
    const { data } = await syncData({ ...form })
    result.value = data
    Message.success('同步流程已执行')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-grid">
    <div>
      <PageHero
        title="在线同步"
        description="把中心库任务数据同步到节点库，并按表模型中的文件表配置复制附件。"
        hint="建议同步前先执行差异比对，确认目标库缺失、多余和内容变化的记录范围。"
      />

      <a-card class="form-card" title="同步参数">
        <a-form layout="vertical">
          <p class="form-intent">会把源库数据写入目标库，属于有副作用操作。执行前建议先做一次差异比对。</p>
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="同步模式" tip="增量同步只处理任务范围；全量同步范围更大，适合初始化或整体刷新场景。" />
                </template>
                <a-select v-model="form.mode">
                  <a-option value="incremental">增量同步</a-option>
                  <a-option value="full">全量同步</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="任务标识" tip="要同步的 taskId。增量同步时用它计算每张表的 WHERE 条件。" />
                </template>
                <a-input v-model="form.taskId" placeholder="例如：T-100" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item>
                <template #label>
                  <FieldLabel label="附件同步" tip="开启后会按表模型中的 fileTable 和 fileColumn 配置复制附件文件。" />
                </template>
                <a-switch v-model="form.copyFiles" checked-text="开" unchecked-text="关" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="中心库" tip="同步源环境。当前页面默认中心库作为数据来源。" />
                </template>
                <a-select v-model="form.sourceEnv">
                  <a-option value="center">中心库</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item>
                <template #label>
                  <FieldLabel label="节点库" tip="同步目标环境。同步会向这个环境写入数据库记录，并按需复制附件。" />
                </template>
                <a-select v-model="form.targetEnv">
                  <a-option value="node">节点库</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <div class="action-row">
            <a-button type="primary" status="danger" :loading="loading" @click="submit">开始同步</a-button>
          </div>
        </a-form>
      </a-card>

      <a-card class="table-card" title="执行阶段">
        <a-timeline mode="left">
          <a-timeline-item v-for="item in timeline" :key="item.phase" :label="item.phase">
            <a-tag :color="item.status === '已完成' ? 'green' : 'gray'">{{ item.status }}</a-tag>
            <span class="timeline-detail">{{ item.detail }}</span>
          </a-timeline-item>
        </a-timeline>
      </a-card>
    </div>

    <ResultPanel title="同步结果" :data="result" empty-text="同步完成后会展示写入行数、文件数与阶段状态。" />
  </div>
</template>
