import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
    id: number
    message: string
    kind: ToastKind
}

const DEFAULT_DURATION_MS = 3500

export const useToastStore = defineStore('toast', () => {
    const toasts = ref<Toast[]>([])

    let nextId = 1

    function push(message: string, kind: ToastKind = 'info', durationMs = DEFAULT_DURATION_MS) {
        const id = nextId++

        toasts.value.push({ id, message, kind })

        if (durationMs > 0) {
            setTimeout(() => dismiss(id), durationMs)
        }

        return id
    }

    function dismiss(id: number) {
        toasts.value = toasts.value.filter(toast => toast.id !== id)
    }

    return {
        toasts,
        push,
        dismiss,
    }
})
