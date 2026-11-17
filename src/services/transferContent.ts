import type { TransferManifest, TransferPattern } from '../types/transfer'

/** Loads the transfer pattern library. Optional content: callers treat failure as "no transfer tasks". */
export async function loadTransferPatterns(): Promise<TransferPattern[]> {
    const response = await fetch('/data/transfer/patterns.json')

    if (!response.ok) throw new Error(`Could not load transfer patterns (${response.status})`)

    const manifest = (await response.json()) as TransferManifest

    if (!manifest || !Array.isArray(manifest.patterns)) throw new Error('Invalid transfer pattern format')

    return manifest.patterns
}
