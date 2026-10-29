<script setup>
</script>
<template>
    <div class="homePage">
        <div class="titleArea">
            <h1 class="siteTitle">Singularity V2</h1>
        </div>
    </div>
</template>
<style scoped>
  .homePage{
    position:relative;
    display:flex;
    flex:1;
    width:100%;
    box-sizing:border-box;
  }
  .titleArea{
    display:flex;
    flex:1;
    align-items:center;
    justify-content:center;
  }
  .siteTitle {
    color: var(--sg-text);
    font-size: 4rem;
    transform: translateY(-160%);
  }
</style>