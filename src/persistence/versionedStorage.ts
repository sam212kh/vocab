/**
 * Generic versioned localStorage repository.
 *
 * Keeps domain stores free of direct localStorage/JSON handling and gives
 * every persisted value a `{ __version, data }` envelope so future shape
 * changes can migrate forward instead of silently corrupting old data.
 *
 * Data written before this envelope existed (plain arrays/objects with no
 * `__version`) is treated as legacy input to `migrate()` with
 * `storedVersion: null` — this is how existing user data (word progress,
 * hard words) upgrades to the new format on first load, with zero data loss
 * and no explicit one-off migration script.
 */

export interface RepositoryConfig<T> {
    key: string
    version: number
    defaultValue: () => T
    /**
     * Normalize/upgrade whatever was actually in storage into the current
     * shape `T`. Called with `storedVersion: null` for pre-envelope legacy
     * data, or the envelope's recorded version otherwise. Must be defensive
     * — storage can contain anything (corrupted JSON already handled by the
     * caller, but partial/foreign shapes are not).
     */
    migrate: (raw: unknown, storedVersion: number | null) => T
}

export interface LoadResult<T> {
    value: T
    migratedFromLegacy: boolean
}

interface Envelope {
    __version: number
    data: unknown
}

function isEnvelope(value: unknown): value is Envelope {
    return (
        !!value &&
        typeof value === 'object' &&
        '__version' in value &&
        'data' in value
    )
}

export interface Repository<T> {
    load(): LoadResult<T>
    save(value: T): void
    clear(): void
}

export function createVersionedRepository<T>(
    config: RepositoryConfig<T>
): Repository<T> {
    function load(): LoadResult<T> {
        try {
            const raw = localStorage.getItem(config.key)

            if (!raw) {
                return { value: config.defaultValue(), migratedFromLegacy: false }
            }

            const parsed = JSON.parse(raw) as unknown

            if (isEnvelope(parsed)) {
                return {
                    value: config.migrate(parsed.data, parsed.__version),
                    migratedFromLegacy: false,
                }
            }

            return {
                value: config.migrate(parsed, null),
                migratedFromLegacy: true,
            }
        } catch {
            return { value: config.defaultValue(), migratedFromLegacy: false }
        }
    }

    function save(value: T): void {
        const envelope: Envelope = {
            __version: config.version,
            data: value,
        }

        localStorage.setItem(config.key, JSON.stringify(envelope))
    }

    function clear(): void {
        localStorage.removeItem(config.key)
    }

    return { load, save, clear }
}
