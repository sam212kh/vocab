<script setup lang="ts">
import { computed } from 'vue'

import type { Word } from '../../types/vocabulary'

import { useHardWordsStore } from '../../stores/hardWords'
import { useWordProgressStore } from '../../stores/wordProgress'
import  HardWordButton from './HardWordButton.vue'
import SpeechButton from '../ui/SpeechButton.vue'
import ContextText from '../context/ContextText.vue'

const props = defineProps<{
    word: Word
    index: number
}>()

const hardWordsStore =
    useHardWordsStore()

const wordProgressStore =
    useWordProgressStore()

const isHardWord = computed(() => {
    return hardWordsStore.isHardWord(
        props.word.word
    )
})

const progress = computed(() => {
    return wordProgressStore.getProgress(
        props.word.word,
        props.word.courseId,
        String(props.word.lessonId)
    )
})

</script>

<template>
    <article
        class="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
    >
        <!-- Header -->
        <div
            class="flex items-start justify-between gap-4"
        >
            <div
                class="flex min-w-0 items-center gap-3"
            >
                <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600"
                >
                    {{ index + 1 }}
                </span>

                <div
                    class="flex min-w-0 items-center gap-2"
                >
                    <h2
                        class="text-2xl font-bold"
                    >
                        {{ word.word }}
                    </h2>

                    <SpeechButton
                        :text="word.word"
                        lang="en-US"
                        label="🔊"
                    />
                </div>
            </div>

            <HardWordButton :word-id="word.word" />
        </div>

        <!-- Meaning -->
        <div class="mt-5">
            <div
                class="flex items-center gap-2"
            >
                <p
                    class="text-lg font-medium text-gray-700"
                >
                    {{ word.meaning }}
                </p>

                <SpeechButton
                    :text="word.meaning"
                    lang="fa-IR"
                    label="🔊"
                />
            </div>
        </div>

        <!-- Synonyms -->
        <div
            v-if="word.synonyms.length"
            class="mt-5"
        >
            <h3
                class="text-sm font-semibold text-gray-500"
            >
                Synonyms
            </h3>

            <div
                class="mt-2 flex flex-wrap gap-2"
            >
                <span
                    v-for="synonym in word.synonyms"
                    :key="synonym"
                    class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                >
                    {{ synonym }}
                </span>
            </div>
        </div>

        <!-- Examples -->
        <div
            v-if="word.examples.length"
            class="mt-6"
        >
            <h3
                class="text-sm font-semibold text-gray-500"
            >
                Examples
            </h3>

            <div
                class="mt-3 space-y-4"
            >
                <div
                    v-for="(
                        example,
                        exampleIndex
                    ) in word.examples"
                    :key="`${word.word}-${exampleIndex}`"
                    class="rounded-xl bg-gray-50 p-4"
                >
                    <div
                        class="flex items-start gap-2"
                    >
                        <p
                            class="flex-1 leading-7 text-gray-800"
                        >
                            {{ example.english }}
                        </p>

                        <SpeechButton
                            :text="
                                example.english
                            "
                            lang="en-US"
                            label="🔊"
                        />
                    </div>

                    <div
                        class="mt-2 flex items-start gap-2"
                    >
                        <p
                            class="flex-1 text-sm leading-6 text-gray-500"
                        >
                            {{ example.persian }}
                        </p>

                        <SpeechButton
                            :text="
                                example.persian
                            "
                            lang="fa-IR"
                            label="🔊"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Mini Context -->
        <div
            v-if="word.miniContext"
            class="mt-6"
        >
            <h3
                class="mb-3 text-sm font-semibold text-gray-500"
            >
                Mini Context
            </h3>

            <ContextText
                :word="word"
            />
        </div>

        <!-- Progress -->
        <div
            v-if="isHardWord"
            class="mt-6 border-t pt-5"
        >
            <div
                class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500"
            >
                <span>
                    Status:
                    <strong
                        class="text-gray-700"
                    >
                        {{ progress.status }}
                    </strong>
                </span>

                <span>
                    Level:
                    <strong
                        class="text-gray-700"
                    >
                        {{ progress.level }}
                    </strong>
                </span>

                <span>
                    Correct:
                    <strong
                        class="text-gray-700"
                    >
                        {{ progress.correctAnswers }}
                    </strong>
                </span>

                <span>
                    Wrong:
                    <strong
                        class="text-gray-700"
                    >
                        {{ progress.wrongAnswers }}
                    </strong>
                </span>
            </div>
        </div>
    </article>
</template>