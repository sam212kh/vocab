import type { WritingPrompt, WritingPromptType } from '../types/writing'

export type WritingBand = 'A1' | 'A2' | 'B1' | 'B2'
export type WritingStage = 'understand' | 'vocabulary' | 'structure' | 'guided' | 'independent' | 'transfer'

const BAND_ORDER: WritingBand[] = ['A1', 'A2', 'B1', 'B2']

export function writingBandFor(level: string | undefined): WritingBand | null {
    const match = level?.toUpperCase().match(/A1|A2|B1|B2/)
    return (match?.[0] as WritingBand | undefined) ?? null
}

export function buildWritingCurriculum(prompts: readonly WritingPrompt[]): WritingPrompt[] {
    return prompts
        .map((prompt, index) => ({ prompt, index, band: writingBandFor(prompt.cefrLevel) }))
        .sort((a, b) => {
            const bandDelta = (a.band ? BAND_ORDER.indexOf(a.band) : BAND_ORDER.length) -
                (b.band ? BAND_ORDER.indexOf(b.band) : BAND_ORDER.length)
            if (bandDelta !== 0) return bandDelta
            return (a.prompt.difficulty ?? 0) - (b.prompt.difficulty ?? 0) || a.index - b.index
        })
        .map(item => item.prompt)
}

const STAGES_BY_TYPE: Record<WritingPromptType, WritingStage[]> = {
    sentence: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
    paragraph: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
    journal: ['understand', 'vocabulary', 'structure', 'independent', 'transfer'],
    email: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
    professional: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
    opinion: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
    summary: ['understand', 'vocabulary', 'structure', 'independent', 'transfer'],
    technical: ['understand', 'vocabulary', 'structure', 'independent', 'transfer'],
    essay: ['understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer'],
}

export function writingStagesFor(promptType: WritingPromptType): WritingStage[] {
    return STAGES_BY_TYPE[promptType]
}
