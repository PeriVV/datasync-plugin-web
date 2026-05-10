<script setup>
import { reactive, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { navigationSections } from '../config/navigation'

const route = useRoute()
const router = useRouter()
const expandedSections = reactive(
  Object.fromEntries(navigationSections.map((section) => [section.key, section.expanded !== false])),
)

function isActive(item) {
  return route.name === item.key
}

function toggleSection(section) {
  expandedSections[section.key] = !expandedSections[section.key]
}

function go(item) {
  if (route.path !== item.route) {
    router.push(item.route)
  }
}

watchEffect(() => {
  for (const section of navigationSections) {
    if (section.items.some((item) => item.key === route.name)) {
      expandedSections[section.key] = true
    }
  }
})
</script>

<template>
  <a-layout class="console-shell">
    <aside class="console-sider">
      <div class="console-brand">
        <div class="console-brand-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1.2" />
            <rect x="14" y="4" width="6" height="6" rx="1.2" />
            <rect x="4" y="14" width="6" height="6" rx="1.2" />
            <rect x="14" y="14" width="6" height="6" rx="1.2" />
          </svg>
        </div>
        <div>
          <strong>数据同步平台</strong>
        </div>
      </div>

      <div class="console-nav">
        <section
          v-for="section in navigationSections"
          :key="section.key"
          class="console-nav-section"
        >
          <div v-if="section.title" class="console-nav-group">
            <button class="console-nav-group-title" type="button" @click="toggleSection(section)">
              <component :is="section.icon" />
              <span>{{ section.title }}</span>
              <span class="console-nav-caret" :class="{ expanded: expandedSections[section.key] }" />
            </button>
          </div>

          <div v-show="!section.title || expandedSections[section.key]">
            <button
              v-for="item in section.items"
              :key="item.key"
              class="console-nav-item"
              :class="{ active: isActive(item), nested: Boolean(section.title) }"
              type="button"
              @click="go(item)"
            >
              <component :is="item.icon" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </aside>

    <a-layout class="console-main">
      <a-layout-content class="console-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>
