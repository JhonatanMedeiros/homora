<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

const { lang } = useData();
const isPortuguese = computed(() => lang.value === 'pt-BR');
const tag = ref<string | null>(null);
const releasesUrl = 'https://github.com/JhonatanMedeiros/homora/releases';
const releaseUrl = computed(() =>
  tag.value ? `${releasesUrl}/tag/${encodeURIComponent(tag.value)}` : releasesUrl,
);

onMounted(async () => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/JhonatanMedeiros/homora/releases/latest',
      {
        signal: AbortSignal.timeout(8000),
        credentials: 'omit',
      },
    );
    if (!response.ok) return;
    const release: unknown = await response.json();
    if (typeof release !== 'object' || release === null || !('tag_name' in release)) return;
    const value = release.tag_name;
    if (typeof value === 'string' && /^v?\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(value))
      tag.value = value;
  } catch {
    // A missing release or network failure leaves the GitHub releases link available.
  }
});
</script>

<template>
  <p class="latest-release">
    <a :href="releaseUrl" target="_blank" rel="noopener noreferrer">
      <template v-if="tag"
        >{{ isPortuguese ? 'Última versão estável:' : 'Latest stable release:' }}
        {{ tag }}</template
      >
      <template v-else>{{
        isPortuguese ? 'Ver versões no GitHub' : 'View releases on GitHub'
      }}</template>
      <span aria-hidden="true">↗</span>
    </a>
  </p>
</template>
