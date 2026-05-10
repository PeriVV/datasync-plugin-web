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
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <a-alert v-if="hint" class="page-hero-hint" type="info" :show-icon="true">
      {{ hint }}
    </a-alert>
  </section>
</template>
