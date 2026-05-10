<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHero from '../components/PageHero.vue'

const route = useRoute()
const router = useRouter()

const page = computed(() => route.meta.info || {})
</script>

<template>
  <div class="info-page">
    <PageHero
      :title="page.title"
      :description="page.description"
      :hint="page.hint"
    />

    <section class="info-block">
      <div class="info-block-header">
        <h2>{{ page.cardTitle }}</h2>
        <a-button v-if="page.actionRoute" type="primary" @click="router.push(page.actionRoute)">
          {{ page.actionText }}
        </a-button>
      </div>
      <div class="info-list">
        <div v-for="item in page.items" :key="item.title" class="info-item">
          <strong>{{ item.title }}</strong>
          <span>{{ item.text }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
