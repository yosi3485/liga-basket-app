<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError
} from '@supabase/supabase-js'

type TeamRow = {
  id: string
  name: string
}

type PlayerRow = {
  id: string
  name: string
  team_id: string
  jersey_number: number | null
  is_active: boolean
}

type InactiveSuggestedPlayerRow = {
  id: string
  name: string
  is_active: boolean
}

const { isAdmin } = useAuth()

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const inactiveSuggestedPlayers = ref<InactiveSuggestedPlayerRow[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const editingPlayerId = ref<string | null>(null)

const formName = ref('')
const formTeamId = ref('')
const formJerseyNumber = ref<number | null>(null)
const formIsActive = ref(true)
const formEmail = ref('')
const formPassword = ref('')

async function loadTeams() {
  const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  teams.value = data ?? []
}

async function loadPlayers() {
  const { data, error } = await supabase
      .from('players')
      .select('id, name, team_id, jersey_number, is_active')
      .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  players.value = data ?? []
}

async function loadInactiveSuggestions() {
  const { data, error } = await supabase
      .from('players_missing_last_3_matchdays')
      .select('*')

  if (error) {
    console.error('Error loading inactive player suggestions:', error.message)
    inactiveSuggestedPlayers.value = []
    return
  }

  inactiveSuggestedPlayers.value = data ?? []
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await loadTeams()
    await loadPlayers()
    await loadInactiveSuggestions()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando jugadores'
  } finally {
    loading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => a.name.localeCompare(b.name))
})

function resetForm() {
  editingPlayerId.value = null
  formName.value = ''
  formTeamId.value = teams.value[0]?.id ?? ''
  formJerseyNumber.value = null
  formIsActive.value = true
  formEmail.value = ''
  formPassword.value = ''
  errorMessage.value = ''
}

function startEditing(player: PlayerRow) {
  editingPlayerId.value = player.id
  formName.value = player.name
  formTeamId.value = player.team_id
  formJerseyNumber.value = player.jersey_number
  formIsActive.value = player.is_active
  formEmail.value = ''
  formPassword.value = ''
  errorMessage.value = ''
  successMessage.value = ''
}

function cancelEditing() {
  resetForm()
}

async function createPlayerWithAccess() {
  if (!formEmail.value.trim()) {
    errorMessage.value = 'Debes escribir el email del jugador.'
    return
  }

  if (!formPassword.value.trim() || formPassword.value.trim().length < 6) {
    errorMessage.value = 'La contraseña temporal debe tener al menos 6 caracteres.'
    return
  }

  const { data, error } = await supabase.functions.invoke('create-player-with-access', {
    body: {
      playerName: formName.value.trim(),
      teamId: formTeamId.value,
      jerseyNumber: formJerseyNumber.value,
      email: formEmail.value.trim(),
      password: formPassword.value.trim()
    }
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  successMessage.value = `Jugador creado y vinculado correctamente. Acceso: ${data.email}`
}

async function savePlayer() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!formName.value.trim()) {
    errorMessage.value = 'Escribe el nombre del jugador.'
    return
  }

  if (!formTeamId.value) {
    errorMessage.value = 'Selecciona el equipo del jugador.'
    return
  }

  saving.value = true

  try {
    if (editingPlayerId.value) {
      const { error } = await supabase
          .from('players')
          .update({
            name: formName.value.trim(),
            team_id: formTeamId.value,
            jersey_number: formJerseyNumber.value,
            is_active: formIsActive.value
          })
          .eq('id', editingPlayerId.value)

      if (error) throw error

      successMessage.value = 'Jugador actualizado correctamente.'
    } else {
      await createPlayerWithAccess()
    }

    await loadPlayers()
    await loadInactiveSuggestions()
    resetForm()
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
          error instanceof Error ? error.message : 'Error guardando jugador'
    }
  } finally {
    saving.value = false
  }
}

async function deletePlayer(playerId: string, playerName: string) {
  const confirmed = window.confirm(
      `¿Seguro que quieres eliminar a ${playerName}? Esto también borrará su acceso.`
  )

  if (!confirmed) return

  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  try {
    const { data, error } = await supabase.functions.invoke('delete-player-and-access', {
      body: { playerId }
    })

    if (error) throw error
    if (data?.error) throw new Error(data.error)

    successMessage.value = 'Jugador eliminado correctamente.'
    await loadPlayers()
    await loadInactiveSuggestions()

    if (editingPlayerId.value === playerId) {
      resetForm()
    }
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
          error instanceof Error ? error.message : 'Error eliminando jugador'
    }
  } finally {
    saving.value = false
  }
}

async function togglePlayerActive(player: PlayerRow) {
  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  try {
    const { error } = await supabase
        .from('players')
        .update({
          is_active: !player.is_active
        })
        .eq('id', player.id)

    if (error) throw error

    successMessage.value = player.is_active
        ? 'Jugador marcado como inactivo.'
        : 'Jugador marcado como activo.'

    await loadPlayers()
    await loadInactiveSuggestions()

    if (editingPlayerId.value === player.id) {
      formIsActive.value = !player.is_active
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error actualizando estado del jugador'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadData()

  if (teams.value.length > 0 && !formTeamId.value) {
    formTeamId.value = teams.value[0].id
  }
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Jugadores</h2>
        <p class="text-muted mb-0">
          Crea jugadores con acceso y administra su equipo, número y estado.
        </p>
      </div>

      <div v-if="!isAdmin" class="alert alert-secondary mb-0" role="alert">
        Solo administradores pueden gestionar jugadores.
      </div>

      <template v-else>
        <div v-if="inactiveSuggestedPlayers.length" class="alert alert-warning">
          <div class="fw-semibold mb-2">
            Jugadores marcados como inactivos por faltar a las últimas 3 jornadas
          </div>

          <ul class="mb-0">
            <li v-for="player in inactiveSuggestedPlayers" :key="player.id">
              {{ player.name }}
            </li>
          </ul>
        </div>

        <div v-if="errorMessage" class="alert alert-danger" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <div class="card border mb-4">
          <div class="card-body">
            <h3 class="h5 mb-3">
              {{ editingPlayerId ? 'Editar jugador' : 'Nuevo jugador con acceso' }}
            </h3>

            <div class="row g-3">
              <div class="col-12 col-lg-4">
                <label class="form-label">Nombre</label>
                <input
                    v-model="formName"
                    type="text"
                    class="form-control"
                    placeholder="Nombre del jugador" />
              </div>

              <div class="col-12 col-lg-4">
                <label class="form-label">Equipo</label>
                <select v-model="formTeamId" class="form-select">
                  <option value="">Selecciona equipo</option>
                  <option
                      v-for="team in teams"
                      :key="team.id"
                      :value="team.id">
                    {{ team.name }}
                  </option>
                </select>
              </div>

              <div class="col-12 col-lg-2">
                <label class="form-label">Número</label>
                <input
                    :value="formJerseyNumber ?? ''"
                    type="number"
                    min="0"
                    class="form-control"
                    placeholder="Ej. 23"
                    @input="formJerseyNumber = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null" />
              </div>

              <div class="col-12 col-lg-2">
                <label class="form-label">Estado</label>
                <select v-model="formIsActive" class="form-select">
                  <option :value="true">Activo</option>
                  <option :value="false">Inactivo</option>
                </select>
              </div>

              <div class="col-12 col-lg-6">
                <label class="form-label">Email</label>
                <input
                    v-model="formEmail"
                    type="email"
                    class="form-control"
                    :disabled="Boolean(editingPlayerId)"
                    placeholder="email@ejemplo.com" />
              </div>

              <div class="col-12 col-lg-6">
                <label class="form-label">Contraseña</label>
                <input
                    v-model="formPassword"
                    type="text"
                    class="form-control"
                    :disabled="Boolean(editingPlayerId)"
                    placeholder="Contraseña temporal" />
              </div>

              <div class="col-12 d-flex gap-2 flex-wrap">
                <button
                    class="btn btn-primary"
                    :disabled="saving || loading"
                    @click="savePlayer">
                  {{
                    saving
                        ? 'Guardando...'
                        : editingPlayerId
                            ? 'Guardar cambios'
                            : 'Crear jugador'
                  }}
                </button>

                <button
                    v-if="editingPlayerId"
                    class="btn btn-outline-secondary"
                    :disabled="saving"
                    @click="cancelEditing">
                  Cancelar
                </button>
              </div>

              <div v-if="editingPlayerId" class="col-12">
                <div class="small text-body-secondary">
                  En edición solo se actualizan los datos del jugador. Email y contraseña aplican al crear un jugador nuevo.
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="loading" class="mb-0">Cargando jugadores...</p>

        <div v-else-if="sortedPlayers.length" class="table-responsive">
          <table class="table table-striped align-middle mb-0">
            <thead class="table-light">
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>Número</th>
              <th>Estado</th>
              <th class="text-end">Acciones</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="player in sortedPlayers" :key="player.id">
              <td class="fw-semibold">{{ player.name }}</td>
              <td>{{ teamsMap.get(player.team_id) ?? 'Sin equipo' }}</td>
              <td>{{ player.jersey_number ?? '—' }}</td>
              <td>
                  <span
                      class="badge"
                      :class="player.is_active ? 'text-bg-success' : 'text-bg-secondary'">
                    {{ player.is_active ? 'Activo' : 'Inactivo' }}
                  </span>
              </td>
              <td class="text-end">
                <div class="d-flex justify-content-end gap-2 flex-wrap">
                  <button
                      class="btn btn-outline-primary btn-sm"
                      :disabled="saving"
                      @click="startEditing(player)">
                    Editar
                  </button>

                  <button
                      class="btn btn-outline-dark btn-sm"
                      :disabled="saving"
                      @click="togglePlayerActive(player)">
                    {{ player.is_active ? 'Inactivar' : 'Activar' }}
                  </button>

                  <button
                      class="btn btn-outline-danger btn-sm"
                      :disabled="saving"
                      @click="deletePlayer(player.id, player.name)">
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="text-muted mb-0">
          No hay jugadores registrados todavía.
        </p>
      </template>
    </div>
  </section>
</template>
