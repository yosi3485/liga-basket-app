<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import { getMatchLabel } from '../utils/matches'

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
  team_id: string | null
}

type PlayerStatRow = {
  match_id: string
  player_id: string
  points: number
  three_pointers: number
}

type VoteRow = {
  id: string
  played_at: string
  voter_player_id: string
  voted_player_id: string
}

type PlayerMatchHistoryRow = {
  matchId: string
  playedAt: string
  createdAt: string
  matchLabel: string
  teamName: string
  opponentName: string
  teamScore: number
  opponentScore: number
  result: 'W' | 'L'
  points: number
  threes: number
  status: 'in_progress' | 'finished'
}

type PlayerMvpWinRow = {
  playedAt: string
  votes: number
}

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const matches = ref<MatchRow[]>([])
const matchPlayers = ref<MatchPlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])
const votes = ref<VoteRow[]>([])

const selectedPlayerId = ref('')
const selectedDate = ref('')
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
      { data: playerStatsData, error: playerStatsError },
      { data: votesData, error: votesError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('players').select('id, name, team_id, jersey_number, is_active').order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),
      supabase.from('match_players').select('match_id, player_id, team_id'),
      supabase.from('player_game_stats').select('match_id, player_id, points, three_pointers'),
      supabase.from('match_mvp_votes').select('id, played_at, voter_player_id, voted_player_id')
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchesError) throw matchesError
    if (matchPlayersError) throw matchPlayersError
    if (playerStatsError) throw playerStatsError
    if (votesError) throw votesError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    matches.value = matchesData ?? []
    matchPlayers.value = matchPlayersData ?? []
    playerStats.value = playerStatsData ?? []
    votes.value = votesData ?? []

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

        const playerTeamId = rosterEntry?.team_id ?? selectedPlayer.value?.team_id ?? ''
        const playerTeamName = teamsMap.value.get(playerTeamId) ?? 'Equipo'

        const opponentTeamId =
            playerTeamId === match.team_a_id ? match.team_b_id : match.team_a_id

        const opponentTeamName = teamsMap.value.get(opponentTeamId) ?? 'Rival'

        const playerTeamScore =
            playerTeamId === match.team_a_id ? match.team_a_score : match.team_b_score

        const opponentScore =
            playerTeamId === match.team_a_id ? match.team_b_score : match.team_a_score

        const result: 'W' | 'L' = playerTeamScore > opponentScore ? 'W' : 'L'

        return {
          matchId: match.id,
          playedAt: match.played_at,
          createdAt: match.created_at,
          matchLabel: getMatchLabel(match, matches.value),
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
        if (a.playedAt !== b.playedAt) return b.playedAt.localeCompare(a.playedAt)
        return a.createdAt.localeCompare(b.createdAt)
      })
})

const availableDates = computed(() => {
  return [...new Set(selectedPlayerHistory.value.map((row) => row.playedAt))]
      .sort((a, b) => b.localeCompare(a))
})

const historyForSelectedDate = computed(() => {
  if (!selectedDate.value) return []

  return selectedPlayerHistory.value
      .filter((row) => row.playedAt === selectedDate.value)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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

const averagePoints = computed(() => {
  if (!totalGames.value) return 0
  return totalPoints.value / totalGames.value
})

const averageThrees = computed(() => {
  if (!totalGames.value) return 0
  return totalThrees.value / totalGames.value
})

const jornadasJugadas = computed(() => {
  return new Set(selectedPlayerHistory.value.map((row) => row.playedAt)).size
})

const bestPointsGame = computed(() => {
  return [...selectedPlayerHistory.value].sort((a, b) => b.points - a.points)[0] ?? null
})

const bestThreesGame = computed(() => {
  return [...selectedPlayerHistory.value].sort((a, b) => b.threes - a.threes)[0] ?? null
})

const playerMvpWins = computed<PlayerMvpWinRow[]>(() => {
  if (!selectedPlayerId.value) return []

  const distinctDates = [...new Set(votes.value.map((vote) => vote.played_at))]
  const wins: PlayerMvpWinRow[] = []

  for (const date of distinctDates) {
    const votesForDate = votes.value.filter((vote) => vote.played_at === date)
    if (!votesForDate.length) continue

    const counts = new Map<string, number>()

    for (const vote of votesForDate) {
      counts.set(vote.voted_player_id, (counts.get(vote.voted_player_id) ?? 0) + 1)
    }

    const ranking = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    if (!ranking.length) continue

    const topVotes = ranking[0][1]
    const topPlayers = ranking.filter((entry) => entry[1] === topVotes)

    if (topPlayers.length === 1 && topPlayers[0][0] === selectedPlayerId.value) {
      wins.push({
        playedAt: date,
        votes: topVotes
      })
    }
  }

  return wins.sort((a, b) => b.playedAt.localeCompare(a.playedAt))
})

const totalMvpWins = computed(() => playerMvpWins.value.length)

watch(selectedPlayerId, () => {
  errorMessage.value = ''
  selectedDate.value = availableDates.value[0] ?? ''
})

onMounted(async () => {
  await loadData()
  selectedDate.value = availableDates.value[0] ?? ''
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Perfil del jugador</h2>
        <p class="text-body-secondary mb-0">
          Estadísticas, jornadas jugadas, promedios y MVPs del jugador.
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

          <div class="col-12 col-lg-6">
            <label class="form-label">Jornada</label>
            <select v-model="selectedDate" class="form-select">
              <option value="">Selecciona una jornada</option>
              <option
                  v-for="date in availableDates"
                  :key="date"
                  :value="date">
                {{ formatDate(date) }} · Jornada
              </option>
            </select>
          </div>
        </div>

        <template v-if="selectedPlayer">
          <div class="row g-3 mb-4">
            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Equipo base</div>
                  <div class="fw-bold">{{ teamsMap.get(selectedPlayer.team_id) ?? 'Sin equipo' }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Juegos jugados</div>
                  <div class="fw-bold">{{ totalGames }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Récord</div>
                  <div class="fw-bold">{{ totalWins }} - {{ totalLosses }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-warning-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">MVPs ganados</div>
                  <div class="fw-bold">🏆 {{ totalMvpWins }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Puntos totales</div>
                  <div class="fw-bold">{{ totalPoints }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Triples totales</div>
                  <div class="fw-bold">{{ totalThrees }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Promedio de puntos</div>
                  <div class="fw-bold">{{ averagePoints.toFixed(1) }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Promedio de triples</div>
                  <div class="fw-bold">{{ averageThrees.toFixed(1) }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Jornadas jugadas</div>
                  <div class="fw-bold">{{ jornadasJugadas }}</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Mejor partido en puntos</div>
                  <div class="fw-bold">{{ bestPointsGame?.points ?? 0 }}</div>
                  <div class="small text-body-secondary mt-1">
                    {{ bestPointsGame ? formatDate(bestPointsGame.playedAt) : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-6 col-xl-3">
              <div class="card border-0 bg-light-subtle h-100">
                <div class="card-body">
                  <div class="small text-body-secondary mb-1">Mejor partido en triples</div>
                  <div class="fw-bold">{{ bestThreesGame?.threes ?? 0 }}</div>
                  <div class="small text-body-secondary mt-1">
                    {{ bestThreesGame ? formatDate(bestThreesGame.playedAt) : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="row g-3 mb-4">
            <div class="col-12 col-lg-6">
              <div class="card border-warning h-100">
                <div class="card-body">
                  <h3 class="h5 mb-3">MVPs ganados por jornada</h3>

                  <ul v-if="playerMvpWins.length" class="mb-0">
                    <li v-for="win in playerMvpWins" :key="win.playedAt">
                      {{ formatDate(win.playedAt) }} · {{ win.votes }} voto(s)
                    </li>
                  </ul>

                  <p v-else class="text-body-secondary mb-0">
                    Este jugador todavía no ha ganado un MVP de jornada.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedDate && historyForSelectedDate.length" class="card border mb-4">
            <div class="card-body">
              <h3 class="h5 mb-3">
                {{ formatDate(selectedDate) }} · Jornada
              </h3>

              <div class="table-responsive">
                <table class="table table-striped align-middle mb-0">
                  <thead class="table-light">
                  <tr>
                    <th>Partido</th>
                    <th>Rival</th>
                    <th>Resultado</th>
                    <th>Puntos</th>
                    <th>3PT</th>
                    <th>Estado</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-for="row in historyForSelectedDate" :key="row.matchId">
                    <td class="fw-semibold">{{ row.matchLabel }}</td>
                    <td>{{ row.opponentName }}</td>
                    <td>
                        <span
                            class="badge"
                            :class="row.result === 'W' ? 'text-bg-success' : 'text-bg-secondary'">
                          {{ row.teamScore }} - {{ row.opponentScore }}
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
            </div>
          </div>

          <p v-else class="text-body-secondary mb-0">
            No hay partidos registrados para este jugador en la jornada seleccionada.
          </p>
        </template>
      </template>
    </div>
  </section>
</template>
