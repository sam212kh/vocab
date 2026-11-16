<script setup lang="ts">
import { useRoute } from 'vue-router'

import StateBlock from '../components/ui/StateBlock.vue'

const route = useRoute()
</script>

<template>
    <div class="mx-auto max-w-xl pt-6">
        <StateBlock kind="empty" title="Page not found" :text="`There is nothing at ${route.fullPath}. It may have moved, or the link may be mistyped.`">
            <div class="mt-5 flex flex-wrap justify-center gap-2">
                <RouterLink to="/" class="btn-primary">Go to the Dashboard</RouterLink>
                <RouterLink to="/lessons" class="btn-secondary">Browse lessons</RouterLink>
            </div>
        </StateBlock>
    </div>
</template>
