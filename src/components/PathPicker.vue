<script setup>
import { computed, ref } from 'vue'
import { IconFolder } from '@arco-design/web-vue/es/icon'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  mode: {
    type: String,
    default: 'open-file',
    validator: (value) => ['open-file', 'save-file', 'directory'].includes(value),
  },
  accept: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '请选择路径',
  },
  buttonText: {
    type: String,
    default: '选择',
  },
  suggestedName: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'change'])
const nativeInput = ref(null)

const displayValue = computed(() => props.modelValue || '')

function updateValue(value, files = []) {
  emit('update:modelValue', value)
  emit('change', { value, files })
}

function getDirectoryName(file) {
  const relativePath = file.webkitRelativePath || ''
  return relativePath.split('/')[0] || file.path || file.name
}

function onNativeChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) {
    return
  }

  const selectedPath =
    props.mode === 'directory' ? getDirectoryName(files[0]) : files[0].path || files[0].name

  updateValue(selectedPath, files)
  event.target.value = ''
}

async function choosePath() {
  if (props.disabled) {
    return
  }
  if (props.mode === 'directory' && 'showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker()
      updateValue(handle.name)
      return
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
    }
  }

  if (props.mode === 'save-file' && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: props.suggestedName || 'datasync-export.zip',
      })
      updateValue(handle.name)
      return
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
    }
  }

  nativeInput.value?.click()
}
</script>

<template>
  <div class="path-picker">
    <a-input
      class="path-picker-input"
      :model-value="displayValue"
      :placeholder="placeholder"
      :disabled="disabled"
      readonly
      @click="choosePath"
    />
    <a-button type="outline" :disabled="disabled" @click="choosePath">
      <template #icon>
        <icon-folder />
      </template>
      {{ buttonText }}
    </a-button>
    <input
      v-if="mode === 'directory'"
      ref="nativeInput"
      class="path-picker-native"
      type="file"
      webkitdirectory
      directory
      @change="onNativeChange"
    />
    <input
      v-else
      ref="nativeInput"
      class="path-picker-native"
      type="file"
      :accept="accept"
      @change="onNativeChange"
    />
  </div>
</template>
