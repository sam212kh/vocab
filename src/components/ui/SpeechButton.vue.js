import { ref } from 'vue';
import { speakAsync, getSpeechError, getSpeechRate, isLanguageSupported, } from '../../services/speech';
import { playPersianPronunciation, } from '../../services/persianPronunciation';
const props = withDefaults(defineProps(), {
    lang: 'en-US',
});
const playing = ref(false);
const error = ref(false);
async function handleClick() {
    if (!props.text.trim()) {
        return;
    }
    error.value = false;
    playing.value = true;
    try {
        if (props.lang === 'fa-IR') {
            await playPersianPronunciation(props.text);
            return;
        }
        if (!isLanguageSupported(props.lang)) {
            error.value = true;
            return;
        }
        const success = await speakAsync(props.text, props.lang, { rate: getSpeechRate() });
        error.value = !success;
        if (!success) {
            console.warn('[TTS]', getSpeechError());
        }
    }
    catch (err) {
        console.error('Pronunciation error:', err);
        error.value = true;
    }
    finally {
        playing.value = false;
    }
}
const __VLS_defaults = {
    lang: 'en-US',
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleClick) },
    type: "button",
    ...{ class: "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" },
    disabled: (__VLS_ctx.playing),
});
/** @type {__VLS_StyleScopedClasses['inline-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['transition']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-gray-50']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled:cursor-not-allowed']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled:opacity-50']} */ ;
if (__VLS_ctx.playing) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-1 text-xs text-red-500" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-red-500']} */ ;
    (__VLS_ctx.getSpeechError() || 'Pronunciation audio is unavailable.');
}
// @ts-ignore
[handleClick, playing, playing, error, getSpeechError,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
    props: {},
});
export default {};
