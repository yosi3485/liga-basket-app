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
          .select('team_id, base_played, base_won, base_lost'),
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
          Solo cuenta partidos finalizados. Los juegos en progreso no afectan la clasificación.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando tabla...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <div v-else class="table-responsive">
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
  </section>
</template>
