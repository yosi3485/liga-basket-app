<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError
} from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type TeamRow = {
  id: string
  name: string
}

const emit = defineEmits<{
  (e: 'created'): void
}>()

const teams = ref<TeamRow[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const playerName = ref('')
const teamId = ref('')
const jerseyNumber = ref<number | null>(null)
const email = ref('')
const password = ref('')

async function loadTeams() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .order('name', { ascending: true })

    if (error) throw error

    teams.value = data ?? []

    if (!teamId.value && teams.value.length) {
      teamId.value = teams.value[0].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando equipos'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  playerName.value = ''
  teamId.value = teams.value[0]?.id ?? ''
  jerseyNumber.value = null
  email.value = ''
  password.value = ''
}

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!playerName.value.trim()) {
    errorMessage.value = 'Debes escribir el nombre del jugador.'
    return
  }

  if (!teamId.value) {
    errorMessage.value = 'Debes seleccionar un equipo.'
    return
  }

  if (!email.value.trim()) {
    errorMessage.value = 'Debes escribir el email del jugador.'
    return
  }

  if (!password.value.trim() || password.value.trim().length < 6) {
    errorMessage.value = 'La contraseña temporal debe tener al menos 6 caracteres.'
    return
  }

  saving.value = true

  try {
    const { data, error } = await supabase.functions.invoke('create-player-with-access', {
      body: {
        playerName: playerName.value.trim(),
        teamId: teamId.value,
        jerseyNumber: jerseyNumber.value,
        email: email.value.trim(),
        password: password.value.trim()
      }
    })

    if (error) throw error
    if (data?.error) throw new Error(data.error)

    successMessage.value = `Jugador creado y vinculado correctamente. Acceso: ${data.email}`
    resetForm()
    emit('created')
  } catch (error) {
    if (error instanceof FunctionsHttpError) {
      const errorResponse = await error.context.json()
      errorMessage.value = errorResponse.error ?? 'La función devolvió un error HTTP'
    } else if (error instanceof FunctionsRelayError) {
      errorMessage.value = 'Error de relay al hablar con la Edge Function'
    } else if (error instanceof FunctionsFetchError) {
      errorMessage.value = 'No se pudo alcanzar la Edge Function'
    } else {
      errorMessage.value =
          error instanceof Error ? error.message : 'Error creando jugador con acceso'
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadTeams()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Alta rápida de jugador</h2>
        <p class="text-body-secondary mb-0">
          Crea el jugador con su acceso de login en un solo paso.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando equipos...</p>

      <template v-else>
        <div v-if="errorMessage" class="alert alert-danger" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label">Nombre del jugador</label>
            <input v-model="playerName" type="text" class="form-control" />
          </div>

          <div class="col-12 col-md-6">
            <label class="form-label">Equipo</label>
            <select v-model="teamId" class="form-select">
              <option value="">Selecciona equipo</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="col-12 col-md-4">
            <label class="form-label">Número (opcional)</label>
            <input
                :value="jerseyNumber ?? ''"
                type="number"
                class="form-control"
                @input="jerseyNumber = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null" />
          </div>

          <div class="col-12 col-md-4">
            <label class="form-label">Email</label>
            <input v-model="email" type="email" class="form-control" />
          </div>

          <div class="col-12 col-md-4">
            <label class="form-label">Contraseña temporal</label>
            <input v-model="password" type="text" class="form-control" />
          </div>

          <div class="col-12">
            <button
                type="button"
                class="btn btn-dark"
                :disabled="saving"
                @click="handleSubmit">
              {{ saving ? 'Creando...' : 'Crear jugador con acceso' }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
