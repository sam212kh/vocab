<script setup lang="ts">
/* Small inline icon set (no icon font, no emoji, no network). */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

const PATHS: Record<string, string[]> = {
    volume: ['M11 5 6 9H3v6h3l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
    stop: ['M7 7h10v10H7z'],
    'chevron-left': ['m15 18-6-6 6-6'],
    'chevron-right': ['m9 18 6-6-6-6'],
    bookmark: ['M6 4h12v17l-6-4-6 4V4z'],
    list: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
    close: ['M18 6 6 18M6 6l12 12'],
    check: ['m5 12 5 5L20 7'],
    'arrow-left': ['M19 12H5m6-6-6 6 6 6'],
    book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z', 'M19 19v2H6'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
    home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
    compass: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M15.5 8.5l-2 5-5 2 2-5 5-2z'],
    bolt: ['M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
    sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19'],
    briefcase: ['M3 8h18v12H3z', 'M9 8V5h6v3', 'M3 13h18'],
    chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z'],
    layers: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 13l9 5 9-5'],
    headphones: ['M4 15v-3a8 8 0 0 1 16 0v3', 'M4 15h3v5H4zM17 15h3v5h-3z'],
    mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
    pen: ['M4 20l4-1L19 8l-3-3L5 16l-1 4z', 'M14 7l3 3'],
    link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
    help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7', 'M12 17h.01'],
    blank: ['M4 12h16', 'M7 7h2M15 7h2M7 17h2M15 17h2'],
    star: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z'],
    user: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    chart: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
    sliders: ['M4 6h16M4 12h16M4 18h16', 'M9 4v4M15 10v4M8 16v4'],
    menu: ['M4 6h16M4 12h16M4 18h16'],
    'chevron-down': ['m6 9 6 6 6-6'],
    play: ['M7 4l13 8-13 8V4z'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    sparkle: ['M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z'],
    lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
    alert: ['M12 3 2 21h20L12 3z', 'M12 10v5M12 18h.01'],
    target: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    repeat: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
    ear: ['M6 9a6 6 0 0 1 12 0c0 3-2 4-3 6s-1 4-3 4-3-1.5-3-3'],
    grid: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
}

const filled = props.name.endsWith('-fill')
const key = filled ? props.name.slice(0, -5) : props.name
</script>

<template>
    <svg
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="shrink-0"
        :style="filled ? { fill: 'currentColor' } : undefined"
    >
        <path v-for="path in PATHS[key] ?? []" :key="path" :d="path" />
    </svg>
</template>
