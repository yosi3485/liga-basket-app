<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showLoginForm = ref(false)

const { session, isAdmin, initialized, authError, refreshAuthState } = useAuth()

async function signIn() {
  errorMessage.value = ''
  successMessage.value = ''
  loading.value = true

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (error) throw error

    successMessage.value = 'Sesión iniciada correctamente.'
    showLoginForm.value = false
    await refreshAuthState()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error iniciando sesión'
  } finally {
    loading.value = false
  }
}

async function signOut() {
  errorMessage.value = ''
  successMessage.value = ''
  loading.value = true

  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    successMessage.value = 'Sesión cerrada.'
    await refreshAuthState()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cerrando sesión'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshAuthState()
})
</script>

<template>
  <section class="card shadow-sm mb-4">
    <div class="card-body">
      <div v-if="!initialized" class="small text-muted">
        Comprobando sesión...
      </div>

      <template v-else-if="session">
        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div class="d-flex align-items-center gap-2">
    <span class="badge text-bg-dark">
      <i class="fa-solid fa-user me-1"></i>
      {{ session.user.email }}
    </span>

            <span
                class="badge"
                :class="isAdmin ? 'text-bg-success' : 'text-bg-secondary'">
      {{ isAdmin ? 'Admin' : 'Solo lectura' }}
    </span>
          </div>

          <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="loading"
              @click="signOut">
            {{ loading ? 'Cerrando...' : 'Salir' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div>
            <div class="fw-semibold">Acceso administrador</div>
            <div class="small text-muted">
              Inicia sesión para editar contenido.
            </div>
          </div>

          <button
              type="button"
              class="btn btn-dark btn-sm"
              @click="showLoginForm = !showLoginForm">
            {{ showLoginForm ? 'Ocultar' : 'Iniciar sesión' }}
          </button>
        </div>

        <div v-if="showLoginForm" class="mt-3">
          <div class="row g-3">
            <div class="col-12 col-lg-5">
              <label for="auth-email" class="form-label">Email</label>
              <input
                  id="auth-email"
                  v-model="email"
                  type="email"
                  class="form-control"
                  placeholder="tuemail@email.com" />
            </div>

            <div class="col-12 col-lg-5">
              <label for="auth-password" class="form-label">Contraseña</label>
              <input
                  id="auth-password"
                  v-model="password"
                  type="password"
                  class="form-control"
                  placeholder="••••••••" />
            </div>

            <div class="col-12 col-lg-2 d-grid">
              <label class="form-label d-none d-lg-block">&nbsp;</label>
              <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="loading"
                  @click="signIn">
                {{ loading ? 'Entrando...' : 'Entrar' }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="alert alert-success mt-3 mb-0" role="alert">
        {{ successMessage }}
      </div>

      <div v-if="authError" class="alert alert-warning mt-3 mb-0" role="alert">
        Error verificando permisos: {{ authError }}
      </div>
    </div>
  </section>
</template>
