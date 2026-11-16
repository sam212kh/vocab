<script setup lang="ts">
import { computed } from 'vue'

/**
 * Editorial-style flat illustrations, drawn as inline SVG: no image files,
 * no CDN, a few KB each, crisp at any density. One restrained palette per
 * scene so the set reads as a family. Scenes map to Real-Life categories;
 * anything else gets a deterministic abstract cover seeded by an id, so a
 * lesson always looks the same.
 */
const props = withDefaults(defineProps<{
    scene?: string
    seed?: string
    label?: string
}>(), { scene: '', seed: '', label: '' })

const SCENES: Record<string, { bg: string; blob: string; a: string; b: string }> = {
    kitchen: { bg: '#e9f4f1', blob: '#d2eae4', a: '#17917f', b: '#f0b66c' },
    'personal-care': { bg: '#eef0fb', blob: '#dde1f6', a: '#5560e8', b: '#f0b66c' },
    home: { bg: '#fbf3e6', blob: '#f3e3c6', a: '#cf7d2c', b: '#17917f' },
    shopping: { bg: '#fbefea', blob: '#f6dcd2', a: '#cf5f3d', b: '#f0b66c' },
    restaurant: { bg: '#f4f0e8', blob: '#e8dfcd', a: '#17917f', b: '#e0903e' },
    'daily-routine': { bg: '#eaf2fb', blob: '#d5e5f6', a: '#3d7fd1', b: '#f0b66c' },
    phone: { bg: '#eef6ee', blob: '#d9ecd9', a: '#2f9e5f', b: '#f0b66c' },
    breakfast: { bg: '#fbf1e4', blob: '#f5e0c2', a: '#d9822b', b: '#f0c25a' },
    dishes: { bg: '#e9f3f7', blob: '#d3e7ef', a: '#3d8fb5', b: '#f0b66c' },
    work: { bg: '#eceff6', blob: '#dae0ee', a: '#3b4a7a', b: '#f0b66c' },
}

/* A scenario id picks its own scene; otherwise its category's scene is used. */
const SCENE_FOR_ID: Record<string, string> = {
    'making-tea': 'kitchen',
    'preparing-breakfast': 'breakfast',
    'washing-dishes': 'dishes',
    'getting-dressed': 'personal-care',
    'cleaning-house': 'home',
    'going-shopping': 'shopping',
    'ordering-food': 'restaurant',
    'getting-ready-for-work': 'work',
    'making-phone-call': 'phone',
    'daily-routine': 'daily-routine',
}

const sceneKey = computed(() => SCENE_FOR_ID[props.scene] ?? props.scene)

const INK = '#1c2230'

const known = computed(() => sceneKey.value in SCENES)
const palette = computed(() => SCENES[sceneKey.value] ?? SCENES.kitchen)

/* Deterministic abstract cover for content without a scene. */
function hash(value: string): number {
    let h = 2166136261

    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }

    return h >>> 0
}

const COVERS = [
    ['#e9f4f1', '#17917f', '#f0b66c', '#d2eae4'],
    ['#eef0fb', '#5560e8', '#f0b66c', '#dde1f6'],
    ['#fbf3e6', '#cf7d2c', '#17917f', '#f3e3c6'],
    ['#f4f0e8', '#3d7fd1', '#cf5f3d', '#e8dfcd'],
]

const cover = computed(() => {
    let state = hash(props.seed || 'english-upgrade')
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 4294967296
    }
    const [bg, a, b, soft] = COVERS[hash(props.seed || 'x') % COVERS.length]

    const shapes = Array.from({ length: 5 }, (_, i) => ({
        kind: i % 3,
        x: 30 + next() * 260,
        y: 24 + next() * 150,
        r: 22 + next() * 40,
        fill: [a, b, soft, a, b][i],
        rot: Math.round(next() * 90),
        opacity: i === 2 ? 1 : 0.92,
    }))

    return { bg, a, b, soft, shapes }
})
</script>

<template>
    <svg
        viewBox="0 0 320 200"
        preserveAspectRatio="xMidYMid slice"
        class="block h-full w-full"
        :role="label ? 'img' : undefined"
        :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'"
    >
        <!-- ============ scenes ============ -->
        <template v-if="known">
            <rect width="320" height="200" :fill="palette.bg" />
            <circle cx="262" cy="52" r="74" :fill="palette.blob" />
            <circle cx="40" cy="176" r="52" :fill="palette.blob" opacity="0.7" />

            <!-- kitchen: kettle + cup -->
            <g v-if="sceneKey === 'kitchen'">
                <rect y="152" width="320" height="48" fill="#d9ccb2" />
                <rect y="152" width="320" height="5" fill="#c6b794" />
                <path d="M104 152v-38a46 36 0 0 1 92 0v38z" :fill="palette.a" />
                <path d="M196 124l34-24 8 9-32 30z" :fill="palette.a" />
                <path d="M104 118c-38-6-38 38 0 34" fill="none" :stroke="INK" stroke-width="8" stroke-linecap="round" />
                <rect x="138" y="72" width="24" height="10" rx="5" :fill="INK" />
                <circle cx="150" cy="68" r="6" :fill="INK" />
                <path d="M126 112c14-10 36-10 48 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" />
                <path d="M244 86c8-10-8-16 0-28M262 92c8-10-8-16 0-28" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" />
                <path d="M226 124h52v22a26 26 0 0 1-52 0z" fill="#fff" />
                <path d="M278 130c16-2 16 22 0 20" fill="none" :stroke="palette.b" stroke-width="6" stroke-linecap="round" />
                <rect x="226" y="124" width="52" height="8" :fill="palette.b" />
            </g>

            <!-- personal care: shirt on a hanger + mirror -->
            <g v-else-if="sceneKey === 'personal-care'">
                <rect y="162" width="320" height="38" fill="#d6daf1" />
                <path d="M118 96 160 70l42 26" fill="none" :stroke="INK" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M160 70V58a8 8 0 1 1 8 8" fill="none" :stroke="INK" stroke-width="5" stroke-linecap="round" />
                <path d="M118 96l-34 22 14 24 18-11v62h88v-62l18 11 14-24-34-22q-24 16-48 16t-42-16z" :fill="palette.a" />
                <path d="M146 100q14 12 28 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" />
                <rect x="236" y="48" width="52" height="108" rx="26" fill="#fff" :stroke="INK" stroke-width="5" />
                <path d="M250 74c6-8 16-8 24 0" fill="none" :stroke="palette.b" stroke-width="5" stroke-linecap="round" />
            </g>

            <!-- home: window, broom, bucket -->
            <g v-else-if="sceneKey === 'home'">
                <rect y="160" width="320" height="40" fill="#ecd9b4" />
                <rect x="40" y="38" width="96" height="92" rx="8" fill="#fff" :stroke="INK" stroke-width="5" />
                <path d="M88 38v92M40 84h96" :stroke="INK" stroke-width="5" />
                <circle cx="64" cy="62" r="11" :fill="palette.b" />
                <path d="M196 44l30 116" :stroke="INK" stroke-width="7" stroke-linecap="round" />
                <path d="M210 112h56l-10 50h-44z" :fill="palette.a" />
                <path d="M222 124l-4 36M236 124l-2 36M250 124l0 36" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" />
                <path d="M256 150h40l-5 30h-30z" :fill="palette.b" />
            </g>

            <!-- shopping: two bags -->
            <g v-else-if="sceneKey === 'shopping'">
                <rect y="164" width="320" height="36" fill="#f0cfc2" />
                <path d="M92 90h84l10 80H82z" :fill="palette.a" />
                <path d="M114 90v-8a20 20 0 0 1 40 0v8" fill="none" :stroke="INK" stroke-width="6" stroke-linecap="round" />
                <path d="M166 112h84l8 58h-96z" :fill="palette.b" />
                <path d="M188 112v-8a20 20 0 0 1 40 0v8" fill="none" :stroke="INK" stroke-width="6" stroke-linecap="round" />
                <circle cx="134" cy="132" r="14" fill="#fff" opacity=".85" />
                <path d="M127 132l5 5 9-10" fill="none" :stroke="palette.a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
            </g>

            <!-- restaurant: plate, fork, knife, glass -->
            <g v-else-if="sceneKey === 'restaurant'">
                <rect y="150" width="320" height="50" fill="#e3d8c2" />
                <circle cx="160" cy="112" r="56" fill="#fff" />
                <circle cx="160" cy="112" r="38" fill="none" :stroke="palette.b" stroke-width="5" />
                <circle cx="160" cy="112" r="16" :fill="palette.a" />
                <path d="M88 76v58M98 76v58M108 76v58M88 76q10 16 20 0M98 118v52" fill="none" :stroke="INK" stroke-width="5" stroke-linecap="round" />
                <path d="M232 70q14 6 10 50v50" fill="none" :stroke="INK" stroke-width="6" stroke-linecap="round" />
                <path d="M256 70h30l-6 46q-9 8-18 0z" fill="#fff" :stroke="INK" stroke-width="4" stroke-linejoin="round" />
                <path d="M270 120v40M258 160h24" :stroke="INK" stroke-width="5" stroke-linecap="round" />
                <path d="M262 92h18l-2 20q-7 5-14 0z" :fill="palette.b" opacity=".85" />
            </g>

            <!-- daily routine: sunrise, clock -->
            <g v-else-if="sceneKey === 'daily-routine'">
                <rect y="156" width="320" height="44" fill="#cfe0f3" />
                <circle cx="76" cy="156" r="40" :fill="palette.b" />
                <circle cx="206" cy="92" r="56" fill="#fff" :stroke="INK" stroke-width="6" />
                <path d="M206 92V58M206 92l24 14" fill="none" :stroke="INK" stroke-width="6" stroke-linecap="round" />
                <circle cx="206" cy="92" r="5" :fill="palette.a" />
                <path d="M206 44v6M206 134v6M158 92h6M248 92h6" :stroke="palette.a" stroke-width="4" stroke-linecap="round" />
                <path d="M262 142h34l-4 34h-26z" :fill="palette.a" />
                <path d="M272 142v-6a8 8 0 0 1 14 0v6" fill="none" :stroke="INK" stroke-width="4" stroke-linecap="round" />
            </g>

            <!-- phone: handset + speech bubbles -->
            <g v-else-if="sceneKey === 'phone'">
                <g transform="rotate(-8 130 110)">
                    <rect x="96" y="40" width="68" height="124" rx="14" :fill="INK" />
                    <rect x="103" y="52" width="54" height="94" rx="6" fill="#fff" />
                    <circle cx="130" cy="156" r="4" fill="#fff" opacity=".6" />
                    <rect x="112" y="68" width="36" height="8" rx="4" :fill="palette.a" />
                    <rect x="112" y="84" width="26" height="8" rx="4" :fill="palette.blob" />
                    <rect x="112" y="100" width="32" height="8" rx="4" :fill="palette.b" />
                </g>
                <path d="M188 70q14 14 0 28M204 58q24 26 0 52" fill="none" :stroke="palette.a" stroke-width="5" stroke-linecap="round" />
                <path d="M226 118h60a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10h-30l-14 12v-12h-16a10 10 0 0 1-10-10v-22a10 10 0 0 1 10-10z" fill="#fff" />
                <path d="M236 134h42M236 146h26" :stroke="palette.a" stroke-width="5" stroke-linecap="round" />
            </g>

            <!-- breakfast: pan with egg, toast -->
            <g v-else-if="sceneKey === 'breakfast'">
                <rect y="154" width="320" height="46" fill="#ecd7b0" />
                <path d="M96 104c10-12-8-18 0-30M118 104c10-12-8-18 0-30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" />
                <ellipse cx="120" cy="136" rx="46" ry="15" fill="#fff" />
                <circle cx="128" cy="132" r="12" :fill="palette.b" />
                <rect x="60" y="136" width="120" height="30" rx="12" :fill="INK" />
                <rect x="172" y="145" width="76" height="10" rx="5" :fill="INK" />
                <path d="M222 70h40a16 16 0 0 1 16 16v66h-72V86a16 16 0 0 1 16-16z" fill="#e6bf7c" />
                <path d="M230 82h24a8 8 0 0 1 8 8v52h-40V90a8 8 0 0 1 8-8z" fill="#f6dfae" />
                <circle cx="76" cy="52" r="26" :fill="palette.b" opacity=".55" />
            </g>

            <!-- dishes: sink, tap, plates, bubbles -->
            <g v-else-if="sceneKey === 'dishes'">
                <rect y="150" width="320" height="50" fill="#c9dfe8" />
                <path d="M62 112h196v38a14 14 0 0 1-14 14H76a14 14 0 0 1-14-14z" fill="#fff" :stroke="INK" stroke-width="5" stroke-linejoin="round" />
                <path d="M150 112V66a22 22 0 0 1 22-22h30" fill="none" :stroke="INK" stroke-width="9" stroke-linecap="round" />
                <path d="M204 60v10" :stroke="palette.a" stroke-width="5" stroke-linecap="round" />
                <ellipse cx="116" cy="124" rx="32" ry="9" :fill="palette.a" />
                <ellipse cx="116" cy="116" rx="32" ry="9" fill="#fff" :stroke="palette.a" stroke-width="4" />
                <ellipse cx="116" cy="108" rx="32" ry="9" fill="#fff" :stroke="palette.a" stroke-width="4" />
                <circle cx="210" cy="108" r="14" fill="#fff" :stroke="palette.a" stroke-width="3" opacity=".9" />
                <circle cx="232" cy="124" r="9" fill="#fff" :stroke="palette.a" stroke-width="3" opacity=".9" />
                <circle cx="192" cy="128" r="7" fill="#fff" :stroke="palette.a" stroke-width="3" opacity=".9" />
            </g>

            <!-- work: briefcase, badge -->
            <g v-else-if="sceneKey === 'work'">
                <rect y="160" width="320" height="40" fill="#d3d9ea" />
                <path d="M142 98V84a10 10 0 0 1 10-10h24a10 10 0 0 1 10 10v14" fill="none" :stroke="INK" stroke-width="8" stroke-linecap="round" />
                <rect x="100" y="98" width="120" height="74" rx="12" :fill="palette.a" />
                <path d="M100 128h120" stroke="#fff" stroke-opacity=".25" stroke-width="5" />
                <rect x="148" y="120" width="24" height="18" rx="4" :fill="palette.b" />
                <rect x="240" y="60" width="44" height="64" rx="8" fill="#fff" :stroke="INK" stroke-width="5" />
                <circle cx="262" cy="84" r="9" :fill="palette.b" />
                <path d="M248 104h28M252 112h20" :stroke="palette.a" stroke-width="4" stroke-linecap="round" />
                <path d="M262 36v24" :stroke="INK" stroke-width="5" stroke-linecap="round" />
            </g>
        </template>

        <!-- ============ abstract seeded cover ============ -->
        <template v-else>
            <rect width="320" height="200" :fill="cover.bg" />
            <template v-for="(shape, i) in cover.shapes" :key="i">
                <circle v-if="shape.kind === 0" :cx="shape.x" :cy="shape.y" :r="shape.r" :fill="shape.fill" :opacity="shape.opacity" />
                <rect
                    v-else-if="shape.kind === 1"
                    :x="shape.x - shape.r" :y="shape.y - shape.r" :width="shape.r * 1.8" :height="shape.r * 1.8"
                    :rx="shape.r * 0.35" :fill="shape.fill" :opacity="shape.opacity"
                    :transform="`rotate(${shape.rot} ${shape.x} ${shape.y})`"
                />
                <path
                    v-else
                    :d="`M${shape.x - shape.r} ${shape.y}a${shape.r} ${shape.r} 0 0 1 ${shape.r * 2} 0z`"
                    :fill="shape.fill" :opacity="shape.opacity"
                    :transform="`rotate(${shape.rot} ${shape.x} ${shape.y})`"
                />
            </template>
        </template>
    </svg>
</template>
