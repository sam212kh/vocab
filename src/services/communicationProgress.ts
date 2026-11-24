import type { GapDimension } from '../types/skillGap'

export interface CommunicationMetricDefinition {
    id: string
    label: string
    labelPersian: string
    dimension: GapDimension
    note: string
    notePersian: string
}

/**
 * Communication indicators are labels over existing evidence dimensions.
 * They are not new scores and do not claim a CEFR or fluency percentage.
 */
export const COMMUNICATION_METRICS: CommunicationMetricDefinition[] = [
    {
        id: 'everyday-communication',
        label: 'Everyday communication',
        labelPersian: 'ارتباط روزمره',
        dimension: 'sentenceConstruction',
        note: 'Unaided sentence construction in contextual activities.',
        notePersian: 'ساخت جمله بدون کمک در فعالیت‌های بافت‌محور.',
    },
    {
        id: 'conversation-participation',
        label: 'Conversation participation',
        labelPersian: 'مشارکت در گفتگو',
        dimension: 'speakingFluency',
        note: 'Real voice attempts only; typed answers are not counted.',
        notePersian: 'فقط تلاش‌های صوتی واقعی؛ پاسخ‌های تایپی حساب نمی‌شوند.',
    },
    {
        id: 'independent-production',
        label: 'Independent sentence production',
        labelPersian: 'تولید مستقل جمله',
        dimension: 'sentenceConstruction',
        note: 'Sentences produced without a copied model.',
        notePersian: 'جمله‌هایی که بدون کپی‌کردن از الگو تولید شده‌اند.',
    },
    {
        id: 'contextual-usage',
        label: 'Contextual expression usage',
        labelPersian: 'کاربرد عبارت در بافت',
        dimension: 'contextualUsage',
        note: 'Learned patterns used in a new situation.',
        notePersian: 'الگوهای یادگرفته‌شده در یک موقعیت جدید به کار رفته‌اند.',
    },
    {
        id: 'listening-to-speaking',
        label: 'Listening-to-speaking transfer',
        labelPersian: 'انتقال از شنیدن به گفتار',
        dimension: 'speakingFluency',
        note: 'Speaking evidence is shown; a transfer claim is not made without both sides of the evidence.',
        notePersian: 'شواهد گفتار نمایش داده می‌شود؛ بدون هر دو بخش شواهد، ادعای انتقال مطرح نمی‌شود.',
    },
    {
        id: 'professional-communication',
        label: 'Professional communication',
        labelPersian: 'ارتباط حرفه‌ای',
        dimension: 'naturalExpression',
        note: 'Natural expression evidence; the app does not infer workplace mastery from it alone.',
        notePersian: 'شواهد بیان طبیعی؛ برنامه فقط از این مورد به‌تنهایی تسلط کاری را نتیجه نمی‌گیرد.',
    },
]
