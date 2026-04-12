<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

type TeamRow = {
  id: string
  name: string
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

type LeaderRow = {
  id: string
  name: string
  teamName: string
  totalPoints: number
  totalThrees: number
}

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const statsRows = ref<PlayerStatRow[]>([])
const loading = ref(false)
const errorMessage = ref('')

async function loadLeaderboard() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('players').select('id, name, team_id').order('name', { ascending: true }),
      supabase.from('player_game_stats').select('player_id, points, three_pointers')
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (statsError) throw statsError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    statsRows.value = statsData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando leaderboard'
    teams.value = []
    players.value = []
    statsRows.value = []
  } finally {
    loading.value = false
  }
}

const leaderboard = computed<LeaderRow[]>(() => {
  const teamMap = new Map(teams.value.map((team) => [team.id, team.name]))
  const playerMap = new Map(players.value.map((player) => [player.id, player]))

  const totals = new Map<string, LeaderRow>()

  for (const stat of statsRows.value) {
    const player = playerMap.get(stat.player_id)
    if (!player) continue

    if (!totals.has(player.id)) {
      totals.set(player.id, {
        id: player.id,
        name: player.name,
        teamName: teamMap.get(player.team_id) ?? 'Sin equipo',
        totalPoints: 0,
        totalThrees: 0
      })
    }

    const current = totals.get(player.id)!
    current.totalPoints += stat.points ?? 0
    current.totalThrees += stat.three_pointers ?? 0
  }

  return Array.from(totals.values())
})

const topScorers = computed(() => {
  return [...leaderboard.value]
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        if (b.totalThrees !== a.totalThrees) return b.totalThrees - a.totalThrees
        return a.name.localeCompare(b.name)
      })
      .slice(0, 10)
})

const topThrees = computed(() => {
  return [...leaderboard.value]
      .sort((a, b) => {
        if (b.totalThrees !== a.totalThrees) return b.totalThrees - a.totalThrees
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        return a.name.localeCompare(b.name)
      })
      .slice(0, 10)
})

onMounted(() => {
  loadLeaderboard()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Leaderboard</h2>
        <p class="text-muted mb-0">
          Ranking acumulado de puntos y triples por jugador.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando leaderboard...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <div v-else class="row g-4">
        <div class="col-12 col-xl-6">
          <h3 class="h5 mb-3">Top anotadores</h3>

          <div v-if="topScorers.length" class="table-responsive">
            <table class="table table-striped align-middle mb-0">
              <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>Equipo</th>
                <th>Puntos</th>
              </tr>
              </thead>
              <tbody>
              <tr
                  v-for="(player, index) in topScorers"
                  :key="player.id"
                  :class="{
    'table-warning': index === 0,
    'table-light': index === 1,
    'table-secondary': index === 2
  }"
              >
                <td>
                  <span v-if="index === 0">🥇</span>
                  <span v-else-if="index === 1">🥈</span>
                  <span v-else-if="index === 2">🥉</span>
                  <span v-else>{{ index + 1 }}</span>
                </td>

                <td class="fw-semibold">
                  <i class="fa-solid fa-user me-1 text-muted"></i>
                  {{ player.name }}
                </td>

                <td>
    <span class="badge text-bg-dark">
      {{ player.teamName }}
    </span>
                </td>

                <td class="fw-bold text-primary">
                  {{ player.totalPoints }}
                </td>
              </tr>
              </tbody>
            </table>
          </div>

          <p v-else class="text-muted mb-0">No hay estadísticas todavía.</p>
        </div>

        <div class="col-12 col-xl-6">
          <h3 class="h5 mb-3">Top en triples</h3>

          <div v-if="topThrees.length" class="table-responsive">
            <table class="table table-striped align-middle mb-0">
              <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>Equipo</th>
                <th>Triples</th>
              </tr>
              </thead>
              <tbody>
              <tr
                  v-for="(player, index) in topThrees"
                  :key="player.id"
                  :class="{
    'table-warning': index === 0,
    'table-light': index === 1,
    'table-secondary': index === 2
  }"
              >
                <td>
                  <span v-if="index === 0">🥇</span>
                  <span v-else-if="index === 1">🥈</span>
                  <span v-else-if="index === 2">🥉</span>
                  <span v-else>{{ index + 1 }}</span>
                </td>

                <td class="fw-semibold">
                  <i class="fa-solid fa-user me-1 text-muted"></i>
                  {{ player.name }}
                </td>

                <td>
    <span class="badge text-bg-dark">
      {{ player.teamName }}
    </span>
                </td>

                <td class="fw-bold text-danger">
                  {{ player.totalThrees }}
                </td>
              </tr>
              </tbody>
            </table>
          </div>

          <p v-else class="text-muted mb-0">No hay estadísticas todavía.</p>
        </div>
      </div>
    </div>
  </section>
</template>
