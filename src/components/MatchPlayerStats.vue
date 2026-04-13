<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getMatchLabel } from '../utils/matches'

type Match = {
  id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  played_at: string
  created_at: string
}

type Player = {
  id: string
  name: string
  team_id: string
}

type MatchPlayerRow = {
  player_id: string
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

type PlayerStatsState = Record<string, { points: number; threes: number }>

type TeamRow = {
  id: string
  name: string
}

const { isAdmin } = useAuth()

const matches = ref<Match[]>([])
const teams = ref<TeamRow[]>([])
const players = ref<Player[]>([])
const rosterPlayerIds = ref<string[]>([])
const selectedMatchId = ref('')
const stats = ref<PlayerStatsState>({})

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const [
    { data: matchesData, error: matchesError },
    { data: teamsData, error: teamsError },
    { data: playersData, error: playersError }
  ] = await Promise.all([
    supabase
        .from('matches')
        .select('id, team_a_id, team_b_id, team_a_score, team_b_score, played_at, created_at')
        .order('played_at', { ascending: false })
        .order('created_at', { ascending: false }),
    supabase
        .from('teams')
        .select('id, name')
        .order('name', { ascending: true }),
    supabase
        .from('players')
        .select('id, name, team_id')
        .eq('is_active', true)
        .order('name', { ascending: true })
  ])

  if (matchesError) {
    errorMessage.value = matchesError.message
    matches.value = []
  } else {
    matches.value = matchesData ?? []
  }

  if (teamsError) {
    errorMessage.value = teamsError.message
    teams.value = []
  } else {
    teams.value = teamsData ?? []
  }

  if (playersError) {
    errorMessage.value = playersError.message
    players.value = []
  } else {
    players.value = playersData ?? []
  }

  loading.value = false
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
      : 'Equipo A'
})

const teamBName = computed(() => {
  return selectedMatch.value
      ? (teamsMap.value.get(selectedMatch.value.team_b_id) ?? 'Equipo B')
      : 'Equipo B'
})

const playersForMatch = computed(() => {
  if (!selectedMatch.value) return []

  return players.value.filter((player) =>
      rosterPlayerIds.value.includes(player.id)
  )
})

const teamAPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return playersForMatch.value
      .filter((player) => player.team_id === selectedMatch.value?.team_a_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamBPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return playersForMatch.value
      .filter((player) => player.team_id === selectedMatch.value?.team_b_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

async function loadRosterForMatch() {
  rosterPlayerIds.value = []

  if (!selectedMatchId.value) return

  const { data, error } = await supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', selectedMatchId.value)

  if (error) {
    errorMessage.value = error.message
    return
  }

  rosterPlayerIds.value = ((data as MatchPlayerRow[]) ?? []).map((row) => row.player_id)
}

async function loadStatsForMatch() {
  stats.value = {}

  if (!selectedMatchId.value) return

  const { data, error } = await supabase
      .from('player_game_stats')
      .select('player_id, points, three_pointers')
      .eq('match_id', selectedMatchId.value)

  if (error) {
    errorMessage.value = error.message
    return
  }

  const existingStats = (data as PlayerStatRow[]) ?? []

  for (const row of existingStats) {
    stats.value[row.player_id] = {
      points: row.points,
      threes: row.three_pointers
    }
  }
}

function updateStat(
    playerId: string,
    field: 'points' | 'threes',
    value: string
) {
  if (!stats.value[playerId]) {
    stats.value[playerId] = { points: 0, threes: 0 }
  }

  if (value === '') {
    stats.value[playerId][field] = 0
    return
  }

  const parsedValue = Number(value)
  stats.value[playerId][field] = Number.isNaN(parsedValue) ? 0 : parsedValue
}

function statInputValue(playerId: string, field: 'points' | 'threes') {
  if (!stats.value[playerId]) return ''
  const value = stats.value[playerId][field]
  return value === 0 ? '' : String(value)
}

function validateStatsTotals() {
  if (!selectedMatch.value) {
    return 'No hay partido seleccionado.'
  }

  const teamAPoints = playersForMatch.value
      .filter((player) => player.team_id === selectedMatch.value?.team_a_id)
      .reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)

  const teamBPoints = playersForMatch.value
      .filter((player) => player.team_id === selectedMatch.value?.team_b_id)
      .reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)

  if (teamAPoints !== selectedMatch.value.team_a_score) {
    return `La suma de puntos de ${teamAPoints} no coincide con el marcador de ${selectedMatch.value.team_a_score} para ${teamAName.value}.`
  }

  if (teamBPoints !== selectedMatch.value.team_b_score) {
    return `La suma de puntos de ${teamBPoints} no coincide con el marcador de ${selectedMatch.value.team_b_score} para ${teamBName.value}.`
  }

  return ''
}

async function saveStats() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedMatchId.value) {
    errorMessage.value = 'Selecciona un partido.'
    return
  }

  if (!rosterPlayerIds.value.length) {
    errorMessage.value = 'Este partido no tiene roster asignado todavía.'
    return
  }

  const validationError = validateStatsTotals()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  saving.value = true

  const rows = playersForMatch.value.map((player) => ({
    match_id: selectedMatchId.value,
    player_id: player.id,
    points: stats.value[player.id]?.points ?? 0,
    three_pointers: stats.value[player.id]?.threes ?? 0
  }))

  const { error } = await supabase
      .from('player_game_stats')
      .upsert(rows, {
        onConflict: 'match_id,player_id'
      })

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Estadísticas guardadas.'
    await loadStatsForMatch()
  }

  saving.value = false
}

function matchLabel(match: Match) {
  return getMatchLabel(match, matches.value)
}

watch(selectedMatchId, async () => {
  errorMessage.value = ''
  successMessage.value = ''
  await loadRosterForMatch()
  await loadStatsForMatch()
})

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h4 mb-3">Estadísticas por partido</h2>

      <div v-if="!isAdmin" class="alert alert-secondary" role="alert">
        Solo admins pueden registrar estadísticas.
      </div>

      <template v-else>
        <div class="mb-3">
          <label class="form-label">Selecciona partido</label>
          <select v-model="selectedMatchId" class="form-select">
            <option value="">Selecciona...</option>
            <option
                v-for="match in matches"
                :key="match.id"
                :value="match.id">
              {{ matchLabel(match) }}
            </option>
          </select>
        </div>

        <div v-if="selectedMatchId && !rosterPlayerIds.length" class="alert alert-warning" role="alert">
          Este partido no tiene roster guardado. Primero marca los jugadores en
          <strong>Roster partido</strong>.
        </div>

        <div v-else-if="selectedMatchId && playersForMatch.length" class="row g-4">
          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-3">{{ teamAName }}</h3>

            <div
                v-for="player in teamAPlayers"
                :key="player.id"
                class="row g-2 align-items-center mb-2">
              <div class="col-12 col-md-4">
                <span>{{ player.name }}</span>
              </div>

              <div class="col-6 col-md-4">
                <input
                    type="number"
                    class="form-control"
                    placeholder="Puntos"
                    :value="statInputValue(player.id, 'points')"
                    @input="updateStat(player.id, 'points', ($event.target as HTMLInputElement).value)" />
              </div>

              <div class="col-6 col-md-4">
                <input
                    type="number"
                    class="form-control"
                    placeholder="3PT"
                    :value="statInputValue(player.id, 'threes')"
                    @input="updateStat(player.id, 'threes', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-3">{{ teamBName }}</h3>

            <div
                v-for="player in teamBPlayers"
                :key="player.id"
                class="row g-2 align-items-center mb-2">
              <div class="col-12 col-md-4">
                <span>{{ player.name }}</span>
              </div>

              <div class="col-6 col-md-4">
                <input
                    type="number"
                    class="form-control"
                    placeholder="Puntos"
                    :value="statInputValue(player.id, 'points')"
                    @input="updateStat(player.id, 'points', ($event.target as HTMLInputElement).value)" />
              </div>

              <div class="col-6 col-md-4">
                <input
                    type="number"
                    class="form-control"
                    placeholder="3PT"
                    :value="statInputValue(player.id, 'threes')"
                    @input="updateStat(player.id, 'threes', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
          </div>
        </div>

        <p v-else-if="selectedMatchId" class="text-muted">
          No hay jugadores disponibles para este partido.
        </p>

        <button
            class="btn btn-primary mt-3"
            :disabled="saving || !selectedMatchId || !rosterPlayerIds.length"
            @click="saveStats">
          {{ saving ? 'Guardando...' : 'Guardar estadísticas' }}
        </button>
      </template>

      <div v-if="errorMessage" class="alert alert-danger mt-3">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="alert alert-success mt-3">
        {{ successMessage }}
      </div>
    </div>
  </section>
</template>
