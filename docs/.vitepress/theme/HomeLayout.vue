<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import LatestRelease from './LatestRelease.vue';

const { lang } = useData();
import dashboardDark from '../../screenshots/dashboard-dark.png';
import dashboardLight from '../../screenshots/dashboard-light.png';
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-actions-after><LatestRelease /></template>
    <template #home-hero-image>
      <div class="home-preview">
        <img
          class="home-preview-dark"
          :src="dashboardDark"
          :alt="
            lang === 'pt-BR'
              ? 'Dashboard do Homora em tema escuro'
              : 'Homora dashboard in dark mode'
          "
          fetchpriority="high"
        />
        <img
          class="home-preview-light"
          :src="dashboardLight"
          :alt="
            lang === 'pt-BR'
              ? 'Dashboard do Homora em tema claro'
              : 'Homora dashboard in light mode'
          "
          fetchpriority="high"
        />
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
