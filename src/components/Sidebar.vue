<script setup lang="ts">
import { GamepadDirectional } from '@lucide/vue';
import { House } from '@lucide/vue';
import { Globe } from '@lucide/vue';
import { Bot } from '@lucide/vue';
import { MessageSquare } from '@lucide/vue';
import { Settings } from '@lucide/vue';
import { Cloud } from '@lucide/vue';
import { EighthNote } from '@lucide/vue';
import { Play } from '@lucide/vue';
import { MonitorCloud } from '@lucide/vue';
import { RouterLink } from 'vue-router';

</script>

<template>
  <nav id="sg-rail" aria-label="Apps">
    <div class="sg-rail-group">
      <img class="sg-rail-logo" src="/assets/images/logo.png" alt="Singularity" draggable="false"/>

      <RouterLink to="/" class="sg-rail-btn" exact-active-class="active" aria-label="Home">
        <House />
      </RouterLink>

      <RouterLink to="/games" exact-active-class="active" class="sg-rail-btn" aria-label="Games">
        <GamepadDirectional />
      </RouterLink>

      <button type="button" class="sg-rail-btn" aria-label="Browser">
        <Globe />
      </button>
      <button type="button" class="sg-rail-btn" aria-label="Watch">
         <Play />
      </button>

      <button type="button" class="sg-rail-btn" aria-label="Music">
         <EighthNote />
      </button>
      <RouterLink to="/chat" class="sg-rail-btn" exact-active-class="active" aria-label="Chat">
         <MessageSquare />
      </RouterLink>

      <RouterLink to="/ai" class="sg-rail-btn" exact-active-class="active" aria-label="AI">
        <Bot />
      </RouterLink>
    </div>

    <div class="sg-rail-bottom">
      <button type="button" class="sg-rail-btn" aria-label="VMs">
        <MonitorCloud />
      </button>
      <button type="button" class="sg-rail-btn" aria-label="Cloud">
        <Cloud />
      </button>

      <button type="button" class="sg-rail-btn" aria-label="Settings">
        <Settings class="svg" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
#sg-rail {
  --rail-bg: var(--sg-surface);
  --rail-border: var(--sg-border);
  --rail-hover-bg: var(--sg-surface-hover);
  --rail-active-bg: var(--sg-surface-hover);
  --rail-icon: var(--sg-accent-soft);
  --rail-icon-hover: var(--sg-text-soft);
  --rail-icon-open: var(--sg-accent-light);
  --rail-tooltip-bg: var(--rail-bg);
  --rail-tooltip-border: var(--rail-border);
  --rail-tooltip-color: var(--rail-icon-hover);

  z-index: 5;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  scrollbar-width: none;
  background: var(--rail-bg);
  border-right: 2px solid var(--rail-border);
}

#sg-rail::-webkit-scrollbar {
  display: none;
}

.sg-rail-logo {
  display: block;
  width: 35px;
  height: 35px;
  align-self: center;
  flex-shrink: 0;
  object-fit: contain;
  object-position: center;
  border-radius: 8px;
  margin-bottom: 8px;
  user-select: none;
  pointer-events: none;
}

.sg-rail-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
}

.sg-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

@media (min-width: 768px) {
  #sg-rail {
    width: 55px;
    padding: 10px 0;
    justify-content: space-between;
    flex-direction: column;
  }

  .sg-rail-group {
    flex-direction: column;
  }
}

@media (max-width: 767.98px) {
  #sg-rail {
    order: 2;
    justify-content: space-between;
    height: calc(52px + env(safe-area-inset-bottom));
    padding: 0 8px env(safe-area-inset-bottom);
    border-right: 0;
    border-top: 2px solid var(--rail-border);
  }

  .sg-rail-group {
    gap: 2px;
  }

  .sg-rail-bottom {
    width: 40px;
    flex-direction: row;
    justify-content: center;
    gap: 0;
  }
}

.sg-rail-btn {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--rail-icon);
  transition: 0.15s;
  text-decoration: none;
  cursor: pointer;
}

.sg-rail-btn::after {
  content: attr(aria-label);
  position: absolute;
  top: 50%;
  left: calc(100% + 8px);
  z-index: 20;
  padding: 5px 8px;
  border: 2px solid var(--rail-tooltip-border);
  border-radius: 6px;
  background: var(--rail-tooltip-bg);
  box-shadow: 0 4px 12px var(--sg-shadow-soft);
  color: var(--rail-tooltip-color);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translate(3px, -50%);
  transition: opacity 0.14s ease, transform 0.14s ease, visibility 0.14s ease;
}

.sg-rail-btn:hover,
.sg-rail-btn:focus-visible {
  z-index: 1;
}

.sg-rail-btn:hover::after,
.sg-rail-btn:focus-visible::after {
  opacity: 1;
  visibility: visible;
  transform: translate(0, -50%);
}

.sg-rail-btn:focus-visible {
  outline: 2px solid var(--sg-accent-light);
  outline-offset: 2px;
}

.sg-rail-btn svg {
  width: 22px;
  height: 22px;
}

.sg-rail-btn:hover {
  background: var(--rail-hover-bg);
  color: var(--rail-icon-hover);
}

.sg-rail-btn.open {
  color: var(--rail-icon-open);
}

.sg-rail-btn.active,
.sg-rail-btn.active:hover {
  background: var(--rail-active-bg);
  color: var(--sg-text);
}

@media (max-width: 767.98px) {
  .sg-rail-logo {
    width: 26px;
    height: 26px;
    margin: 0 4px 0 0;
  }

  .sg-rail-group {
    flex: 1;
    justify-content: space-around;
    gap: 0;
  }

  .sg-rail-btn {
    width: auto;
    flex: 1 1 0;
    min-width: 0;
    max-width: 40px;
    height: 38px;
  }

  .sg-rail-btn::after {
    top: auto;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translate(-50%, 3px);
  }

  .sg-rail-btn:hover::after,
  .sg-rail-btn:focus-visible::after {
    transform: translate(-50%, 0);
  }
}
</style>
