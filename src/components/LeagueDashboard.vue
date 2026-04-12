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
  player_id: string
  points: number
  three_pointers: number
}

const props = defineProps<{
  refreshKey: number
}>()

const teams = ref<TeamRow[]>([])
const baseStandings = ref<BaseStandingRow[]>([])
const matches = ref<MatchRow[]>([])
const players = ref<PlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])
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
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('standings_base').select('team_id, base_played, base_won, base_lost'),
      supabase
          .from('matches')
          .select('id, team_a_id, team_b_id, team_a_score, team_b_score, played_at')
          .order('played_at', { ascending: false }),
      supabase.from('players').select('id, name, team_id'),
      supabase.from('player_game_stats').select('player_id, points, three_pointers')
    ])

    if (teamsError) throw teamsError
    if (baseError) throw baseError
    if (matchesError) throw matchesError
    if (playersError) throw playersError
    if (statsError) throw statsError

    teams.value = teamsData ?? []
    baseStandings.value = baseData ?? []
    matches.value = matchesData ?? []
    players.value = playersData ?? []
    playerStats.value = statsData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando dashboard'
  } finally {
    loading.value = false
  }
}

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

  for (const match of matches.value) {
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

const rivalryRecord = computed(() => {
  const santa = standings.value.find((row) => row.team === 'Santa Cruz')
  const kendall = standings.value.find((row) => row.team === 'Kendall')

  if (!santa || !kendall) return null

  return {
    santaWins: santa.won,
    kendallWins: kendall.won
  }
})

const latestMatch = computed(() => {
  if (!matches.value.length) return null

  const match = matches.value[0]
  const teamMap = new Map(teams.value.map((team) => [team.id, team.name]))

  return {
    playedAt: match.played_at,
    teamA: teamMap.get(match.team_a_id) ?? 'Equipo A',
    teamB: teamMap.get(match.team_b_id) ?? 'Equipo B',
    scoreA: match.team_a_score,
    scoreB: match.team_b_score
  }
})

const playerTotals = computed(() => {
  const playerMap = new Map(players.value.map((player) => [player.id, player]))
  const totals = new Map<string, { name: string; points: number; threes: number }>()

  for (const stat of playerStats.value) {
    const player = playerMap.get(stat.player_id)
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

const topScorer = computed(() => {
  return [...playerTotals.value].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0] ?? null
})

const topThreeShooter = computed(() => {
  return [...playerTotals.value].sort((a, b) => b.threes - a.threes || a.name.localeCompare(b.name))[0] ?? null
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
            <div class="text-muted mt-1">
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
            <i class="fa-solid fa-scale-balanced me-2 text-primary"></i>
            Santa Cruz vs Kendall
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div class="text-center flex-fill">
                <div class="small text-muted">Santa Cruz</div>
                <div class="fs-3 fw-bold">{{ rivalryRecord?.santaWins ?? 0 }}</div>
              </div>

              <div class="px-3 fw-bold text-muted">-</div>

              <div class="text-center flex-fill">
                <div class="small text-muted">Kendall</div>
                <div class="fs-3 fw-bold">{{ rivalryRecord?.kendallWins ?? 0 }}</div>
              </div>
            </div>

            <div class="small text-muted text-center mt-2">
              Histórico total
            </div>
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
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-semibold">{{ latestMatch.teamA }}</span>
              <span class="badge bg-dark fs-6 px-3 py-2">
                <i class="fa-solid fa-basketball me-1"></i>
                {{ latestMatch.scoreA }} - {{ latestMatch.scoreB }}
              </span>
              <span class="fw-semibold text-end">{{ latestMatch.teamB }}</span>
            </div>

            <div class="small text-muted">
              {{ formatDate(latestMatch.playedAt) }}
            </div>
          </div>
          <div v-else class="card-body text-muted">
            No hay partidos registrados todavía.
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-bullseye me-2 text-success"></i>
            Top anotador
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ topScorer?.name ?? 'N/A' }}</div>
            <div class="small text-muted mt-1">Puntos acumulados</div>
            <div class="display-6 fw-bold text-primary mt-2">
              {{ topScorer?.points ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6">
        <div class="card shadow-sm h-100">
          <div class="card-header">
            <i class="fa-solid fa-fire me-2 text-warning"></i>
            Líder en triples
          </div>
          <div class="card-body">
            <div class="fs-5 fw-bold">{{ topThreeShooter?.name ?? 'N/A' }}</div>
            <div class="small text-muted mt-1">Triples acumulados</div>
            <div class="display-6 fw-bold text-danger mt-2">
              {{ topThreeShooter?.threes ?? 0 }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
