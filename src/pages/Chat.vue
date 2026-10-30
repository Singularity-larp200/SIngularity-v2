<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Send } from '@lucide/vue';
import { initializeChatSocket } from '@/js/socket.js';

let cleanupChatSocket: (() => void) | undefined;

onMounted(() => {
    cleanupChatSocket = initializeChatSocket();
});

onUnmounted(() => {
    cleanupChatSocket?.();
});
</script>
<template>
    <div class="chatPage" data-chat-root>
        <section class="chatRoom" id="chatRoom" inert>
            <div class="chatMessage" id="chatMessages" role="log" aria-live="polite">
                <p class="chatEmpty" id="chatEmpty">no messages yet, say hi.</p>
            </div>
            <p class="chatError roomError" id="chatRoomError" role="alert" hidden></p>
            <form class="chatInputArea" id="chatMessageForm" hidden>
                <input
                    class="chatMessageInput"
                    id="chatMessage"
                    name="message"
                    type="text"
                    maxlength="500"
                    placeholder="Send a message..."
                    required
                >
                <button class="chatSendButton" id="chatSendButton" type="submit" aria-label="Send message">
                    <Send class="sendIcon"/>
                </button>
            </form>
        </section>
        <section class="chatJoinPanel" id="chatJoinPanel">
            <div class="chatJoinCard">
                <h1 class="joinCardTitle" id="joinCardTitle">Join the Chat</h1>
                <p class="joinCardSubtitle">Make a username to chat</p>
                <form class="joinForm" id="chatJoinForm">
                    <span class="joinCardUsername" id="usernameText">Username</span>
                    <input
                        class="joinCardInput"
                        id="chatName"
                        name="name"
                        type="text"
                        maxlength="24"
                        autocomplete="nickname"
                        aria-labelledby="usernameText"
                        placeholder="Your name"
                        required
                        autofocus
                    >
                    <p class="chatError joinError" id="chatJoinError" role="alert"></p>
                    <button class="chatJoinButton" id="chatJoinButton" type="submit">Continue</button>
                </form>
            </div>
        </section>
    </div>
</template>
<style scoped>
  .chatPage{
    position:relative;
    display:flex;
    flex:1;
    min-height:0;
    min-width:0;
    width:100%;
    box-sizing:border-box;
  }
  
 .chatJoinButton{
    min-height:44px;
    padding:10px 14px;
   border:1px solid var(--sg-border);
    border-radius:6px;
   background:var(--sg-accent);
   color:var(--sg-text);
    font:inherit;
    font-weight:700;
    cursor:pointer;
    transition:filter 0.15s ease, opacity 0.15s ease;
  }
  .chatRoom{
    display:flex;
    flex:1;
    flex-direction:column;
    min-height:0;
    width:100%;
    color:var(--sg-text);
  }
  .chatError{
    color:var(--sg-text-muted);
    font-size:0.85rem;
  }
  .chatJoinPanel[hidden],
  .chatInputArea[hidden]{
    display:none;
  }
  :deep(.chatEmpty){
    margin:auto;
    color:var(--sg-text-muted);
    text-align:center;
  }
   .joinCardInput{
    min-width:0;
    padding:12px 14px;
    border:1px solid var(--sg-border);
    border-radius:10px;
    outline:none;
    background:var(--sg-surface-raised);
    color:var(--sg-text);
    font:inherit;
  }

  .joinCardInput::placeholder{
    color:var(--sg-text-muted);
  }

  .joinCardInput:focus{
    border-color:var(--sg-accent-soft);
    box-shadow:0 0 0 3px color-mix(in srgb, var(--sg-accent) 20%, transparent);
  }

  .chatInputArea{
    display:flex;
    gap:10px;
    align-items:center;
    flex-shrink:0;
    width:100%;
    box-sizing:border-box;
    padding:0 clamp(14px, 3vw, 32px) 20px;
    animation: fadeIn 200ms ease-out 200ms both;
  }
   .chatMessageInput{
    flex:1;
    min-width:0;
    resize:none;
    padding:12px 16px;
    border:2px solid var(--sg-border);
    border-radius:6px;
    background:var(--sg-surface);
    color:var(--sg-text);
    font-size:1rem;
    font-family:inherit;
    height:50px;
    max-height:50px;
    width:100%;
    overflow:hidden;
    box-sizing:border-box;
    line-height:26px;
  }

  .chatMessageInput::placeholder{
    color:var(--sg-text-muted);
    opacity:1;
  }

 .messageInput{
    min-width:0;
    padding:12px 14px;
    border:1px solid var(--sg-border);
    border-radius:10px;
    outline:none;
    background:var(--sg-surface-raised);
    color:var(--sg-text);
    font:inherit;
  }
  .messageInput::placeholder{
    color:var(--sg-text-muted);
  }
  .joinCardUsername{
    color:var(--sg-accent-light);
    font-size:0.9rem;
    font-weight:600;
  }
  .chatSendButton{
    display:flex;
    flex-shrink:0;
    align-items:center;
    justify-content:center;
    width:50px;
    height:50px;
    padding:0;
    box-sizing:border-box;
    border:2px solid var(--sg-border);
    border-radius:6px;
    background:var(--sg-surface);
    color:var(--sg-accent-soft);
    font-size:1.1rem;
    cursor:pointer;
    transition:all 0.2s;
  }
  
  .chatSendButton .sendIcon{
    color:var(--sg-text-muted);
  }
  
  .joinCardTitle{
    margin:0 0 8px;
    font-size:1.35rem;
    font-weight:700;
    text-align:center;
  }
  .joinCardSubtitle{
    margin:0 0 22px;
    color:var(--sg-text-muted);
    line-height:1.55;
    text-align:center;
  }
  .joinForm{
    display:grid;
    gap:10px;
    width:100%;
    text-align:left;
  }
   .chatJoinCard{
    width:min(420px, 100%);
    box-sizing:border-box;
    padding:28px;
    border:1px solid var(--sg-border);
    border-radius:10px;
    background:var(--sg-surface);
    box-shadow:0 18px 48px var(--sg-shadow-strong);
    color:var(--sg-text);
    animation: fadeIn 200ms ease-out 400ms both;
  }
   .chatJoinPanel{
    position:absolute;
    inset:0;
    z-index:10;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:24px;
    box-sizing:border-box;
  }
  .chatMessage{
    display:flex;
    flex:1;
    flex-direction:column;
    gap:14px;
    min-height:0;
    overflow-y:auto;
    padding:24px clamp(14px, 3vw, 32px);
    scrollbar-color:color-mix(in srgb, var(--sg-accent-soft) 42%, transparent) transparent;
    scrollbar-width:thin;
    animation: fadeIn 200ms ease-out both;
  }
  .chatMessage::-webkit-scrollbar{
    width:8px;
  }
  .chatMessage::-webkit-scrollbar-thumb{
    border-radius: 4px;
    background:color-mix(in srgb, var(--sg-accent-soft) 38%, transparent);
  }
  .chatMessage::-webkit-scrollbar-thumb:hover{
    background:color-mix(in srgb, var(--sg-accent-light) 58%, transparent);
  }


  :deep(.message){
    display:flex;
    gap:12px;
    align-items:flex-end;
    max-width:min(78%, 760px);
  }
  
  :deep(.messageBubble){
    width:fit-content;
    max-width:100%;
    padding:12px 16px;
    border:1px solid var(--sg-border);
    border-radius:16px;
    word-wrap:break-word;
    white-space:pre-wrap;
    line-height:1.55;
    position:relative;
    background:var(--sg-surface-raised);
    box-shadow:0 1px 3px var(--sg-shadow-soft);
    color:var(--sg-text);
    user-select:text;
    -webkit-user-select:text;
    -moz-user-select:text;
    -ms-user-select:text;
    overflow-wrap:anywhere;
  }
  
  @media (max-width: 600px){
    .chatJoinPanel{
      padding:12px;
    }

    .chatJoinCard{
      padding:24px 20px;
    }

    .chatMessage{
      gap:11px;
      padding:16px 10px;
    }
    
    :deep(.messageBubble){
      padding:10px 14px;
      font-size:0.95rem;
    }

    .chatInputArea{
      gap:8px;
      padding:0 10px 12px;
    }

  }


  :deep(.message.user){
    margin-left:auto;
  }

  :deep(.message.bot){
    margin-right:auto;
  }

  :deep(.messageContent){
    min-width:0;
    max-width:100%;
  }

  :deep(.messageMeta){
    display:flex;
    align-items:baseline;
    gap:8px;
    margin:0 4px 5px;
    color:var(--sg-text-muted);
    font-size:0.78rem;
  }

  :deep(.messageName){
    color:var(--sg-text-muted);
    font-weight:600;
  }

  :deep(.messageTime){
    color:var(--sg-text-muted);
    font-size:0.75rem;
  }

  :deep(.messageSeparator){
    color:var(--sg-text-muted);
  }

  :deep(.message.user .messageMeta){
    justify-content:flex-end;
  }

  :deep(.message.user .messageBubble){
    margin-left:auto;
  }

  .chatSendButton:disabled{
    cursor:not-allowed;
    opacity:0.55;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chatMessage,
    .chatInputArea,
    .chatJoinCard {
      animation: none;
    }
  }
</style>
