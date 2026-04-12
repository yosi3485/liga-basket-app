<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'

type TeamRow = {
  id: string
  name: string
}

type BaseStandingRow = {
  team_id: string
  base_played: number
  base_won: number
  base_lost: number
  base_points_for: number
  base_points_against: number
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
  pointsFor: number
  pointsAgainst: number
  diff: number
}

const props = defineProps<{
  refreshKey: number
}>()

const teams = ref<TeamRow[]>([])
const baseStandings = ref<BaseStandingRow[]>([])
const matches = ref<MatchRow[]>([])
const loading = ref(false)
const errorMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: baseData, error: baseError },
      { data: matchesData, error: matchesError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),
      supabase
          .from('standings_base')
          .select(`
          team_id,
          base_played,
          base_won,
          base_lost,
          base_points_for,
          base_points_against
        `),
      supabase
          .from('matches')
          .select(`
          id,
          team_a_id,
          team_b_id,
          team_a_score,
          team_b_score,
          played_at
        `)
          .order('played_at', { ascending: false })
    ])

    if (teamsError) throw teamsError
    if (baseError) throw baseError
    if (matchesError) throw matchesError

    teams.value = teamsData ?? []
    baseStandings.value = baseData ?? []
    matches.value = matchesData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando la tabla'
  } finally {
    loading.value = false
  }
}

const standings = computed<StandingRow[]>(() => {
  const tableMap = new Map<string, StandingRow>()
  const baseMap = new Map(
      baseStandings.value.map((row) => [row.team_id, row])
  )

  for (const team of teams.value) {
    const base = baseMap.get(team.id)

    tableMap.set(team.id, {
      teamId: team.id,
      team: team.name,
      played: base?.base_played ?? 0,
      won: base?.base_won ?? 0,
      lost: base?.base_lost ?? 0,
      pointsFor: base?.base_points_for ?? 0,
      pointsAgainst: base?.base_points_against ?? 0,
      diff: 0
    })
  }

  for (const match of matches.value) {
    const teamA = tableMap.get(match.team_a_id)
    const teamB = tableMap.get(match.team_b_id)

    if (!teamA || !teamB) continue

    teamA.played += 1
    teamB.played += 1

    teamA.pointsFor += match.team_a_score
    teamA.pointsAgainst += match.team_b_score

    teamB.pointsFor += match.team_b_score
    teamB.pointsAgainst += match.team_a_score

    if (match.team_a_score > match.team_b_score) {
      teamA.won += 1
      teamB.lost += 1
    } else if (match.team_b_score > match.team_a_score) {
      teamB.won += 1
      teamA.lost += 1
    }
  }

  const rows = Array.from(tableMap.values()).map((row) => ({
    ...row,
    diff: row.pointsFor - row.pointsAgainst
  }))

  rows.sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won
    if (b.diff !== a.diff) return b.diff - a.diff
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
    return a.team.localeCompare(b.team)
  })

  return rows
})

const rivalrySummary = computed(() => {
  const santaCruz = standings.value.find((row) => row.team === 'Santa Cruz')
  const kendall = standings.value.find((row) => row.team === 'Kendall')

  if (!santaCruz || !kendall) return null

  const leader =
      santaCruz.won > kendall.won
          ? 'Santa Cruz'
          : kendall.won > santaCruz.won
              ? 'Kendall'
              : 'Empate'

  return {
    santaCruzWins: santaCruz.won,
    kendallWins: kendall.won,
    totalGames: santaCruz.played,
    leader
  }
})

function diffClass(diff: number) {
  if (diff > 0) return 'text-success fw-semibold'
  if (diff < 0) return 'text-danger fw-semibold'
  return 'text-muted fw-semibold'
}

function diffLabel(diff: number) {
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

onMounted(() => {
  loadData()
})

watch(
    () => props.refreshKey,
    () => {
      loadData()
    }
)
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 class="h4 mb-1">Tabla de posiciones</h2>
          <p class="text-muted mb-0">
            Incluye balance inicial más los partidos registrados en la app.
          </p>
        </div>
      </div>

      <div
          v-if="rivalrySummary && !loading && !errorMessage"
          class="alert alert-secondary border mb-4"
          role="alert">
        <div class="d-flex flex-column flex-md-row justify-content-between gap-2">
          <div>
            <div class="fw-semibold mb-1">Récord histórico actual</div>
            <div>
              Santa Cruz
              <span class="badge text-bg-dark mx-1">{{ rivalrySummary.santaCruzWins }}</span>
              -
              <span class="badge text-bg-dark mx-1">{{ rivalrySummary.kendallWins }}</span>
              Kendall
            </div>
          </div>

          <div class="text-md-end">
            <div class="small text-muted">Total de juegos</div>
            <div class="fw-semibold">{{ rivalrySummary.totalGames }}</div>
            <div class="small">
              Líder:
              <span class="fw-semibold">{{ rivalrySummary.leader }}</span>
            </div>
          </div>
        </div>
      </div>

      <p v-if="loading" class="mb-0">Cargando tabla...</p>
      <p v-else-if="errorMessage" class="text-danger mb-0">{{ errorMessage }}</p>
      <p v-else-if="!standings.length" class="text-muted mb-0">
        No hay equipos todavía.
      </p>

      <div v-else class="table-responsive">
        <table class="table table-striped table-hover align-middle mb-0">
          <thead class="table-light">
          <tr>
            <th>#</th>
            <th>Equipo</th>
            <th>JJ</th>
            <th>G</th>
            <th>P</th>
            <th>PF</th>
            <th>PC</th>
            <th>DIF</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(row, index) in standings" :key="row.teamId">
            <td class="fw-semibold">{{ index + 1 }}</td>
            <td class="fw-semibold">{{ row.team }}</td>
            <td>{{ row.played }}</td>
            <td>{{ row.won }}</td>
            <td>{{ row.lost }}</td>
            <td>{{ row.pointsFor }}</td>
            <td>{{ row.pointsAgainst }}</td>
            <td :class="diffClass(row.diff)">
              {{ diffLabel(row.diff) }}
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
