<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'

type TeamRow = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  played_at: string
  team_a: {
    name: string
  } | null
  team_b: {
    name: string
  } | null
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
const matches = ref<MatchRow[]>([])
const loading = ref(false)
const errorMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  const [{ data: teamsData, error: teamsError }, { data: matchesData, error: matchesError }] =
      await Promise.all([
        supabase.from('teams').select('id, name').order('name', { ascending: true }),
        supabase
            .from('matches')
            .select(`
          id,
          team_a_id,
          team_b_id,
          team_a_score,
          team_b_score,
          played_at,
          team_a:team_a_id(name),
          team_b:team_b_id(name)
        `)
            .order('played_at', { ascending: false })
      ])

  if (teamsError) {
    errorMessage.value = teamsError.message
    teams.value = []
    matches.value = []
    loading.value = false
    return
  }

  if (matchesError) {
    errorMessage.value = matchesError.message
    teams.value = []
    matches.value = []
    loading.value = false
    return
  }

  teams.value = teamsData ?? []
  matches.value = (matchesData as MatchRow[]) ?? []

  loading.value = false
}

const standings = computed<StandingRow[]>(() => {
  const tableMap = new Map<string, StandingRow>()

  for (const team of teams.value) {
    tableMap.set(team.id, {
      teamId: team.id,
      team: team.name,
      played: 0,
      won: 0,
      lost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
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
            Clasificación calculada automáticamente a partir de los partidos.
          </p>
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
            <td>{{ row.diff }}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
