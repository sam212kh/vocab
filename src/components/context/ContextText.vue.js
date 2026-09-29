import { computed, onBeforeUnmount, ref } from 'vue';
import SpeechButton from '../ui/SpeechButton.vue';
const props = defineProps();
const selected = ref(false);
const contextParts = computed(() => {
    const text = props.word.miniContext;
    const target = props.word.word;
    if (!text || !target) {
        return [{ text, isTarget: false }];
    }
    const regex = new RegExp(`(${escapeRegex(target)})`, 'gi');
    return text
        .split(regex)
        .filter(Boolean)
        .map(part => ({
        text: part,
        isTarget: part.toLowerCase() === target.toLowerCase(),
    }));
});
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function selectWord() {
    selected.value = true;
    document.addEventListener('click', handleOutsideClick);
}
function closePopup() {
    selected.value = false;
    document.removeEventListener('click', handleOutsideClick);
}
function handleOutsideClick(event) {
    const target = event.target;
    if (!target.closest('[data-context-popup]')) {
        closePopup();
    }
}
onBeforeUnmount(() => {
    document.removeEventListener('click', handleOutsideClick);
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    'data-context-popup': true,
    ...{ class: "relative" },
});
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "leading-7 text-gray-700" },
});
/** @type {__VLS_StyleScopedClasses['leading-7']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-700']} */ ;
for (const [part, index] of __VLS_vFor((__VLS_ctx.contextParts))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
        key: (index),
    });
    if (part.isTarget) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.selectWord) },
            type: "button",
            ...{ class: "font-semibold underline decoration-dotted underline-offset-4 hover:bg-gray-100" },
        });
        /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
        /** @type {__VLS_StyleScopedClasses['underline']} */ ;
        /** @type {__VLS_StyleScopedClasses['decoration-dotted']} */ ;
        /** @type {__VLS_StyleScopedClasses['underline-offset-4']} */ ;
        /** @type {__VLS_StyleScopedClasses['hover:bg-gray-100']} */ ;
        (part.text);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (part.text);
    }
    // @ts-ignore
    [contextParts, selectWord,];
}
if (__VLS_ctx.selected) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border bg-white p-4 shadow-xl" },
    });
    /** @type {__VLS_StyleScopedClasses['absolute']} */ ;
    /** @type {__VLS_StyleScopedClasses['left-0']} */ ;
    /** @type {__VLS_StyleScopedClasses['top-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['z-20']} */ ;
    /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['w-72']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['shadow-xl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "flex items-start justify-between gap-3" },
    });
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-start']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
    /** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({
        ...{ class: "font-bold" },
    });
    /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
    (__VLS_ctx.word.word);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-1 text-sm text-gray-600" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
    (__VLS_ctx.word.meaning);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closePopup) },
        type: "button",
        ...{ class: "text-gray-400 hover:text-gray-700" },
    });
    /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:text-gray-700']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mt-3" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
    const __VLS_0 = SpeechButton;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        text: (__VLS_ctx.word.word),
        lang: "en-US",
        label: "🔊 Pronunciation",
    }));
    const __VLS_2 = __VLS_1({
        text: (__VLS_ctx.word.word),
        lang: "en-US",
        label: "🔊 Pronunciation",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
const __VLS_5 = SpeechButton;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    text: (props.word.miniContext),
    lang: "en-US",
    label: "🔊",
}));
const __VLS_7 = __VLS_6({
    text: (props.word.miniContext),
    lang: "en-US",
    label: "🔊",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
// @ts-ignore
[selected, word, word, word, closePopup,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
