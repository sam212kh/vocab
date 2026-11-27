import { exerciseKey } from './evidenceBridge'

import type { EvidenceInput } from '../types/evidence'
import type { WritingSubmission } from '../types/writing'

export type WritingEvidenceQuality = 'deterministic' | 'ai-verified'

/** Maps a writing attempt onto the shared evidence ledger. */
export function writingEvidenceInput(
    promptId: string,
    correct: boolean,
    assistanceLevels: WritingSubmission['assistanceLevels'],
    quality: WritingEvidenceQuality,
    at = Date.now(),
): EvidenceInput {
    return {
        key: exerciseKey(promptId),
        kind: 'exercise',
        mode: 'production',
        ok: correct,
        independent: assistanceLevels.length === 0,
        verified: quality === 'ai-verified',
        ctx: promptId,
        skill: 'writing',
        q: correct ? 'correct' : 'needs-correction',
        at,
    }
}
