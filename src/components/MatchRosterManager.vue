<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getMatchLabel } from '../utils/matches'

type TeamRow = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  played_at: string
  created_at: string
  team_a_id: string
  team_b_id: string
}

type PlayerRow = {
  id: string
  name: string
  jersey_number: number | null
  team_id: string
  is_active: boolean
}

type MatchPlayerRow = {
  player_id: string
}

const { isAdmin } = useAuth()

const teams = ref<TeamRow[]>([])
const matches = ref<MatchRow[]>([])
const players = ref<PlayerRow[]>([])
const selectedMatchId = ref('')
const selectedPlayerIds = ref<string[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: matchesData, error: matchesError },
      { data: playersData, error: playersError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, created_at, team_a_id, team_b_id')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),
      supabase
          .from('players')
          .select('id, name, jersey_number, team_id, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })
    ])

    if (teamsError) throw teamsError
    if (matchesError) throw matchesError
    if (playersError) throw playersError

    teams.value = teamsData ?? []
    matches.value = matchesData ?? []
    players.value = playersData ?? []

    if (!selectedMatchId.value && matches.value.length > 0) {
      selectedMatchId.value = matches.value[0].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando roster'
  } finally {
    loading.value = false
  }
}

const selectedMatch = computed(() => {
  return matches.value.find((match) => match.id === selectedMatchId.value) ?? null
})

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const teamAName = computed(() => {
  return selectedMatch.value
      ? (teamsMap.value.get(selectedMatch.value.team_a_id) ?? 'Equipo A')
      : ''
})

const teamBName = computed(() => {
  return selectedMatch.value
      ? (teamsMap.value.get(selectedMatch.value.team_b_id) ?? 'Equipo B')
      : ''
})

const teamAPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return players.value
      .filter((player) => player.team_id === selectedMatch.value?.team_a_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamBPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return players.value
      .filter((player) => player.team_id === selectedMatch.value?.team_b_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

function matchLabel(match: MatchRow) {
  return getMatchLabel(match, matches.value)
}

async function loadSelectedPlayers() {
  selectedPlayerIds.value = []

  if (!selectedMatchId.value) return

  const { data, error } = await supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', selectedMatchId.value)

  if (error) {
    errorMessage.value = error.message
    return
  }

  selectedPlayerIds.value = ((data as MatchPlayerRow[]) ?? []).map((row) => row.player_id)
}

function togglePlayer(playerId: string, checked: boolean) {
  if (checked) {
    if (!selectedPlayerIds.value.includes(playerId)) {
      selectedPlayerIds.value = [...selectedPlayerIds.value, playerId]
    }
    return
  }

  selectedPlayerIds.value = selectedPlayerIds.value.filter((id) => id !== playerId)
}

function isSelected(playerId: string) {
  return selectedPlayerIds.value.includes(playerId)
}

async function saveRoster() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedMatchId.value) {
    errorMessage.value = 'Selecciona un partido.'
    return
  }

  saving.value = true

  try {
    const { error: deleteError } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', selectedMatchId.value)

    if (deleteError) throw deleteError

    if (selectedPlayerIds.value.length > 0) {
      const rows = selectedPlayerIds.value.map((playerId) => ({
        match_id: selectedMatchId.value,
        player_id: playerId
      }))

      const { error: insertError } = await supabase
          .from('match_players')
          .insert(rows)

      if (insertError) throw insertError
    }

    successMessage.value = 'Roster guardado correctamente.'
    await loadSelectedPlayers()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error guardando roster'
  } finally {
    saving.value = false
  }
}

watch(selectedMatchId, async () => {
  await loadSelectedPlayers()
})

onMounted(async () => {
  await loadData()
  await loadSelectedPlayers()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Roster del partido</h2>
        <p class="text-muted mb-0">
          Marca qué jugadores estuvieron presentes en cada partido.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando roster...</p>

      <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else-if="!isAdmin">
        <div class="alert alert-secondary mb-0" role="alert">
          Solo los administradores pueden modificar el roster.
        </div>
      </template>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label for="roster-match-select" class="form-label">Partido</label>
            <select
                id="roster-match-select"
                v-model="selectedMatchId"
                class="form-select">
              <option value="">Selecciona un partido</option>
              <option
                  v-for="match in matches"
                  :key="match.id"
                  :value="match.id">
                {{ matchLabel(match) }}
              </option>
            </select>
          </div>
        </div>

        <template v-if="selectedMatch">
          <div class="row g-4">
            <div class="col-12 col-xl-6">
              <h3 class="h5 mb-3">{{ teamAName }}</h3>

              <ul v-if="teamAPlayers.length" class="list-group">
                <li
                    v-for="player in teamAPlayers"
                    :key="player.id"
                    class="list-group-item">
                  <div class="form-check d-flex align-items-center gap-2">
                    <input
                        :id="`player-${player.id}`"
                        class="form-check-input"
                        type="checkbox"
                        :checked="isSelected(player.id)"
                        @change="togglePlayer(player.id, ($event.target as HTMLInputElement).checked)" />
                    <label
                        class="form-check-label d-flex justify-content-between align-items-center w-100"
                        :for="`player-${player.id}`">
                      <span>{{ player.name }}</span>
                      <span class="badge text-bg-dark">
                        {{ player.jersey_number ?? 'Sin número' }}
                      </span>
                    </label>
                  </div>
                </li>
              </ul>

              <p v-else class="text-muted mb-0">
                No hay jugadores activos en este equipo.
              </p>
            </div>

            <div class="col-12 col-xl-6">
              <h3 class="h5 mb-3">{{ teamBName }}</h3>

              <ul v-if="teamBPlayers.length" class="list-group">
                <li
                    v-for="player in teamBPlayers"
                    :key="player.id"
                    class="list-group-item">
                  <div class="form-check d-flex align-items-center gap-2">
                    <input
                        :id="`player-${player.id}`"
                        class="form-check-input"
                        type="checkbox"
                        :checked="isSelected(player.id)"
                        @change="togglePlayer(player.id, ($event.target as HTMLInputElement).checked)" />
                    <label
                        class="form-check-label d-flex justify-content-between align-items-center w-100"
                        :for="`player-${player.id}`">
                      <span>{{ player.name }}</span>
                      <span class="badge text-bg-dark">
                        {{ player.jersey_number ?? 'Sin número' }}
                      </span>
                    </label>
                  </div>
                </li>
              </ul>

              <p v-else class="text-muted mb-0">
                No hay jugadores activos en este equipo.
              </p>
            </div>
          </div>

          <div class="mt-4 d-flex gap-2 flex-wrap">
            <button
                class="btn btn-primary"
                :disabled="saving"
                @click="saveRoster">
              {{ saving ? 'Guardando...' : 'Guardar roster' }}
            </button>
          </div>

          <div v-if="successMessage" class="alert alert-success mt-3 mb-0" role="alert">
            {{ successMessage }}
          </div>
        </template>

        <p v-else class="text-muted mb-0">
          Selecciona un partido para gestionar el roster.
        </p>
      </template>
    </div>
  </section>
</template>
