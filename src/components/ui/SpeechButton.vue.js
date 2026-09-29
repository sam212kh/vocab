import { ref } from 'vue';
import { speak, isLanguageSupported, } from '../../services/speech';
import AppToast from './AppToast.vue';
const props = withDefaults(defineProps(), {
    lang: 'en-US',
    label: '🔊',
});
const toast = ref('');
function play() {
    if (!isLanguageSupported(props.lang)) {
        toast.value =
            props.lang === 'fa-IR'
                ? 'Persian voice is not available'
                : 'English voice is not available';
        setTimeout(() => {
            toast.value = '';
        }, 3000);
        return;
    }
    speak(props.text, props.lang);
}
const __VLS_defaults = {
    lang: 'en-US',
    label: '🔊',
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
    ...{ onClick: (__VLS_ctx.play) },
    type: "button",
    ...{ class: "rounded-lg px-2 py-1 text-sm hover:bg-gray-100" },
});
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-gray-100']} */ ;
(__VLS_ctx.label);
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
const __VLS_6 = AppToast;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    message: (__VLS_ctx.toast),
}));
const __VLS_8 = __VLS_7({
    message: (__VLS_ctx.toast),
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
// @ts-ignore
[play, label, toast,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
    props: {},
});
export default {};
