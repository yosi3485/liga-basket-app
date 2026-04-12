import { computed, ref } from 'vue'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

const session = ref<Session | null>(null)
const isAdmin = ref(false)
const initialized = ref(false)
const authError = ref('')

let authListenerInitialized = false

async function refreshAuthState() {
    authError.value = ''

    try {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
            throw error
        }

        session.value = data.session

        if (!data.session) {
            isAdmin.value = false
            return
        }

        const { data: adminRows, error: adminError } = await supabase
            .from('admin_users')
            .select('user_id')
            .eq('user_id', data.session.user.id)
            .limit(1)

        if (adminError) {
            throw adminError
        }

        isAdmin.value = (adminRows?.length ?? 0) > 0
    } catch (error) {
        session.value = null
        isAdmin.value = false
        authError.value =
            error instanceof Error ? error.message : 'Error comprobando sesión'
    } finally {
        initialized.value = true
    }
}

function initAuthListener() {
    if (authListenerInitialized) return
    authListenerInitialized = true

    supabase.auth.onAuthStateChange((_event, newSession) => {
        session.value = newSession
        refreshAuthState()
    })
}

export function useAuth() {
    initAuthListener()

    return {
        session: computed(() => session.value),
        isAdmin: computed(() => isAdmin.value),
        initialized: computed(() => initialized.value),
        authError: computed(() => authError.value),
        refreshAuthState
    }
}
