<script setup lang="ts">
import ParticleBackground from '@/components/ParticleBackground.vue';
import Sidebar from '@/components/Sidebar.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <ParticleBackground class="bg"/>
  <div class="app-shell">
    <Sidebar />
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>
<style scoped>
:global(:root) {
  --sg-page-bg: #151329;
  --sg-surface: #1b1830;
  --sg-surface-raised: #211c35;
  --sg-surface-hover: #44375f;
  --sg-border: #44375f;
  --sg-accent: #6f53b5;
  --sg-accent-soft: #a58fe3;
  --sg-accent-light: #cbbaf5;
  --sg-text: #ffffff;
  --sg-text-soft: #d8caf8;
  --sg-text-muted: #a58fe3;
  --sg-shadow-soft: rgb(8 6 22 / 24%);
  --sg-shadow-strong: rgb(8 6 22 / 48%);
}

:global(body) {
  margin: 0;
  font-family: 'Inter', sans-serif;
  color: var(--sg-text);
}

.bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  background-color: var(--sg-page-bg);
}

.app-shell {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

@media (min-width: 768px) {
  .app-shell {
    flex-direction: row;
  }
}
</style>