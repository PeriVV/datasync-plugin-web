<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  tip: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <span class="field-label">
    <span>{{ label }}</span>
    <a-tooltip :content="tip">
      <span class="field-help" aria-label="字段说明">?</span>
    </a-tooltip>
  </span>
</template>
