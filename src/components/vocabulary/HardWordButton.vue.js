import { computed } from 'vue';
import { useHardWords } from '../../composables/useHardWords';
const props = defineProps();
const { isHardWord, toggleHardWord, } = useHardWords();
const hard = computed(() => isHardWord(props.wordId));
function handleToggle() {
    toggleHardWord(props.wordId, props.meaning);
}
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
    ...{ onClick: (__VLS_ctx.handleToggle) },
    type: "button",
    ...{ class: "shrink-0 rounded-lg px-3 py-2 text-lg transition hover:bg-gray-100" },
    ...{ class: (__VLS_ctx.hard ? 'text-yellow-500' : 'text-gray-400') },
    'aria-label': (__VLS_ctx.hard
        ? 'Remove from Hard Words'
        : 'Add to Hard Words'),
    title: (__VLS_ctx.hard
        ? 'Remove from Hard Words'
        : 'Add to Hard Words'),
});
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['transition']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-gray-100']} */ ;
(__VLS_ctx.hard ? '⭐' : '☆');
// @ts-ignore
[handleToggle, hard, hard, hard, hard,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
