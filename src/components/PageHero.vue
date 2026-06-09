<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  hint: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <section class="page-hero">
    <div>
      <h2>
        {{ title }}
        <a-tooltip v-if="hint" :content="hint">
          <span class="page-hero-help">?</span>
        </a-tooltip>
      </h2>
      <p>{{ description }}</p>
    </div>
  </section>
</template>
