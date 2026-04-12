<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type Team = {
  id: string
  name: string
}

type Player = {
  id: string
  name: string
  jersey_number: number | null
  is_active: boolean
  team_id: string
  team: {
    name: string
  }[]
}

const { isAdmin } = useAuth()

const teams = ref<Team[]>([])
const players = ref<Player[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedTeamId = ref('')
const playerName = ref('')
const jerseyNumber = ref<number | null>(null)

const editingPlayerId = ref<string | null>(null)
const editingName = ref('')
const editingJerseyNumber = ref<number | null>(null)
const editingTeamId = ref('')
const editingIsActive = ref(true)

const groupedPlayers = computed(() => {
  const groups: Record<string, Player[]> = {}

  for (const player of players.value) {
    const teamName = player.team?.[0]?.name ?? 'Sin equipo'

    if (!groups[teamName]) {
      groups[teamName] = []
    }

    groups[teamName].push(player)
  }

  return Object.entries(groups)
      .map(([teamName, teamPlayers]) => [
        teamName,
        [...teamPlayers].sort((a, b) => a.name.localeCompare(b.name))
      ] as const)
      .sort(([a], [b]) => a.localeCompare(b))
})

async function loadTeams() {
  const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    teams.value = []
    return
  }

  teams.value = data ?? []

  if (!selectedTeamId.value && teams.value.length > 0) {
    selectedTeamId.value = teams.value[0].id
  }
}

async function loadPlayers() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
      .from('players')
      .select(`
      id,
      name,
      jersey_number,
      is_active,
      team_id,
      team:team_id(name)
    `)

  if (error) {
    errorMessage.value = error.message
    players.value = []
  } else {
    players.value = (data as Player[]) ?? []
  }

  loading.value = false
}

function resetForm() {
  playerName.value = ''
  jerseyNumber.value = null
}

function startEditing(player: Player) {
  editingPlayerId.value = player.id
  editingName.value = player.name
  editingJerseyNumber.value = player.jersey_number
  editingTeamId.value = player.team_id
  editingIsActive.value = player.is_active
  errorMessage.value = ''
  successMessage.value = ''
}

function cancelEditing() {
  editingPlayerId.value = null
  editingName.value = ''
  editingJerseyNumber.value = null
  editingTeamId.value = ''
  editingIsActive.value = true
}

async function addPlayer() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedTeamId.value) {
    errorMessage.value = 'Selecciona un equipo.'
    return
  }

  if (!playerName.value.trim()) {
    errorMessage.value = 'Escribe el nombre del jugador.'
    return
  }

  saving.value = true

  const { error } = await supabase.from('players').insert({
    team_id: selectedTeamId.value,
    name: playerName.value.trim(),
    jersey_number: jerseyNumber.value
  })

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Jugador agregado correctamente.'
    resetForm()
    await loadPlayers()
  }

  saving.value = false
}

async function updatePlayer() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!editingPlayerId.value) return

  if (!editingTeamId.value) {
    errorMessage.value = 'Selecciona un equipo.'
    return
  }

  if (!editingName.value.trim()) {
    errorMessage.value = 'Escribe el nombre del jugador.'
    return
  }

  saving.value = true

  const { error } = await supabase
      .from('players')
      .update({
        name: editingName.value.trim(),
        jersey_number: editingJerseyNumber.value,
        team_id: editingTeamId.value,
        is_active: editingIsActive.value
      })
      .eq('id', editingPlayerId.value)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Jugador actualizado correctamente.'
    cancelEditing()
    await loadPlayers()
  }

  saving.value = false
}

async function deletePlayer(playerId: string) {
  const confirmed = window.confirm('¿Seguro que quieres eliminar este jugador?')

  if (!confirmed) return

  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Jugador eliminado correctamente.'

    if (editingPlayerId.value === playerId) {
      cancelEditing()
    }

    await loadPlayers()
  }

  saving.value = false
}

onMounted(async () => {
  await loadTeams()
  await loadPlayers()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Jugadores</h2>
        <p class="text-muted mb-0">
          Agrega jugadores, edítalos y organízalos por equipo.
        </p>
      </div>

      <div v-if="!isAdmin" class="alert alert-secondary" role="alert">
        Solo los usuarios administradores pueden modificar jugadores.
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-md-4">
            <label for="player-team" class="form-label">Equipo</label>
            <select
                id="player-team"
                v-model="selectedTeamId"
                class="form-select">
              <option value="">Selecciona un equipo</option>
              <option
                  v-for="team in teams"
                  :key="team.id"
                  :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="col-12 col-md-5">
            <label for="player-name" class="form-label">Nombre</label>
            <input
                id="player-name"
                v-model="playerName"
                type="text"
                class="form-control"
                placeholder="Nombre del jugador"
                @keyup.enter="addPlayer" />
          </div>

          <div class="col-12 col-md-3">
            <label for="player-number" class="form-label">Número</label>
            <input
                id="player-number"
                v-model.number="jerseyNumber"
                type="number"
                min="0"
                class="form-control"
                placeholder="Opcional" />
          </div>
        </div>

        <button
            class="btn btn-primary mb-4"
            :disabled="saving"
            @click="addPlayer">
          {{ saving ? 'Guardando...' : 'Agregar jugador' }}
        </button>
      </template>

      <div v-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="alert alert-success" role="alert">
        {{ successMessage }}
      </div>

      <p v-if="loading" class="mb-0">Cargando jugadores...</p>

      <div v-else-if="groupedPlayers.length" class="d-flex flex-column gap-4">
        <div v-for="[teamName, teamPlayers] in groupedPlayers" :key="teamName">
          <h3 class="h5 mb-3">{{ teamName }}</h3>

          <ul class="list-group">
            <li
                v-for="player in teamPlayers"
                :key="player.id"
                class="list-group-item">
              <template v-if="editingPlayerId === player.id">
                <div class="row g-3">
                  <div class="col-12 col-md-4">
                    <label class="form-label">Nombre</label>
                    <input
                        v-model="editingName"
                        type="text"
                        class="form-control" />
                  </div>

                  <div class="col-12 col-md-3">
                    <label class="form-label">Número</label>
                    <input
                        v-model.number="editingJerseyNumber"
                        type="number"
                        min="0"
                        class="form-control" />
                  </div>

                  <div class="col-12 col-md-3">
                    <label class="form-label">Equipo</label>
                    <select v-model="editingTeamId" class="form-select">
                      <option
                          v-for="team in teams"
                          :key="team.id"
                          :value="team.id">
                        {{ team.name }}
                      </option>
                    </select>
                  </div>

                  <div class="col-12 col-md-2">
                    <label class="form-label">Activo</label>
                    <select v-model="editingIsActive" class="form-select">
                      <option :value="true">Sí</option>
                      <option :value="false">No</option>
                    </select>
                  </div>
                </div>

                <div class="d-flex gap-2 flex-wrap mt-3">
                  <button
                      class="btn btn-success btn-sm"
                      :disabled="saving"
                      @click="updatePlayer">
                    Guardar
                  </button>
                  <button
                      class="btn btn-outline-secondary btn-sm"
                      :disabled="saving"
                      @click="cancelEditing">
                    Cancelar
                  </button>
                </div>
              </template>

              <template v-else>
                <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-semibold">{{ player.name }}</span>
                    <span class="badge text-bg-dark">
                      {{ player.jersey_number ?? 'Sin número' }}
                    </span>
                    <span
                        class="badge"
                        :class="player.is_active ? 'text-bg-success' : 'text-bg-secondary'">
                      {{ player.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </div>

                  <div v-if="isAdmin" class="d-flex gap-2 flex-wrap">
                    <button
                        class="btn btn-outline-primary btn-sm"
                        :disabled="saving"
                        @click="startEditing(player)">
                      Editar
                    </button>
                    <button
                        class="btn btn-outline-danger btn-sm"
                        :disabled="saving"
                        @click="deletePlayer(player.id)">
                      Eliminar
                    </button>
                  </div>
                </div>
              </template>
            </li>
          </ul>
        </div>
      </div>

      <p v-else class="text-muted mb-0">No hay jugadores todavía.</p>
    </div>
  </section>
</template>
