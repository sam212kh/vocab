import { computed, onMounted, ref } from 'vue';
import { useWordProgressStore } from '../stores/wordProgress';
import { checkPronunciation, } from '../services/pronunciation';
import { answersMatch, } from '../services/textMatch';
import { useSpeakingPractice, } from '../composables/useSpeakingPractice';
import { loadManifest, loadLesson, } from '../services/vocabulary';
import SpeechButton from '../components/ui/SpeechButton.vue';
/*
 * One daily session mixes words that are due for
 * spaced-repetition review with a handful of brand
 * new words, shuffled together. Studying old and new
 * material interleaved (rather than one lesson block
 * at a time) is the "interleaving effect" — it forces
 * active discrimination between items instead of
 * passive repetition of a single topic.
 */
const NEW_WORD_QUOTA = 5;
const MAX_LESSONS_SCANNED_FOR_NEW_WORDS = 20;
const wordProgressStore = useWordProgressStore();
const { isSupported, isListening, transcript, error: speechError, startListening, reset, } = useSpeakingPractice();
const words = ref([]);
const currentIndex = ref(0);
const loading = ref(false);
const error = ref('');
const isCompleted = ref(false);
const dueCount = ref(0);
const newCount = ref(0);
const phase = ref('recall');
const pronunciationScore = ref(null);
const pronunciationCorrect = ref(false);
const answerRecorded = ref(false);
const recallAnswer = ref('');
const recallRevealed = ref(false);
const recallCorrect = ref(false);
const currentWord = computed(() => {
    return (words.value[currentIndex.value] ?? null);
});
const progressPercent = computed(() => {
    if (!words.value.length) {
        return 0;
    }
    return Math.round(((currentIndex.value + 1) /
        words.value.length) *
        100);
});
function shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
}
async function buildSession() {
    loading.value = true;
    error.value = '';
    isCompleted.value = false;
    resetPracticeState();
    try {
        const manifest = await loadManifest();
        const dueProgress = wordProgressStore.getDueWords();
        const requiredLessons = new Map();
        for (const item of dueProgress) {
            if (!item.courseId || !item.lessonId) {
                continue;
            }
            requiredLessons.set(`${item.courseId}:${item.lessonId}`, { courseId: item.courseId, lessonId: item.lessonId });
        }
        const dueWordIds = new Set(dueProgress.map(item => item.wordId));
        const dueWords = [];
        for (const { courseId, lessonId } of requiredLessons.values()) {
            const course = manifest.courses.find(c => c.id === courseId);
            const lesson = course?.lessons.find(l => l.id === lessonId);
            if (!lesson) {
                continue;
            }
            const lessonWords = await loadLesson(lesson);
            for (const word of lessonWords) {
                if (dueWordIds.has(word.word.trim().toLowerCase())) {
                    dueWords.push(word);
                }
            }
        }
        /*
         * Fill the rest of the quota with words that
         * have never been studied before.
         */
        const studiedWordIds = new Set(wordProgressStore.progress.map(item => item.wordId));
        const newWords = [];
        let lessonsScanned = 0;
        for (const course of manifest.courses) {
            for (const lesson of course.lessons) {
                if (newWords.length >= NEW_WORD_QUOTA) {
                    break;
                }
                if (lessonsScanned >= MAX_LESSONS_SCANNED_FOR_NEW_WORDS) {
                    break;
                }
                lessonsScanned++;
                const lessonWords = await loadLesson(lesson);
                for (const word of lessonWords) {
                    if (newWords.length >= NEW_WORD_QUOTA) {
                        break;
                    }
                    const normalized = word.word.trim().toLowerCase();
                    if (!studiedWordIds.has(normalized)) {
                        newWords.push(word);
                        studiedWordIds.add(normalized);
                    }
                }
            }
            if (newWords.length >= NEW_WORD_QUOTA) {
                break;
            }
        }
        dueCount.value = dueWords.length;
        newCount.value = newWords.length;
        words.value = shuffle([...dueWords, ...newWords]);
        currentIndex.value = 0;
        if (!words.value.length) {
            isCompleted.value = true;
        }
    }
    catch (err) {
        console.error(err);
        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to build session';
    }
    finally {
        loading.value = false;
    }
}
function resetPracticeState() {
    reset();
    phase.value = 'recall';
    pronunciationScore.value = null;
    pronunciationCorrect.value = false;
    answerRecorded.value = false;
    recallAnswer.value = '';
    recallRevealed.value = false;
    recallCorrect.value = false;
}
function submitRecall() {
    if (!currentWord.value || recallRevealed.value) {
        return;
    }
    recallRevealed.value = true;
    recallCorrect.value = answersMatch(currentWord.value.word, recallAnswer.value);
    const progress = wordProgressStore.getProgress(currentWord.value.word, currentWord.value.courseId, currentWord.value.lessonId);
    if (recallCorrect.value) {
        wordProgressStore.recordCorrect(currentWord.value.word, progress.courseId, progress.lessonId);
    }
    else {
        wordProgressStore.recordWrong(currentWord.value.word, progress.courseId, progress.lessonId);
    }
    answerRecorded.value = true;
}
function proceedToSpeak() {
    if (!currentWord.value) {
        return;
    }
    phase.value = 'speak';
}
async function practiceCurrentWord() {
    if (!currentWord.value || isListening.value) {
        return;
    }
    pronunciationScore.value = null;
    pronunciationCorrect.value = false;
    reset();
    await startListening();
    if (!transcript.value) {
        return;
    }
    const result = checkPronunciation(currentWord.value.word, transcript.value);
    pronunciationScore.value = result.score;
    pronunciationCorrect.value = result.correct;
    phase.value = 'result';
}
function skipSpeaking() {
    phase.value = 'result';
}
function nextWord() {
    resetPracticeState();
    if (!words.value.length) {
        return;
    }
    if (currentIndex.value < words.value.length - 1) {
        currentIndex.value++;
        return;
    }
    isCompleted.value = true;
}
function restart() {
    buildSession();
}
onMounted(() => {
    buildSession();
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
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "py-12 text-center text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['py-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
}
else if (__VLS_ctx.isCompleted) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mx-auto max-w-2xl rounded-2xl border bg-white p-12 text-center shadow-sm" },
    });
    /** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
    /** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text-5xl" },
    });
    /** @type {__VLS_StyleScopedClasses['text-5xl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "mt-6 text-2xl font-bold" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mt-3 text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
    (__VLS_ctx.dueCount);
    (__VLS_ctx.newCount);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.restart) },
        type: "button",
        ...{ class: "mt-8 rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800" },
    });
    /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
}
else if (__VLS_ctx.currentWord) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mx-auto max-w-2xl" },
    });
    /** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
    /** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-6" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mb-2 flex justify-between text-sm text-gray-500" },
    });
    /** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.currentIndex + 1);
    (__VLS_ctx.words.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.progressPercent);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "h-2 overflow-hidden rounded-full bg-gray-200" },
    });
    /** @type {__VLS_StyleScopedClasses['h-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-gray-200']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "h-full rounded-full bg-black transition-all duration-300" },
        ...{ style: ({ width: `${__VLS_ctx.progressPercent}%` }) },
    });
    /** @type {__VLS_StyleScopedClasses['h-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
    /** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
    /** @type {__VLS_StyleScopedClasses['duration-300']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "rounded-2xl border bg-white p-8 text-center shadow-sm" },
    });
    /** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
    /** @type {__VLS_StyleScopedClasses['border']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['p-8']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
    if (__VLS_ctx.phase === 'recall') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-sm font-medium uppercase tracking-wide text-gray-400" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
        /** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
        /** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            ...{ class: "mt-2 text-2xl font-bold" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mt-10" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-10']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-lg text-gray-600" },
        });
        /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
        (__VLS_ctx.currentWord.meaning);
        const __VLS_0 = SpeechButton;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            text: (__VLS_ctx.currentWord.meaning),
            lang: "fa-IR",
        }));
        const __VLS_2 = __VLS_1({
            text: (__VLS_ctx.currentWord.meaning),
            lang: "fa-IR",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        if (!__VLS_ctx.recallRevealed) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
                ...{ onSubmit: (__VLS_ctx.submitRecall) },
                ...{ class: "mt-8" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                autofocus: true,
                autocomplete: "off",
                placeholder: "Type the English word...",
                ...{ class: "w-full rounded-xl border px-4 py-4 text-center text-xl outline-none focus:border-gray-900" },
            });
            (__VLS_ctx.recallAnswer);
            /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['border']} */ ;
            /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-center']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['outline-none']} */ ;
            /** @type {__VLS_StyleScopedClasses['focus:border-gray-900']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                type: "submit",
                ...{ class: "mt-5 w-full rounded-xl bg-black px-8 py-3 text-white hover:bg-gray-800" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-5']} */ ;
            /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
            /** @type {__VLS_StyleScopedClasses['px-8']} */ ;
            /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
            /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mt-8" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "flex items-center justify-center gap-3" },
            });
            /** @type {__VLS_StyleScopedClasses['flex']} */ ;
            /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
            /** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
            /** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
                ...{ class: "text-4xl font-bold" },
            });
            /** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
            (__VLS_ctx.currentWord.word);
            const __VLS_5 = SpeechButton;
            // @ts-ignore
            const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
                text: (__VLS_ctx.currentWord.word),
                lang: "en-US",
            }));
            const __VLS_7 = __VLS_6({
                text: (__VLS_ctx.currentWord.word),
                lang: "en-US",
            }, ...__VLS_functionalComponentArgsRest(__VLS_6));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "mt-4 text-lg font-semibold" },
                ...{ class: (__VLS_ctx.recallCorrect ? 'text-green-600' : 'text-red-600') },
            });
            /** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
            /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
            (__VLS_ctx.recallCorrect
                ? '✅ Correct!'
                : `❌ You said: ${__VLS_ctx.recallAnswer || '(nothing)'}`);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.proceedToSpeak) },
                type: "button",
                ...{ class: "mt-8 rounded-lg bg-black px-8 py-3 text-white hover:bg-gray-800" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
            /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
            /** @type {__VLS_StyleScopedClasses['px-8']} */ ;
            /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
            /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
        }
    }
    else if (__VLS_ctx.phase === 'speak') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-sm font-medium uppercase tracking-wide text-gray-400" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
        /** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
        /** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            ...{ class: "mt-2 text-2xl font-bold" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "mt-10 text-4xl font-bold" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-10']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
        (__VLS_ctx.currentWord.word);
        if (!__VLS_ctx.isListening) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.practiceCurrentWord) },
                type: "button",
                ...{ class: "mt-10 rounded-full bg-black px-8 py-4 text-lg text-white hover:bg-gray-800 disabled:opacity-50" },
                disabled: (!__VLS_ctx.isSupported),
            });
            /** @type {__VLS_StyleScopedClasses['mt-10']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
            /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
            /** @type {__VLS_StyleScopedClasses['px-8']} */ ;
            /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
            /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
            /** @type {__VLS_StyleScopedClasses['disabled:opacity-50']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mt-10 rounded-lg bg-gray-100 px-8 py-4 text-gray-600" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-10']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
            /** @type {__VLS_StyleScopedClasses['bg-gray-100']} */ ;
            /** @type {__VLS_StyleScopedClasses['px-8']} */ ;
            /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
        }
        if (!__VLS_ctx.isSupported) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "mt-4 text-sm text-red-500" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-red-500']} */ ;
        }
        if (__VLS_ctx.speechError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "mt-4 text-sm text-red-500" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-red-500']} */ ;
            (__VLS_ctx.speechError);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mt-8" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.skipSpeaking) },
            type: "button",
            ...{ class: "text-sm text-gray-500 hover:text-black" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
        /** @type {__VLS_StyleScopedClasses['hover:text-black']} */ ;
    }
    else if (__VLS_ctx.phase === 'result') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text-sm font-medium uppercase tracking-wide text-gray-400" },
        });
        /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
        /** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
        /** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            ...{ class: "mt-2 text-2xl font-bold" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
        (__VLS_ctx.currentWord.word);
        if (__VLS_ctx.pronunciationScore !== null) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mt-8" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "text-5xl font-bold" },
            });
            /** @type {__VLS_StyleScopedClasses['text-5xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
            (__VLS_ctx.pronunciationScore);
            if (__VLS_ctx.pronunciationCorrect) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "mt-3 text-lg font-semibold text-green-600" },
                });
                /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
                /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
                /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
                /** @type {__VLS_StyleScopedClasses['text-green-600']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "mt-3 text-lg font-semibold text-red-600" },
                });
                /** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
                /** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
                /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
                /** @type {__VLS_StyleScopedClasses['text-red-600']} */ ;
            }
        }
        if (__VLS_ctx.transcript) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mt-6 rounded-xl bg-gray-50 p-4" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
            /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
            /** @type {__VLS_StyleScopedClasses['bg-gray-50']} */ ;
            /** @type {__VLS_StyleScopedClasses['p-4']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "text-sm text-gray-500" },
            });
            /** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
            /** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "mt-1 font-medium" },
            });
            /** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
            /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
            (__VLS_ctx.transcript);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.nextWord) },
            type: "button",
            ...{ class: "mt-8 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800" },
        });
        /** @type {__VLS_StyleScopedClasses['mt-8']} */ ;
        /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
        /** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
        /** @type {__VLS_StyleScopedClasses['bg-black']} */ ;
        /** @type {__VLS_StyleScopedClasses['px-4']} */ ;
        /** @type {__VLS_StyleScopedClasses['py-3']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-white']} */ ;
        /** @type {__VLS_StyleScopedClasses['hover:bg-gray-800']} */ ;
        (__VLS_ctx.currentIndex === __VLS_ctx.words.length - 1 ? 'Finish session' : 'Next word');
    }
}
// @ts-ignore
[error, error, loading, isCompleted, dueCount, newCount, restart, currentWord, currentWord, currentWord, currentWord, currentWord, currentWord, currentWord, currentIndex, currentIndex, words, words, progressPercent, progressPercent, phase, phase, phase, recallRevealed, submitRecall, recallAnswer, recallAnswer, recallCorrect, recallCorrect, proceedToSpeak, isListening, practiceCurrentWord, isSupported, isSupported, speechError, speechError, skipSpeaking, pronunciationScore, pronunciationScore, pronunciationCorrect, transcript, transcript, nextWord,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
