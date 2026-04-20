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

const props = defineProps<{
  refreshKey?: number
}>()

const teams = ref<TeamRow[]>([])
const baseStandings = ref<BaseStandingRow[]>([])
const matches = ref<MatchRow[]>([])

const selectedTeamAId = ref('')
const selectedTeamBId = ref('')

const loading = ref(false)
const errorMessage = ref('')

const LEGACY_RIVALRY_TEAM_NAMES = ['Santa Cruz', 'Kendall']

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: baseData, error: baseError },
      { data: matchesData, error: matchesError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('standings_base').select('team_id, base_played, base_won, base_lost'),
      supabase
          .from('matches')
          .select('id, team_a_id, team_b_id, team_a_score, team_b_score, played_at, created_at, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false })
    ])

    if (teamsError) throw teamsError
    if (baseError) throw baseError
    if (matchesError) throw matchesError

    teams.value = teamsData ?? []
    baseStandings.value = baseData ?? []
    matches.value = matchesData ?? []

    if (!selectedTeamAId.value && teams.value.length >= 2) {
      selectedTeamAId.value = teams.value[0].id
      selectedTeamBId.value = teams.value[1].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando tabla'
  } finally {
    loading.value = false
  }
}

const finishedMatches = computed(() => {
  return matches.value.filter((match) => match.status === 'finished')
})

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const baseMap = computed(() => {
  return new Map(baseStandings.value.map((row) => [row.team_id, row]))
})

const selectedTeamAName = computed(() => {
  return teamsMap.value.get(selectedTeamAId.value) ?? ''
})

const selectedTeamBName = computed(() => {
  return teamsMap.value.get(selectedTeamBId.value) ?? ''
})

const useLegacyBaseForHeadToHead = computed(() => {
  const selectedNames = [selectedTeamAName.value, selectedTeamBName.value].sort()
  const legacyNames = [...LEGACY_RIVALRY_TEAM_NAMES].sort()

  return (
      selectedNames.length === 2 &&
      selectedNames[0] === legacyNames[0] &&
      selectedNames[1] === legacyNames[1]
  )
})

const standings = computed<StandingRow[]>(() => {
  const tableMap = new Map<string, StandingRow>()

  for (const team of teams.value) {
    const base = baseMap.value.get(team.id)

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

const appHeadToHeadMatches = computed(() => {
  if (!selectedTeamAId.value || !selectedTeamBId.value) return []

  return finishedMatches.value
      .filter((match) => {
        const directA =
            match.team_a_id === selectedTeamAId.value &&
            match.team_b_id === selectedTeamBId.value

        const directB =
            match.team_a_id === selectedTeamBId.value &&
            match.team_b_id === selectedTeamAId.value

        return directA || directB
      })
      .sort((a, b) => {
        if (a.played_at !== b.played_at) return b.played_at.localeCompare(a.played_at)
        return a.created_at.localeCompare(b.created_at)
      })
})

const historicalHeadToHeadSummary = computed(() => {
  let appTeamAWins = 0
  let appTeamBWins = 0
  let appTeamAPointsFor = 0
  let appTeamBPointsFor = 0

  for (const match of appHeadToHeadMatches.value) {
    const isTeamAHome = match.team_a_id === selectedTeamAId.value

    const scoreA = isTeamAHome ? match.team_a_score : match.team_b_score
    const scoreB = isTeamAHome ? match.team_b_score : match.team_a_score

    appTeamAPointsFor += scoreA
    appTeamBPointsFor += scoreB

    if (scoreA > scoreB) {
      appTeamAWins += 1
    } else if (scoreB > scoreA) {
      appTeamBWins += 1
    }
  }

  const legacyBaseTeamAWins = useLegacyBaseForHeadToHead.value
      ? (baseMap.value.get(selectedTeamAId.value)?.base_won ?? 0)
      : 0

  const legacyBaseTeamBWins = useLegacyBaseForHeadToHead.value
      ? (baseMap.value.get(selectedTeamBId.value)?.base_won ?? 0)
      : 0

  return {
    teamAWins: legacyBaseTeamAWins + appTeamAWins,
    teamBWins: legacyBaseTeamBWins + appTeamBWins,
    teamAPointsFor: appTeamAPointsFor,
    teamBPointsFor: appTeamBPointsFor,
    appGames: appHeadToHeadMatches.value.length,
    legacyIncluded: useLegacyBaseForHeadToHead.value
  }
})

const latestAppHeadToHeadDate = computed(() => {
  return appHeadToHeadMatches.value[0]?.played_at ?? ''
})

const latestAppHeadToHeadJornadaMatches = computed(() => {
  if (!latestAppHeadToHeadDate.value) return []

  return appHeadToHeadMatches.value
      .filter((match) => match.played_at === latestAppHeadToHeadDate.value)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
})

const latestAppHeadToHeadJornadaSummary = computed(() => {
  if (!latestAppHeadToHeadJornadaMatches.value.length) return null

  let teamAWins = 0
  let teamBWins = 0
  let teamAPointsFor = 0
  let teamBPointsFor = 0

  for (const match of latestAppHeadToHeadJornadaMatches.value) {
    const isTeamAHome = match.team_a_id === selectedTeamAId.value

    const scoreA = isTeamAHome ? match.team_a_score : match.team_b_score
    const scoreB = isTeamAHome ? match.team_b_score : match.team_a_score

    teamAPointsFor += scoreA
    teamBPointsFor += scoreB

    if (scoreA > scoreB) {
      teamAWins += 1
    } else if (scoreB > scoreA) {
      teamBWins += 1
    }
  }

  return {
    date: latestAppHeadToHeadDate.value,
    teamAWins,
    teamBWins,
    teamAPointsFor,
    teamBPointsFor,
    totalGames: latestAppHeadToHeadJornadaMatches.value.length
  }
})

function teamName(teamId: string, fallback = 'Equipo') {
  return teamsMap.value.get(teamId) ?? fallback
}

function scoreFromPerspective(match: MatchRow) {
  const isTeamAHome = match.team_a_id === selectedTeamAId.value

  const scoreA = isTeamAHome ? match.team_a_score : match.team_b_score
  const scoreB = isTeamAHome ? match.team_b_score : match.team_a_score

  return `${scoreA} - ${scoreB}`
}

function resultFromPerspective(match: MatchRow) {
  const isTeamAHome = match.team_a_id === selectedTeamAId.value

  const scoreA = isTeamAHome ? match.team_a_score : match.team_b_score
  const scoreB = isTeamAHome ? match.team_b_score : match.team_a_score

  if (scoreA > scoreB) return 'Victoria'
  if (scoreB > scoreA) return 'Derrota'
  return 'Empate'
}

watch(
    () => props.refreshKey,
    () => {
      loadData()
    }
)

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Tabla</h2>
        <p class="text-body-secondary mb-0">
          Consulta la clasificación general y el histórico cara a cara entre equipos.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando tabla...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="card border mb-4">
          <div class="card-body">
            <h3 class="h5 mb-3">Clasificación general</h3>

            <div class="table-responsive">
              <table class="table table-striped align-middle mb-0">
                <thead class="table-light">
                <tr>
                  <th>#</th>
                  <th>Equipo</th>
                  <th>PJ</th>
                  <th>G</th>
                  <th>P</th>
                  <th>Diff</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(row, index) in standings" :key="row.teamId">
                  <td>{{ index + 1 }}</td>
                  <td class="fw-semibold">{{ row.team }}</td>
                  <td>{{ row.played }}</td>
                  <td>{{ row.won }}</td>
                  <td>{{ row.lost }}</td>
                  <td>
                      <span :class="row.diff >= 0 ? 'text-success fw-semibold' : 'text-danger fw-semibold'">
                        {{ row.diff }}
                      </span>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card border">
          <div class="card-body">
            <h3 class="h5 mb-3">Cara a cara entre equipos</h3>

            <div class="row g-3 mb-4">
              <div class="col-12 col-lg-6">
                <label class="form-label">Equipo A</label>
                <select v-model="selectedTeamAId" class="form-select">
                  <option value="">Selecciona equipo</option>
                  <option
                      v-for="team in teams"
                      :key="team.id"
                      :value="team.id">
                    {{ team.name }}
                  </option>
                </select>
              </div>

              <div class="col-12 col-lg-6">
                <label class="form-label">Equipo B</label>
                <select v-model="selectedTeamBId" class="form-select">
                  <option value="">Selecciona equipo</option>
                  <option
                      v-for="team in teams"
                      :key="team.id"
                      :value="team.id">
                    {{ team.name }}
                  </option>
                </select>
              </div>
            </div>

            <template v-if="selectedTeamAId && selectedTeamBId && selectedTeamAId !== selectedTeamBId">
              <div class="row g-3 mb-2">
                <div class="col-12 col-md-6 col-xl-3">
                  <div class="card border-0 bg-light-subtle h-100">
                    <div class="card-body">
                      <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamAId) }}</div>
                      <div class="fw-bold fs-4">{{ historicalHeadToHeadSummary.teamAWins }}</div>
                      <div class="small text-body-secondary">victorias históricas</div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-md-6 col-xl-3">
                  <div class="card border-0 bg-light-subtle h-100">
                    <div class="card-body">
                      <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamBId) }}</div>
                      <div class="fw-bold fs-4">{{ historicalHeadToHeadSummary.teamBWins }}</div>
                      <div class="small text-body-secondary">victorias históricas</div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-md-6 col-xl-3">
                  <div class="card border-0 bg-light-subtle h-100">
                    <div class="card-body">
                      <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamAId) }}</div>
                      <div class="fw-bold fs-4">{{ historicalHeadToHeadSummary.teamAPointsFor }}</div>
                      <div class="small text-body-secondary">puntos en la app</div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-md-6 col-xl-3">
                  <div class="card border-0 bg-light-subtle h-100">
                    <div class="card-body">
                      <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamBId) }}</div>
                      <div class="fw-bold fs-4">{{ historicalHeadToHeadSummary.teamBPointsFor }}</div>
                      <div class="small text-body-secondary">puntos en la app</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card border mb-4" v-if="latestAppHeadToHeadJornadaSummary">
                <div class="card-body">
                  <h4 class="h6 mb-3">Última jornada entre estos equipos</h4>

                  <div class="small text-body-secondary mb-3">
                    {{ formatDate(latestAppHeadToHeadJornadaSummary.date) }} · {{ latestAppHeadToHeadJornadaSummary.totalGames }} partido(s)
                  </div>

                  <div class="row g-3">
                    <div class="col-12 col-md-6 col-xl-3">
                      <div class="card border-0 bg-light-subtle h-100">
                        <div class="card-body">
                          <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamAId) }}</div>
                          <div class="fw-bold fs-4">{{ latestAppHeadToHeadJornadaSummary.teamAWins }}</div>
                          <div class="small text-body-secondary">victorias en la jornada</div>
                        </div>
                      </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-3">
                      <div class="card border-0 bg-light-subtle h-100">
                        <div class="card-body">
                          <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamBId) }}</div>
                          <div class="fw-bold fs-4">{{ latestAppHeadToHeadJornadaSummary.teamBWins }}</div>
                          <div class="small text-body-secondary">victorias en la jornada</div>
                        </div>
                      </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-3">
                      <div class="card border-0 bg-light-subtle h-100">
                        <div class="card-body">
                          <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamAId) }}</div>
                          <div class="fw-bold fs-4">{{ latestAppHeadToHeadJornadaSummary.teamAPointsFor }}</div>
                          <div class="small text-body-secondary">puntos en la jornada</div>
                        </div>
                      </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-3">
                      <div class="card border-0 bg-light-subtle h-100">
                        <div class="card-body">
                          <div class="small text-body-secondary mb-1">{{ teamName(selectedTeamBId) }}</div>
                          <div class="fw-bold fs-4">{{ latestAppHeadToHeadJornadaSummary.teamBPointsFor }}</div>
                          <div class="small text-body-secondary">puntos en la jornada</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="appHeadToHeadMatches.length" class="table-responsive">
                <table class="table table-striped align-middle mb-0">
                  <thead class="table-light">
                  <tr>
                    <th>Fecha</th>
                    <th>Partido</th>
                    <th>Resultado</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-for="match in appHeadToHeadMatches" :key="match.id">
                    <td>{{ formatDate(match.played_at) }}</td>
                    <td class="fw-semibold">
                      {{ teamName(selectedTeamAId) }} vs {{ teamName(selectedTeamBId) }}
                    </td>
                    <td>
                        <span
                            class="badge"
                            :class="resultFromPerspective(match) === 'Victoria' ? 'text-bg-success' : 'text-bg-secondary'">
                          {{ scoreFromPerspective(match) }} · {{ resultFromPerspective(match) }}
                        </span>
                    </td>
                  </tr>
                  </tbody>
                </table>
              </div>

              <p v-else class="text-body-secondary mb-0">
                No hay partidos finalizados entre esos dos equipos dentro de la app.
              </p>
            </template>

            <p v-else class="text-body-secondary mb-0">
              Selecciona dos equipos diferentes para comparar su cara a cara.
            </p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
