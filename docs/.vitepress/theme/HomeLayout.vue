<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import dashboardDark from '../../screenshots/dashboard-dark.png';
import dashboardLight from '../../screenshots/dashboard-light.png';
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <div class="home-preview">
        <img
          class="home-preview-dark"
          :src="dashboardDark"
          alt="Homora dashboard showing services and their monitoring status in dark mode"
          fetchpriority="high"
        />
        <img
          class="home-preview-light"
          :src="dashboardLight"
          alt="Homora dashboard showing services and their monitoring status in light mode"
          fetchpriority="high"
        />
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
