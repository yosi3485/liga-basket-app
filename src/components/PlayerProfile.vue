<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'

type TeamRow = {
  id: string
  name: string
}

type PlayerRow = {
  id: string
  name: string
  jersey_number: number | null
  is_active: boolean
  team_id: string
}

type PlayerStatRow = {
  match_id: string
  points: number
  three_pointers: number
}

type MatchRow = {
  id: string
  played_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
}

type MatchHistoryRow = {
  matchId: string
  playedAt: string
  opponent: string
  teamScore: number
  opponentScore: number
  points: number
  threes: number
}

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const matches = ref<MatchRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])

const selectedPlayerId = ref('')
const loading = ref(false)
const statsLoading = ref(false)
const errorMessage = ref('')

async function loadBaseData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: matchesData, error: matchesError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase
          .from('players')
          .select('id, name, jersey_number, is_active, team_id')
          .order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, team_a_id, team_b_id, team_a_score, team_b_score')
          .order('played_at', { ascending: false })
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchesError) throw matchesError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    matches.value = matchesData ?? []

    if (!selectedPlayerId.value && players.value.length > 0) {
      selectedPlayerId.value = players.value[0].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando datos'
  } finally {
    loading.value = false
  }
}

async function loadPlayerStats() {
  playerStats.value = []

  if (!selectedPlayerId.value) return

  statsLoading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
        .from('player_game_stats')
        .select('match_id, points, three_pointers')
        .eq('player_id', selectedPlayerId.value)

    if (error) throw error

    playerStats.value = data ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando estadísticas'
  } finally {
    statsLoading.value = false
  }
}

const selectedPlayer = computed(() => {
  return players.value.find((player) => player.id === selectedPlayerId.value) ?? null
})

const selectedTeamName = computed(() => {
  if (!selectedPlayer.value) return ''
  return teams.value.find((team) => team.id === selectedPlayer.value?.team_id)?.name ?? 'Sin equipo'
})

const totalGames = computed(() => playerStats.value.length)

const totalPoints = computed(() => {
  return playerStats.value.reduce((sum, row) => sum + (row.points ?? 0), 0)
})

const totalThrees = computed(() => {
  return playerStats.value.reduce((sum, row) => sum + (row.three_pointers ?? 0), 0)
})

const averagePoints = computed(() => {
  if (!totalGames.value) return 0
  return totalPoints.value / totalGames.value
})

const matchHistory = computed<MatchHistoryRow[]>(() => {
  if (!selectedPlayer.value) return []

  const teamMap = new Map(teams.value.map((team) => [team.id, team.name]))
  const matchMap = new Map(matches.value.map((match) => [match.id, match]))

  return playerStats.value
      .map((stat) => {
        const match = matchMap.get(stat.match_id)
        if (!match) return null

        const playerTeamId = selectedPlayer.value!.team_id
        const isTeamA = match.team_a_id === playerTeamId
        const opponentTeamId = isTeamA ? match.team_b_id : match.team_a_id

        return {
          matchId: match.id,
          playedAt: match.played_at,
          opponent: teamMap.get(opponentTeamId) ?? 'Rival',
          teamScore: isTeamA ? match.team_a_score : match.team_b_score,
          opponentScore: isTeamA ? match.team_b_score : match.team_a_score,
          points: stat.points,
          threes: stat.three_pointers
        }
      })
      .filter((row): row is MatchHistoryRow => row !== null)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
})

watch(selectedPlayerId, async () => {
  await loadPlayerStats()
})

onMounted(async () => {
  await loadBaseData()
  await loadPlayerStats()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Perfil de jugador</h2>
        <p class="text-muted mb-0">
          Consulta estadísticas acumuladas y el historial por partido.
        </p>
      </div>

      <div v-if="loading" class="mb-0">Cargando jugadores...</div>

      <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label for="player-profile-select" class="form-label">Jugador</label>
            <select
                id="player-profile-select"
                v-model="selectedPlayerId"
                class="form-select">
              <option value="">Selecciona un jugador</option>
              <option
                  v-for="player in players"
                  :key="player.id"
                  :value="player.id">
                {{ player.name }}
              </option>
            </select>
          </div>
        </div>

        <template v-if="selectedPlayer">
          <div class="row g-3 mb-4">
            <div class="col-12 col-md-6 col-xl-3">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Equipo</div>
                <div class="fw-semibold">{{ selectedTeamName }}</div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Número</div>
                <div class="fw-semibold">{{ selectedPlayer.jersey_number ?? 'Sin número' }}</div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Estado</div>
                <div class="fw-semibold">
                  {{ selectedPlayer.is_active ? 'Activo' : 'Inactivo' }}
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Partidos jugados</div>
                <div class="fw-semibold">{{ totalGames }}</div>
              </div>
            </div>

            <div class="col-12 col-md-4">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Puntos totales</div>
                <div class="fw-semibold">{{ totalPoints }}</div>
              </div>
            </div>

            <div class="col-12 col-md-4">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Triples totales</div>
                <div class="fw-semibold">{{ totalThrees }}</div>
              </div>
            </div>

            <div class="col-12 col-md-4">
              <div class="border rounded p-3 h-100">
                <div class="text-muted small mb-1">Promedio de puntos</div>
                <div class="fw-semibold">{{ averagePoints.toFixed(1) }}</div>
              </div>
            </div>
          </div>

          <div v-if="statsLoading" class="mb-0">Cargando historial...</div>

          <div v-else>
            <h3 class="h5 mb-3">Historial por partido</h3>

            <div v-if="matchHistory.length" class="table-responsive">
              <table class="table table-striped align-middle mb-0">
                <thead class="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Rival</th>
                  <th>Resultado</th>
                  <th>Puntos</th>
                  <th>Triples</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="row in matchHistory" :key="row.matchId">
                  <td>{{ formatDate(row.playedAt) }}</td>
                  <td>{{ row.opponent }}</td>
                  <td>{{ row.teamScore }} - {{ row.opponentScore }}</td>
                  <td>{{ row.points }}</td>
                  <td>{{ row.threes }}</td>
                </tr>
                </tbody>
              </table>
            </div>

            <p v-else class="text-muted mb-0">
              Este jugador no tiene estadísticas registradas todavía.
            </p>
          </div>
        </template>

        <p v-else class="text-muted mb-0">No hay jugador seleccionado.</p>
      </template>
    </div>
  </section>
</template>
