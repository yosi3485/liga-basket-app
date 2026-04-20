<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'

type TeamRow = {
  id: string
  name: string
}

type BaseStandingRow = {
  team_id: string
  base_played: number
  base_won: number
  base_lost: number
}

type MatchRow = {
  id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  played_at: string
  created_at: string
  status: 'in_progress' | 'finished'
}

type StandingRow = {
  teamId: string
  team: string
  played: number
  won: number
  lost: number
  diff: number
}

type PlayerRow = {
  id: string
  name: string
  team_id: string
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

const props = defineProps<{
  refreshKey: number
}>()

const teams = ref<TeamRow[]>([])
const baseStandings = ref<BaseStandingRow[]>([])
const matches = ref<MatchRow[]>([])
const players = ref<PlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])
const votes = ref<VoteRow[]>([])

const loading = ref(false)
const errorMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: baseData, error: baseError },
      { data: matchesData, error: matchesError },
      { data: playersData, error: playersError },
      { data: statsData, error: statsError },
      { data: votesData, error: votesError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('standings_base').select('team_id, base_played, base_won, base_lost'),
      supabase
          .from('matches')
          .select('id, team_a_id, team_b_id, team_a_score, team_b_score, played_at, created_at, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),
      supabase.from('players').select('id, name, team_id'),
      supabase.from('player_game_stats').select('match_id, player_id, points, three_pointers'),
      supabase.from('match_mvp_votes').select('id, played_at, voter_player_id, voted_player_id')
    ])

    if (teamsError) throw teamsError
    if (baseError) throw baseError
    if (matchesError) throw matchesError
    if (playersError) throw playersError
    if (statsError) throw statsError
    if (votesError) throw votesError

    teams.value = teamsData ?? []
    baseStandings.value = baseData ?? []
    matches.value = matchesData ?? []
    players.value = playersData ?? []
    playerStats.value = statsData ?? []
    votes.value = votesData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando dashboard'
  } finally {
    loading.value = false
  }
}

const finishedMatches = computed(() => {
  return matches.value.filter((match) => match.status === 'finished')
})

const teamNameMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const playerMap = computed(() => {
  return new Map(players.value.map((player) => [player.id, player]))
})

const standings = computed<StandingRow[]>(() => {
  const tableMap = new Map<string, StandingRow>()
  const baseMap = new Map(baseStandings.value.map((row) => [row.team_id, row]))

  for (const team of teams.value) {
    const base = baseMap.get(team.id)

    tableMap.set(team.id, {
      teamId: team.id,
      team: team.name,
      played: base?.base_played ?? 0,
      won: base?.base_won ?? 0,
      lost: base?.base_lost ?? 0,
      diff: 0
    })
  }

  for (const match of finishedMatches.value) {
    const teamA = tableMap.get(match.team_a_id)
    const teamB = tableMap.get(match.team_b_id)

    if (!teamA || !teamB) continue

    teamA.played += 1
    teamB.played += 1

    if (match.team_a_score > match.team_b_score) {
      teamA.won += 1
      teamB.lost += 1
    } else if (match.team_b_score > match.team_a_score) {
      teamB.won += 1
      teamA.lost += 1
    }

    teamA.diff += match.team_a_score - match.team_b_score
    teamB.diff += match.team_b_score - match.team_a_score
  }

  return Array.from(tableMap.values()).sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won
    if (b.diff !== a.diff) return b.diff - a.diff
    return a.team.localeCompare(b.team)
  })
})

const leader = computed(() => standings.value[0] ?? null)

const latestMatch = computed(() => {
  if (!finishedMatches.value.length) return null

  const match = finishedMatches.value[0]

  return {
    playedAt: match.played_at,
    teamA: teamNameMap.value.get(match.team_a_id) ?? 'Equipo A',
    teamB: teamNameMap.value.get(match.team_b_id) ?? 'Equipo B',
    scoreA: match.team_a_score,
    scoreB: match.team_b_score,
    status: match.status
  }
})

const latestDateOverall = computed(() => {
  return matches.value[0]?.played_at ?? ''
})

const latestFinishedDate = computed(() => {
  return finishedMatches.value[0]?.played_at ?? ''
})

const playerTotals = computed(() => {
  const totals = new Map<string, { name: string; points: number; threes: number }>()

  for (const player of players.value) {
    totals.set(player.id, {
      name: player.name,
      points: 0,
      threes: 0
    })
  }

  for (const stat of playerStats.value) {
    const current = totals.get(stat.player_id)
    if (!current) continue

    current.points += stat.points ?? 0
    current.threes += stat.three_pointers ?? 0
  }

  return Array.from(totals.values())
})

const topScorer = computed(() => {
  return [...playerTotals.value]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0] ?? null
})

const topThreeShooter = computed(() => {
  return [...playerTotals.value]
      .sort((a, b) => b.threes - a.threes || a.name.localeCompare(b.name))[0] ?? null
})

const latestJornadaMatchesAllStatuses = computed(() => {
  if (!latestDateOverall.value) return []
  return matches.value.filter((match) => match.played_at === latestDateOverall.value)
})

const latestJornadaMatchesFinishedOnly = computed(() => {
  if (!latestFinishedDate.value) return []
  return finishedMatches.value.filter((match) => match.played_at === latestFinishedDate.value)
})

const latestJornadaStats = computed(() => {
  if (!latestJornadaMatchesAllStatuses.value.length) return []

  const latestMatchIds = new Set(latestJornadaMatchesAllStatuses.value.map((match) => match.id))
  const totals = new Map<string, { name: string; points: number; threes: number }>()

  for (const stat of playerStats.value.filter((row) => latestMatchIds.has(row.match_id))) {
    const player = playerMap.value.get(stat.player_id)
    if (!player) continue

    if (!totals.has(player.id)) {
      totals.set(player.id, {
        name: player.name,
        points: 0,
        threes: 0
      })
    }

    const current = totals.get(player.id)!
    current.points += stat.points ?? 0
    current.threes += stat.three_pointers ?? 0
  }

  return Array.from(totals.values())
})

const latestJornadaTopScorer = computed(() => {
  return [...latestJornadaStats.value]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0] ?? null
})

const latestJornadaTopThreeShooter = computed(() => {
  return [...latestJornadaStats.value]
      .sort((a, b) => b.threes - a.threes || a.name.localeCompare(b.name))[0] ?? null
})

const jornadaPlayerRecords = computed(() => {
  const jornadaMap = new Map<string, { name: string; points: number; threes: number; playedAt: string }>()

  for (const stat of playerStats.value) {
    const match = matches.value.find((item) => item.id === stat.match_id)
    if (!match) continue

    const player = playerMap.value.get(stat.player_id)
    if (!player) continue

    const key = `${match.played_at}-${stat.player_id}`

    if (!jornadaMap.has(key)) {
      jornadaMap.set(key, {
        name: player.name,
        points: 0,
        threes: 0,
        playedAt: match.played_at
      })
    }

    const current = jornadaMap.get(key)!
    current.points += stat.points ?? 0
    current.threes += stat.three_pointers ?? 0
  }

  return Array.from(jornadaMap.values())
})

const bestPointsInJornada = computed(() => {
  return [...jornadaPlayerRecords.value]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0] ?? null
})

const bestThreesInJornada = computed(() => {
  return [...jornadaPlayerRecords.value]
      .sort((a, b) => b.threes - a.threes || a.name.localeCompare(b.name))[0] ?? null
})

const latestJornadaWinner = computed(() => {
  if (!latestJornadaMatchesFinishedOnly.value.length) return null

  const winsMap = new Map<string, number>()

  for (const match of latestJornadaMatchesFinishedOnly.value) {
    if (match.team_a_score > match.team_b_score) {
      winsMap.set(match.team_a_id, (winsMap.get(match.team_a_id) ?? 0) + 1)
    } else if (match.team_b_score > match.team_a_score) {
      winsMap.set(match.team_b_id, (winsMap.get(match.team_b_id) ?? 0) + 1)
    }
  }

  const ranking = Array.from(winsMap.entries()).sort((a, b) => b[1] - a[1])
  if (!ranking.length) return null

  const topWins = ranking[0][1]
  const winners = ranking.filter((entry) => entry[1] === topWins)

  if (winners.length !== 1) {
    return {
      type: 'tie' as const,
      wins: topWins,
      teams: winners.map(([teamId]) => teamNameMap.value.get(teamId) ?? 'Equipo')
    }
  }

  return {
    type: 'single' as const,
    teamName: teamNameMap.value.get(ranking[0][0]) ?? 'Equipo',
    wins: topWins
  }
})

const latestJornadaMvp = computed(() => {
  if (!latestFinishedDate.value) return null

  const votesForDate = votes.value.filter((vote) => vote.played_at === latestFinishedDate.value)
  if (!votesForDate.length) return null

  const counts = new Map<string, number>()

  for (const vote of votesForDate) {
    counts.set(vote.voted_player_id, (counts.get(vote.voted_player_id) ?? 0) + 1)
  }

  const ranking = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  if (!ranking.length) return null

  const topVotes = ranking[0][1]
  const winners = ranking.filter((entry) => entry[1] === topVotes)

  if (winners.length === 1) {
    const playerId = winners[0][0]
    const player = playerMap.value.get(playerId)

    return {
      type: 'single' as const,
      playedAt: latestFinishedDate.value,
      playerName: player?.name ?? 'Jugador',
      teamName: player ? (teamNameMap.value.get(player.team_id) ?? 'Sin equipo') : 'Sin equipo',
      votes: topVotes
    }
  }

  return {
    type: 'tie' as const,
    playedAt: latestFinishedDate.value,
    winners: winners.map(([playerId, totalVotes]) => {
      const player = playerMap.value.get(playerId)

      return {
        playerName: player?.name ?? 'Jugador',
        teamName: player ? (teamNameMap.value.get(player.team_id) ?? 'Sin equipo') : 'Sin equipo',
        votes: totalVotes
      }
    })
  }
})

onMounted(loadData)

watch(
    () => props.refreshKey,
    () => {
      loadData()
    }
)
</script>

<template>
  <section class="mb-4">
    <p v-if="loading" class="mb-0">Cargando dashboard...</p>

    <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
      {{ errorMessage }}
    </div>

    <div v-else class="row g-3">
      <div class="col-12 col-xl-4">
        <div class="card shadow-sm border-dark h-100">
          <div class="card-header bg-dark text-white">
            <i class="fa-solid fa-trophy me-2 text-warning"></i>
            Líder actual
          </div>
          <div class="card-body">
            <div class="fs-4 fw-bold">{{ leader?.team ?? 'N/A' }}</div>
            <div class="text-body-secondary mt-1">
              Récord: {{ leader?.won ?? 0 }} - {{ leader?.lost ?? 0 }}
            </div>
            <div class="small mt-2">
              Diferencial:
              <span
                  class="fw-semibold"
                  :class="(leader?.diff ?? 0) >= 0 ? 'text-success' : 'text-danger'">
                {{ leader?.diff ?? 0 }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-medal me-2 text-success"></i>
            Equipo ganador última jornada
          </div>
          <div class="card-body">
            <template v-if="latestJornadaWinner?.type === 'single'">
              <div class="fs-4 fw-bold">{{ latestJornadaWinner.teamName }}</div>
              <div class="display-6 fw-bold text-success mt-2">
                {{ latestJornadaWinner.wins }}
              </div>
              <div class="small text-body-secondary">victoria(s) en la jornada</div>
            </template>

            <template v-else-if="latestJornadaWinner?.type === 'tie'">
              <div class="fw-bold mb-2">Empate en la jornada</div>
              <ul class="mb-0">
                <li v-for="team in latestJornadaWinner.teams" :key="team">
                  {{ team }}
                </li>
              </ul>
            </template>

            <template v-else>
              <div class="text-body-secondary">
                No hay suficiente información para determinar el ganador de la última jornada finalizada.
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-clock-rotate-left me-2 text-danger"></i>
            Último partido
          </div>
          <div class="card-body" v-if="latestMatch">
            <div class="small text-body-secondary mb-2">
              {{ formatDate(latestMatch.playedAt) }}
            </div>

            <div class="row align-items-center text-center g-3">
              <div class="col-5">
                <div class="fw-bold fs-5">{{ latestMatch.teamA }}</div>
              </div>

              <div class="col-2">
                <div class="badge bg-dark fs-5 px-3 py-2">
                  {{ latestMatch.scoreA }} - {{ latestMatch.scoreB }}
                </div>
              </div>

              <div class="col-5">
                <div class="fw-bold fs-5">{{ latestMatch.teamB }}</div>
              </div>
            </div>

            <div class="mt-3">
              <span class="badge text-bg-success">
                <i class="fa-solid fa-circle me-1"></i>
                Finalizado
              </span>
            </div>
          </div>
          <div v-else class="card-body text-body-secondary">
            No hay partidos finalizados todavía.
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm border-warning h-100">
          <div class="card-header">
            <i class="fa-solid fa-star me-2 text-warning"></i>
            MVP de la jornada
          </div>

          <div v-if="latestJornadaMvp" class="card-body">
            <div class="small text-body-secondary mb-2">
              {{ formatDate(latestJornadaMvp.playedAt) }}
            </div>

            <template v-if="latestJornadaMvp.type === 'single'">
              <div class="fs-4 fw-bold">🏆 {{ latestJornadaMvp.playerName }}</div>
              <div class="text-body-secondary mt-1">
                {{ latestJornadaMvp.teamName }}
              </div>
              <div class="small mt-2">
                {{ latestJornadaMvp.votes }} voto(s)
              </div>
            </template>

            <template v-else>
              <div class="fw-bold mb-2">🤝 Empate en el MVP</div>
              <ul class="mb-0">
                <li v-for="winner in latestJornadaMvp.winners" :key="winner.playerName">
                  {{ winner.playerName }} · {{ winner.teamName }} · {{ winner.votes }} voto(s)
                </li>
              </ul>
            </template>
          </div>

          <div v-else class="card-body text-body-secondary">
            Todavía no hay votos registrados para la jornada finalizada más reciente.
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-bullseye me-2 text-success"></i>
            Top anotador general
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ topScorer?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-primary mt-2">
              {{ topScorer?.points ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-fire me-2 text-warning"></i>
            Líder en triples general
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ topThreeShooter?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-danger mt-2">
              {{ topThreeShooter?.threes ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-chart-line me-2 text-info"></i>
            Top anotador última jornada
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ latestJornadaTopScorer?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-info mt-2">
              {{ latestJornadaTopScorer?.points ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-basketball me-2 text-warning"></i>
            Líder en triples última jornada
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ latestJornadaTopThreeShooter?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-warning mt-2">
              {{ latestJornadaTopThreeShooter?.threes ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-trophy me-2 text-primary"></i>
            Récord de puntos en una jornada
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ bestPointsInJornada?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-primary mt-2">
              {{ bestPointsInJornada?.points ?? 0 }}
            </div>
            <div class="small text-body-secondary mt-1">
              {{ bestPointsInJornada ? formatDate(bestPointsInJornada.playedAt) : 'Sin jornada registrada' }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-bolt me-2 text-warning"></i>
            Récord de triples en una jornada
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ bestThreesInJornada?.name ?? 'N/A' }}</div>
            <div class="display-6 fw-bold text-warning mt-2">
              {{ bestThreesInJornada?.threes ?? 0 }}
            </div>
            <div class="small text-body-secondary mt-1">
              {{ bestThreesInJornada ? formatDate(bestThreesInJornada.playedAt) : 'Sin jornada registrada' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
