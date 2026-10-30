<script setup lang="ts">
import { Send } from '@lucide/vue';
</script>

<template>
  <div class="aiPage">
    <div class="aiInputArea" id="aiInputArea">
      <input
        class="aiInput"
        id="aiMessage"
        name="message"
        type="text"
        placeholder="Type Here..."
        required
      >
      <button class="sendBtn" id="aiSendButton" type="button" aria-label="Send message">
        <Send class="sendIcon" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.aiPage {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 0;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.aiInputArea {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0 clamp(14px, 3vw, 32px) 20px;
  animation: fadeIn 200ms ease-out 200ms both;
}

.aiInput {
  flex: 1;
  min-width: 0;
  resize: none;
  padding: 12px 16px;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-text);
  font-size: 1rem;
  font-family: inherit;
  height: 50px;
  max-height: 50px;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  line-height: 26px;
}

.aiInput::placeholder {
  color: var(--sg-text-muted);
  opacity: 1;
}

.aiInput:focus {
  outline: none;
}

.sendBtn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  padding: 0;
  box-sizing: border-box;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-accent-soft);
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sendBtn .sendIcon {
  color: var(--sg-text-muted);
}

.sendBtn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .aiInputArea {
    gap: 8px;
    padding: 0 10px 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .aiInputArea {
    animation: none;
  }
}
</style>
