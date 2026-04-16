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
  team_id: string
  jersey_number: number | null
  is_active: boolean
}

type MatchRow = {
  id: string
  played_at: string
  created_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: 'in_progress' | 'finished'
}

type MatchPlayerRow = {
  match_id: string
  player_id: string
  team_id: string
}

type PlayerStatRow = {
  match_id: string
  player_id: string
  points: number
  three_pointers: number
}

type PlayerMatchHistoryRow = {
  matchId: string
  playedAt: string
  teamName: string
  opponentName: string
  teamScore: number
  opponentScore: number
  result: 'W' | 'L'
  points: number
  threes: number
  status: 'in_progress' | 'finished'
}

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const matches = ref<MatchRow[]>([])
const matchPlayers = ref<MatchPlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])

const selectedPlayerId = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: matchesData, error: matchesError },
      { data: matchPlayersData, error: matchPlayersError },
      { data: playerStatsData, error: playerStatsError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),

      supabase
          .from('players')
          .select('id, name, team_id, jersey_number, is_active')
          .order('name', { ascending: true }),

      supabase
          .from('matches')
          .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),

      supabase
          .from('match_players')
          .select('match_id, player_id, team_id'),

      supabase
          .from('player_game_stats')
          .select('match_id, player_id, points, three_pointers')
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchesError) throw matchesError
    if (matchPlayersError) throw matchPlayersError
    if (playerStatsError) throw playerStatsError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    matches.value = matchesData ?? []
    matchPlayers.value = matchPlayersData ?? []
    playerStats.value = playerStatsData ?? []

    if (!selectedPlayerId.value && players.value.length > 0) {
      selectedPlayerId.value = players.value[0].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando perfil del jugador'
  } finally {
    loading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const selectedPlayer = computed(() => {
  return players.value.find((player) => player.id === selectedPlayerId.value) ?? null
})

const selectedPlayerMatchEntries = computed(() => {
  if (!selectedPlayerId.value) return []

  return matchPlayers.value.filter((row) => row.player_id === selectedPlayerId.value)
})

const selectedPlayerMatchIds = computed(() => {
  return new Set(selectedPlayerMatchEntries.value.map((row) => row.match_id))
})

const selectedPlayerHistory = computed<PlayerMatchHistoryRow[]>(() => {
  if (!selectedPlayer.value) return []

  const statsMap = new Map(
      playerStats.value
          .filter((row) => row.player_id === selectedPlayer.value?.id)
          .map((row) => [row.match_id, row])
  )

  const rosterMap = new Map(
      selectedPlayerMatchEntries.value.map((row) => [row.match_id, row])
  )

  return matches.value
      .filter((match) => selectedPlayerMatchIds.value.has(match.id))
      .map((match) => {
        const rosterEntry = rosterMap.get(match.id)
        const statEntry = statsMap.get(match.id)

        const playerTeamId = rosterEntry?.team_id
        const playerTeamName = playerTeamId
            ? (teamsMap.value.get(playerTeamId) ?? 'Equipo')
            : 'Equipo'

        const opponentTeamId =
            playerTeamId === match.team_a_id ? match.team_b_id : match.team_a_id

        const opponentTeamName = teamsMap.value.get(opponentTeamId) ?? 'Rival'

        const playerTeamScore =
            playerTeamId === match.team_a_id ? match.team_a_score : match.team_b_score

        const opponentScore =
            playerTeamId === match.team_a_id ? match.team_b_score : match.team_a_score

        let result: 'W' | 'L' = 'L'
        if (playerTeamScore > opponentScore) {
          result = 'W'
        }

        return {
          matchId: match.id,
          playedAt: match.played_at,
          teamName: playerTeamName,
          opponentName: opponentTeamName,
          teamScore: playerTeamScore,
          opponentScore,
          result,
          points: statEntry?.points ?? 0,
          threes: statEntry?.three_pointers ?? 0,
          status: match.status
        }
      })
      .sort((a, b) => {
        if (a.playedAt !== b.playedAt) {
          return b.playedAt.localeCompare(a.playedAt)
        }
        return b.matchId.localeCompare(a.matchId)
      })
})

const totalGames = computed(() => selectedPlayerHistory.value.length)

const finishedGames = computed(() => {
  return selectedPlayerHistory.value.filter((row) => row.status === 'finished')
})

const totalWins = computed(() => {
  return finishedGames.value.filter((row) => row.result === 'W').length
})

const totalLosses = computed(() => {
  return finishedGames.value.filter((row) => row.result === 'L').length
})

const totalPoints = computed(() => {
  return selectedPlayerHistory.value.reduce((sum, row) => sum + row.points, 0)
})

const totalThrees = computed(() => {
  return selectedPlayerHistory.value.reduce((sum, row) => sum + row.threes, 0)
})

onMounted(() => {
  loadData()
})

watch(selectedPlayerId, () => {
  errorMessage.value = ''
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Perfil del jugador</h2>
        <p class="text-muted mb-0">
          Muestra solo los partidos en los que el jugador realmente participó.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando perfil...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label class="form-label">Jugador</label>
            <select v-model="selectedPlayerId" class="form-select">
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
              <div class="card border-0 bg-light h-100">
                <div class="card-body">
                  <div class="small text-muted mb-1">Equipo base</div>
                  <div class="fw-bold">
                    {{ teamsMap.get(selectedPlayer.team_id) ?? 'Sin equipo' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light h-100">
                <div class="card-body">
                  <div class="small text-muted mb-1">Juegos jugados</div>
                  <div class="fw-bold">{{ totalGames }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light h-100">
                <div class="card-body">
                  <div class="small text-muted mb-1">Récord</div>
                  <div class="fw-bold">{{ totalWins }} - {{ totalLosses }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light h-100">
                <div class="card-body">
                  <div class="small text-muted mb-1">Puntos / 3PT</div>
                  <div class="fw-bold">{{ totalPoints }} / {{ totalThrees }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedPlayerHistory.length" class="table-responsive">
            <table class="table table-striped align-middle mb-0">
              <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Partido</th>
                <th>Resultado</th>
                <th>Puntos</th>
                <th>3PT</th>
                <th>Estado</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="row in selectedPlayerHistory" :key="row.matchId">
                <td>{{ formatDate(row.playedAt) }}</td>
                <td>
                  <span class="fw-semibold">{{ row.teamName }}</span>
                  <span class="text-muted"> vs </span>
                  <span>{{ row.opponentName }}</span>
                  <div class="small text-muted">
                    {{ row.teamScore }} - {{ row.opponentScore }}
                  </div>
                </td>
                <td>
                    <span
                        class="badge"
                        :class="row.result === 'W' ? 'text-bg-success' : 'text-bg-secondary'">
                      {{ row.result === 'W' ? 'Victoria' : 'Derrota' }}
                    </span>
                </td>
                <td>{{ row.points }}</td>
                <td>{{ row.threes }}</td>
                <td>
                    <span
                        class="badge"
                        :class="row.status === 'finished' ? 'text-bg-success' : 'text-bg-warning'">
                      {{ row.status === 'finished' ? 'Finalizado' : 'En progreso' }}
                    </span>
                </td>
              </tr>
              </tbody>
            </table>
          </div>

          <p v-else class="text-muted mb-0">
            Este jugador todavía no tiene partidos registrados en los que haya participado.
          </p>
        </template>
      </template>
    </div>
  </section>
</template>
