import { computed, onMounted, ref } from 'vue';
import { loadLesson, loadManifest, } from '../services/vocabulary';
import { useListenRepeat } from '../composables/useListenRepeat';
import { useHardWordsStore } from '../stores/hardWords';
import HardWordButton from '../components/vocabulary/HardWordButton.vue';
/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/
const courses = ref([]);
const selectedCourseId = ref('');
const selectedLessonId = ref('');
const lessonWords = ref([]);
const allHardWords = ref([]);
const lesson = ref(null);
const loading = ref(false);
const error = ref('');
const mode = ref('lesson');
const hardWordsLoaded = ref(false);
/*
|--------------------------------------------------------------------------
| Hard Words Store
|--------------------------------------------------------------------------
*/
const hardWordsStore = useHardWordsStore();
/*
|--------------------------------------------------------------------------
| Selected Course
|--------------------------------------------------------------------------
*/
const selectedCourse = computed(() => {
    return courses.value.find(course => course.id === selectedCourseId.value);
});
/*
|--------------------------------------------------------------------------
| Available Lessons
|--------------------------------------------------------------------------
*/
const availableLessons = computed(() => {
    return selectedCourse.value?.lessons ?? [];
});
/*
|--------------------------------------------------------------------------
| Words to Play
|--------------------------------------------------------------------------
|
| Lesson mode:
|     selected lesson words
|
| Hard mode:
|     ALL hard words from ALL courses/lessons
|
*/
const playableWords = computed(() => {
    if (mode.value === 'hard') {
        return allHardWords.value;
    }
    return lessonWords.value;
});
/*
|--------------------------------------------------------------------------
| Listen & Repeat
|--------------------------------------------------------------------------
*/
const { currentIndex, currentNumber, total, progressPercent, repeatCount, playbackStep, isPlaying, start, stop, next, previous, repeatCurrent, reset, } = useListenRepeat(playableWords);
/*
|--------------------------------------------------------------------------
| Current Word
|--------------------------------------------------------------------------
*/
const currentWord = computed(() => {
    return playableWords.value[currentIndex.value] ?? null;
});
/*
|--------------------------------------------------------------------------
| Load All Hard Words
|--------------------------------------------------------------------------
|
| Hard Words are global.
|
| We go through every course and every lesson,
| load the lesson JSON and keep only words that
| are currently marked as hard.
|
*/
async function loadAllHardWords() {
    /*
     * Already loaded?
     * Don't download all JSON files again.
     */
    if (hardWordsLoaded.value) {
        reset();
        return;
    }
    loading.value = true;
    error.value = '';
    try {
        const collectedWords = [];
        for (const course of courses.value) {
            for (const lessonItem of course.lessons) {
                try {
                    const words = await loadLesson(lessonItem);
                    const hardWords = words.filter(word => hardWordsStore.isHardWord(word.word));
                    collectedWords.push(...hardWords);
                }
                catch (err) {
                    console.error(`Failed to load ${lessonItem.id}:`, err);
                }
            }
        }
        /*
         * Remove duplicates by actual word.
         */
        const uniqueWords = new Map();
        for (const word of collectedWords) {
            const key = word.word
                .trim()
                .toLowerCase();
            if (!uniqueWords.has(key)) {
                uniqueWords.set(key, word);
            }
        }
        allHardWords.value = Array.from(uniqueWords.values());
        hardWordsLoaded.value = true;
        reset();
    }
    catch (err) {
        console.error('Failed to load hard words:', err);
        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load hard words';
    }
    finally {
        loading.value = false;
    }
}
/*
|--------------------------------------------------------------------------
| Change Repeat Mode
|--------------------------------------------------------------------------
*/
async function changeMode(newMode) {
    if (mode.value === newMode) {
        return;
    }
    stop();
    mode.value = newMode;
    error.value = '';
    if (newMode === 'hard') {
        await loadAllHardWords();
        return;
    }
    reset();
}
/*
|--------------------------------------------------------------------------
| Load Selected Lesson
|--------------------------------------------------------------------------
*/
async function loadSelectedLesson() {
    if (!selectedCourse.value ||
        !selectedLessonId.value) {
        return;
    }
    const selectedLesson = selectedCourse.value.lessons.find(item => item.id ===
        selectedLessonId.value);
    if (!selectedLesson) {
        return;
    }
    stop();
    loading.value = true;
    error.value = '';
    try {
        lesson.value = selectedLesson;
        lessonWords.value =
            await loadLesson(selectedLesson);
        reset();
    }
    catch (err) {
        console.error('Failed to load lesson:', err);
        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load lesson';
    }
    finally {
        loading.value = false;
    }
}
/*
|--------------------------------------------------------------------------
| Change Course
|--------------------------------------------------------------------------
*/
function changeCourse() {
    stop();
    selectedLessonId.value = '';
    lesson.value = null;
    lessonWords.value = [];
    reset();
}
/*
|--------------------------------------------------------------------------
| Load Manifest
|--------------------------------------------------------------------------
*/
onMounted(async () => {
    try {
        const manifest = await loadManifest();
        courses.value =
            manifest.courses;
    }
    catch (err) {
        console.error(err);
        error.value =
            'Failed to load courses';
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "mb-8" },
});
/** @type {__VLS_StyleScopedClasses['mb-8']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "text-3xl font-bold" },
});
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "mt-2 text-gray-500" },
});
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-6 rounded-lg bg-red-50 p-4 text-red-600" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-red-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-red-600']} */ ;
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "mb-8" },
});
/** @type {__VLS_StyleScopedClasses['mb-8']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "mb-2 block text-sm font-medium" },
});
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "grid grid-cols-1 gap-3 sm:grid-cols-2" },
});
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:grid-cols-2']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.changeMode('lesson'));
            // @ts-ignore
            [error, error, changeMode,];
        } },
    type: "button",
    ...{ class: "rounded-xl border p-4 text-left transition" },
    ...{ class: (__VLS_ctx.mode === 'lesson'
            ? 'border-black bg-black text-white'
            : 'border-gray-200 bg-white hover:bg-gray-50') },
});
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['transition']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "flex items-center gap-3" },
});
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "text-2xl" },
});
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-semibold" },
});
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "mt-1 text-sm" },
    ...{ class: (__VLS_ctx.mode === 'lesson'
            ? 'text-gray-300'
            : 'text-gray-500') },
});
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.changeMode('hard'));
            // @ts-ignore
            [changeMode, mode, mode,];
        } },
    type: "button",
    ...{ class: "rounded-xl border p-4 text-left transition" },
    ...{ class: (__VLS_ctx.mode === 'hard'
            ? 'border-yellow-400 bg-yellow-50'
            : 'border-gray-200 bg-white hover:bg-gray-50') },
});
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['transition']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "flex items-center gap-3" },
});
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "text-2xl" },
});
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-semibold" },
    ...{ class: (__VLS_ctx.mode === 'hard'
            ? 'text-yellow-700'
            : 'text-gray-900') },
});
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "mt-1 text-sm text-gray-500" },
});
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
if (__VLS_ctx.mode === 'lesson') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-8 grid grid-cols-1 gap-4 md:grid-cols-2" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
    /** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "mb-2 block text-sm font-medium" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.changeCourse) },
        value: (__VLS_ctx.selectedCourseId),
        ...{ class: "w-full rounded-lg border bg-white px-4 py-3" },
    });
    /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    for (const [course] of __VLS_vFor((__VLS_ctx.courses))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (course.id),
            value: (course.id),
        });
        (course.title);
        // @ts-ignore
        [mode, mode, mode, changeCourse, selectedCourseId, courses,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "mb-2 block text-sm font-medium" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (__VLS_ctx.loadSelectedLesson) },
        value: (__VLS_ctx.selectedLessonId),
        ...{ class: "w-full rounded-lg border bg-white px-4 py-3 disabled:bg-gray-100" },
        disabled: (!__VLS_ctx.selectedCourseId),
    });
    /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled:bg-gray-100']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
    });
    for (const [item] of __VLS_vFor((__VLS_ctx.availableLessons))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (item.id),
            value: (item.id),
        });
        (item.title);
        // @ts-ignore
        [selectedCourseId, loadSelectedLesson, selectedLessonId, availableLessons,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-8 rounded-xl border border-yellow-200 bg-yellow-50 p-4" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-yellow-200']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-yellow-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-4']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "flex items-center justify-between gap-4" },
    });
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
    /** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "font-semibold text-yellow-800" },
    });
    /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-yellow-800']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-1 text-sm text-yellow-700" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-yellow-700']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "shrink-0 text-center" },
    });
    /** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text-2xl font-bold text-yellow-700" },
    });
    /** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-yellow-700']} */ ;
    (__VLS_ctx.allHardWords.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text-xs text-yellow-600" },
    });
    /** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-yellow-600']} */ ;
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "py-12 text-center text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['py-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text-lg" },
    });
    /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
    if (__VLS_ctx.mode === 'hard') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "mt-2 text-sm" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    }
}
else if (__VLS_ctx.playableWords.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-6" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-2 flex items-center justify-between text-sm text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.currentNumber);
    (__VLS_ctx.total);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (Math.round(__VLS_ctx.progressPercent));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "h-2 overflow-hidden rounded-full bg-gray-200" },
    });
    /** @type {__VLS_StyleScopedClasses['h-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-gray-200']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "h-full rounded-full bg-black transition-all duration-300" },
        ...{ style: ({
                width: `${__VLS_ctx.progressPercent}%`
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['h-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
    /** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
    /** @type {__VLS_StyleScopedClasses['duration-300']} */ ;
}
if (!__VLS_ctx.loading &&
    __VLS_ctx.currentWord) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mx-auto max-w-2xl" },
    });
    /** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
    /** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rounded-2xl border bg-white p-8 text-center shadow-sm" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
    if (__VLS_ctx.mode === 'hard' &&
        __VLS_ctx.currentWord.lessonId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-sm text-gray-400" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
        (__VLS_ctx.currentWord.lessonId);
    }
    else if (__VLS_ctx.lesson) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-sm text-gray-400" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
        (__VLS_ctx.lesson.title);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-2 text-xs font-medium uppercase tracking-wide" },
        ...{ class: (__VLS_ctx.mode === 'hard'
                ? 'text-yellow-600'
                : 'text-gray-400') },
    });
    /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    /** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
    /** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
    (__VLS_ctx.mode === 'hard'
        ? '⭐ Hard Words'
        : '📖 Lesson Words');
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-3 text-sm text-gray-400" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
    (__VLS_ctx.currentIndex + 1);
    (__VLS_ctx.playableWords.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "mt-6 text-4xl font-bold" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
    (__VLS_ctx.currentWord.word);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-3 text-lg text-gray-600" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
    (__VLS_ctx.currentWord.meaning);
    if (__VLS_ctx.isPlaying) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mt-6 text-sm font-medium text-gray-500" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
        if (__VLS_ctx.playbackStep ===
            'word') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else if (__VLS_ctx.playbackStep ===
            'meaning') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-6 text-sm text-gray-400" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
    (__VLS_ctx.repeatCount);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mt-8 flex flex-wrap justify-center gap-3" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.previous) },
        type: "button",
        ...{ class: "rounded-lg border px-4 py-2 hover:bg-gray-50" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-gray-50']} */ ;
    if (!__VLS_ctx.isPlaying) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.start) },
            type: "button",
            ...{ class: "rounded-lg bg-black px-6 py-2 text-white hover:bg-gray-800" },
        });
        /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
        /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
        /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
        /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
        /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.stop) },
            type: "button",
            ...{ class: "rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700" },
        });
        /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
        /** @type {__VLS_StyleScopedClasses['bg-red-600']} */ ;
        /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
        /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
        /** @type {__VLS_StyleScopedClasses['hover:bg-red-700']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.next) },
        type: "button",
        ...{ class: "rounded-lg border px-4 py-2 hover:bg-gray-50" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-gray-50']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.repeatCurrent) },
        type: "button",
        ...{ class: "rounded-lg border px-4 py-2 hover:bg-gray-50" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-gray-50']} */ ;
    const __VLS_0 = HardWordButton;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        wordId: (__VLS_ctx.currentWord.word),
        meaning: (__VLS_ctx.currentWord.meaning),
    }));
    const __VLS_2 = __VLS_1({
        wordId: (__VLS_ctx.currentWord.word),
        meaning: (__VLS_ctx.currentWord.meaning),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else if (!__VLS_ctx.loading &&
    __VLS_ctx.mode === 'hard') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rounded-xl border border-dashed p-12 text-center" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text-5xl" },
    });
    /** @type {__VLS_StyleScopedClasses['text-5xl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "mt-4 text-lg font-semibold text-gray-700" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-700']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mx-auto mt-2 max-w-md text-sm text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
    /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.loading &&
                    __VLS_ctx.currentWord))
                    throw 0;
                if (!(!__VLS_ctx.loading &&
                    __VLS_ctx.mode === 'hard'))
                    throw 0;
                return (__VLS_ctx.changeMode('lesson'));
                // @ts-ignore
                [changeMode, mode, mode, mode, mode, mode, allHardWords, loading, loading, loading, playableWords, playableWords, currentNumber, total, progressPercent, progressPercent, currentWord, currentWord, currentWord, currentWord, currentWord, currentWord, currentWord, lesson, lesson, currentIndex, isPlaying, isPlaying, playbackStep, playbackStep, repeatCount, previous, start, stop, next, repeatCurrent,];
            } },
        type: "button",
        ...{ class: "mt-6 rounded-lg bg-black px-5 py-2 text-sm text-white hover:bg-gray-800" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-5']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
}
else if (!__VLS_ctx.loading &&
    __VLS_ctx.mode === 'lesson') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rounded-xl border border-dashed p-12 text-center text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
}
// @ts-ignore
[mode, loading,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
