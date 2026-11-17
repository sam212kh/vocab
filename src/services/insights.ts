import { DIMENSION_LABEL, DIMENSION_LABEL_FA } from './skillGap'

import type { GapAction, SkillGapReport } from '../types/skillGap'
import type { RetentionReport } from './retention'

/**
 * Evidence-based insights. PURE. Every insight is produced by a rule over real
 * evidence, states WHY it was produced, and exists in English and Persian.
 * With too little evidence the only insight is an honest "not enough yet".
 */

export type InsightKind = 'attention' | 'progress' | 'strength' | 'info'

export interface Insight {
    id: string
    kind: InsightKind
    text: string
    textPersian: string
    /** The evidence behind this message — shown to the learner. */
    why: string
    action: GapAction | null
}

/** Below this many independent observations overall, we do not interpret anything. */
export const MIN_TOTAL_OBSERVATIONS = 20

export function generateInsights(gaps: SkillGapReport, retention: RetentionReport): Insight[] {
    const insights: Insight[] = []
    const totalObservations = gaps.dimensions.reduce((sum, d) => sum + d.observations, 0)

    if (totalObservations < MIN_TOTAL_OBSERVATIONS) {
        return [{
            id: 'not-enough-evidence',
            kind: 'info',
            text: 'There is not enough independent evidence yet to judge your strengths and weaknesses. A few Daily Journeys will change that.',
            textPersian: 'هنوز شواهد مستقل کافی برای ارزیابی نقاط قوت و ضعف تو وجود ندارد. چند «سفر روزانه» این را تغییر می‌دهد.',
            why: `${totalObservations} independent answers so far; at least ${MIN_TOTAL_OBSERVATIONS} are needed before anything is interpreted. Hints, AI help and copied answers are not counted.`,
            action: { label: 'Start a Daily Journey', to: '/daily-journey' },
        }]
    }

    const PATTERN_TEXT: Record<string, { text: string; fa: string }> = {
        'recognition-without-recall': { text: 'You recognize many words, but need more active recall practice.', fa: 'بسیاری از واژه‌ها را می‌شناسی، اما به تمرین یادآوری فعال بیشتری نیاز داری.' },
        'correct-but-unnatural': { text: 'Your sentence structure is improving, but natural expression needs attention.', fa: 'ساختار جمله‌هایت بهتر می‌شود، اما بیان طبیعی به توجه بیشتری نیاز دارد.' },
        'reading-over-listening': { text: 'You understand written English better than spoken English.', fa: 'انگلیسی نوشتاری را بهتر از انگلیسی گفتاری می‌فهمی.' },
        'choice-without-production': { text: 'You choose correct answers well, but producing sentences yourself is harder.', fa: 'پاسخ درست را خوب انتخاب می‌کنی، اما ساختن جمله توسط خودت دشوارتر است.' },
        'no-transfer': { text: 'You should practice using learned expressions in unfamiliar situations.', fa: 'باید کاربرد عبارت‌های یادگرفته‌شده را در موقعیت‌های ناآشنا تمرین کنی.' },
    }

    for (const pattern of gaps.patterns) {
        const copy = PATTERN_TEXT[pattern.id]

        insights.push({
            id: pattern.id,
            kind: 'attention',
            text: copy.text,
            textPersian: copy.fa,
            why: `${pattern.detail} Both measured from independent answers (at least 8 each, on 2+ days).`,
            action: pattern.action,
        })
    }

    for (const dimension of gaps.dimensions) {
        if (dimension.trend === 'improving' && dimension.classification !== 'insufficient') {
            const recent = Math.round((dimension.recent.successes / dimension.recent.observations) * 100)
            const earlier = Math.round((dimension.earlier.successes / dimension.earlier.observations) * 100)

            insights.push({
                id: `improving-${dimension.dimension}`,
                kind: 'progress',
                text: `${DIMENSION_LABEL[dimension.dimension]} is improving.`,
                textPersian: `${DIMENSION_LABEL_FA[dimension.dimension]} در حال بهتر شدن است.`,
                why: `Last 14 days: ${recent}% (${dimension.recent.observations} answers) vs ${earlier}% before (${dimension.earlier.observations} answers).`,
                action: null,
            })
        }

        if (dimension.trend === 'declining') {
            insights.push({
                id: `declining-${dimension.dimension}`,
                kind: 'attention',
                text: `${DIMENSION_LABEL[dimension.dimension]} has dipped recently.`,
                textPersian: `${DIMENSION_LABEL_FA[dimension.dimension]} اخیراً افت کرده است.`,
                why: `Last 14 days: ${dimension.recent.successes} of ${dimension.recent.observations} correct, against ${dimension.earlier.successes} of ${dimension.earlier.observations} earlier.`,
                action: dimension.recommendation,
            })
        }
    }

    const week = retention.perHorizon.find(row => row.horizon === 7)!
    const tested = week.retained + week.lost

    if (tested >= 5 && week.lost / tested >= 0.4) {
        insights.push({
            id: 'forgetting-after-a-week',
            kind: 'attention',
            text: 'You often forget words after about a week. Keep your short spaced reviews going.',
            textPersian: 'اغلب بعد از حدود یک هفته واژه‌ها را فراموش می‌کنی. مرورهای کوتاه و فاصله‌دار را ادامه بده.',
            why: `${week.lost} of ${tested} words tested a week after first recall were not remembered.`,
            action: { label: 'Review due words', to: '/session' },
        })
    }

    if (retention.srsOptimistic.length >= 3) {
        insights.push({
            id: 'srs-optimistic',
            kind: 'info',
            text: `${retention.srsOptimistic.length} words are marked "mastered" by the review schedule, but you have not shown them independently yet.`,
            textPersian: `${retention.srsOptimistic.length} واژه در برنامهٔ مرور «تسلط‌یافته» علامت خورده‌اند، اما هنوز مستقل نشان نداده‌ای که آن‌ها را می‌دانی.`,
            why: 'Completing scheduled reviews is not the same as proving recall: these words lack two independent recalls on different days.',
            action: { label: 'Recall them actively', to: '/practice' },
        })
    }

    if (retention.missedReviews.length >= 5) {
        insights.push({
            id: 'missed-reviews',
            kind: 'attention',
            text: `${retention.missedReviews.length} reviews are more than a week overdue.`,
            textPersian: `${retention.missedReviews.length} مرور بیش از یک هفته عقب افتاده است.`,
            why: 'Scheduled reviews were not done; words you have not seen for a long time are the most likely to be forgotten.',
            action: { label: 'Start a review', to: '/session' },
        })
    }

    for (const dimension of gaps.dimensions) {
        if (dimension.classification === 'strength') {
            insights.push({
                id: `strength-${dimension.dimension}`,
                kind: 'strength',
                text: `${DIMENSION_LABEL[dimension.dimension]} is a strength.`,
                textPersian: `${DIMENSION_LABEL_FA[dimension.dimension]} نقطهٔ قوت توست.`,
                why: dimension.why,
                action: null,
            })
        }
    }

    const order: Record<InsightKind, number> = { attention: 0, progress: 1, info: 2, strength: 3 }

    return insights.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 6)
}

