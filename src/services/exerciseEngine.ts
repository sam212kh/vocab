import { answersMatch, normalizeAnswer } from './textMatch'

import type {
    Exercise,
    ExerciseAnswer,
    ExerciseResult,
} from '../types/exercise'

/**
 * Pure validation for every exercise type in the unified model. No store
 * access, no side effects — callers (views / performance tracking) decide
 * what to do with the result. Text answers reuse the same typo-tolerant
 * matching the vocabulary views already use (services/textMatch).
 */
export function validateAnswer(
    exercise: Exercise,
    answer: ExerciseAnswer
): ExerciseResult {
    switch (exercise.type) {
        case 'multiple-choice':
        case 'listening-comprehension':
        case 'reading-comprehension': {
            const expected = exercise.options[exercise.correctIndex] ?? ''

            if (answer.kind !== 'choice') {
                return wrongShape(exercise.id, expected)
            }

            return {
                exerciseId: exercise.id,
                correct: answer.index === exercise.correctIndex,
                expected,
                received: exercise.options[answer.index] ?? '(no answer)',
                feedback: exercise.explanation,
            }
        }

        case 'fill-blank':
        case 'translation':
        case 'short-answer':
        case 'dictation':
        case 'grammar-correction': {
            const accepted = exercise.acceptedAnswers
            const expected = accepted[0] ?? ''

            if (answer.kind !== 'text') {
                return wrongShape(exercise.id, expected)
            }

            const correct = accepted.some(candidate =>
                answersMatch(candidate, answer.text)
            )

            return {
                exerciseId: exercise.id,
                correct,
                expected,
                received: answer.text.trim() || '(no answer)',
                feedback: exercise.explanation,
            }
        }

        case 'sentence-ordering': {
            const expected = exercise.segments.join(' ')

            if (answer.kind !== 'ordering') {
                return wrongShape(exercise.id, expected)
            }

            const correct =
                answer.order.length === exercise.segments.length &&
                answer.order.every((segmentIndex, position) => segmentIndex === position)

            const received = answer.order
                .map(segmentIndex => exercise.segments[segmentIndex] ?? '?')
                .join(' ')

            return {
                exerciseId: exercise.id,
                correct,
                expected,
                received,
                feedback: exercise.explanation,
            }
        }

        case 'matching': {
            const expected = exercise.pairs
                .map(pair => `${pair.left} → ${pair.right}`)
                .join(', ')

            if (answer.kind !== 'matching') {
                return wrongShape(exercise.id, expected)
            }

            const correct =
                answer.matches.length === exercise.pairs.length &&
                answer.matches.every(
                    match => match.leftIndex === match.rightIndex
                )

            return {
                exerciseId: exercise.id,
                correct,
                expected,
                received: correct ? expected : 'one or more pairs mismatched',
                feedback: exercise.explanation,
            }
        }

        case 'writing-response': {
            if (answer.kind !== 'text') {
                return wrongShape(exercise.id, '(a written response)')
            }

            const issues = checkWritingConstraints(
                answer.text,
                exercise.minWords,
                exercise.maxWords,
                exercise.requiredElements
            )

            /*
             * "Correct" here means only "meets the deterministic constraints"
             * (length, required elements) — it is NOT a quality judgement.
             * Real feedback on grammar/naturalness waits for the AI service.
             */
            return {
                exerciseId: exercise.id,
                correct: issues.length === 0,
                expected: '(a response meeting the task constraints)',
                received: answer.text.trim() || '(no answer)',
                feedback: issues.length ? issues.join(' ') : exercise.explanation,
            }
        }
    }
}

function wrongShape(exerciseId: string, expected: string): ExerciseResult {
    return {
        exerciseId,
        correct: false,
        expected,
        received: '(invalid answer type)',
    }
}

export function countWords(text: string): number {
    const trimmed = text.trim()

    return trimmed ? trimmed.split(/\s+/).length : 0
}

function checkWritingConstraints(
    text: string,
    minWords?: number,
    maxWords?: number,
    requiredElements?: string[]
): string[] {
    const issues: string[] = []

    const words = countWords(text)

    if (minWords !== undefined && words < minWords) {
        issues.push(`Write at least ${minWords} words (currently ${words}).`)
    }

    if (maxWords !== undefined && words > maxWords) {
        issues.push(`Keep it under ${maxWords} words (currently ${words}).`)
    }

    if (requiredElements?.length) {
        const normalized = normalizeAnswer(text)

        for (const element of requiredElements) {
            if (!normalized.includes(normalizeAnswer(element))) {
                issues.push(`Try to use "${element}" in your response.`)
            }
        }
    }

    return issues
}

export function shuffle<T>(items: T[]): T[] {
    const result = [...items]

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }

    return result
}
