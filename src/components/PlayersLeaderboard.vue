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
  is_active: boolean
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

type LeaderboardRow = {
  playerId: string
  playerName: string
  teamName: string
  totalPoints: number
  totalThrees: number
}

const teams = ref<TeamRow[]>([])
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
      { data: playersData, error: playersError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),

      supabase
          .from('players')
          .select('id, name, team_id, is_active')
          .order('name', { ascending: true }),

      supabase
          .from('player_game_stats')
          .select('player_id, points, three_pointers')
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (statsError) throw statsError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    playerStats.value = statsData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando leaderboard'
  } finally {
    loading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const playerTotals = computed<LeaderboardRow[]>(() => {
  const totals = new Map<string, LeaderboardRow>()

  for (const player of players.value) {
    totals.set(player.id, {
      playerId: player.id,
      playerName: player.name,
      teamName: teamsMap.value.get(player.team_id) ?? 'Sin equipo',
      totalPoints: 0,
      totalThrees: 0
    })
  }

  for (const stat of playerStats.value) {
    const current = totals.get(stat.player_id)
    if (!current) continue

    current.totalPoints += stat.points ?? 0
    current.totalThrees += stat.three_pointers ?? 0
  }

  return Array.from(totals.values())
})

const topScorers = computed(() => {
  return [...playerTotals.value]
      .filter((row) => row.totalPoints > 0 || row.totalThrees > 0)
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        if (b.totalThrees !== a.totalThrees) return b.totalThrees - a.totalThrees
        return a.playerName.localeCompare(b.playerName)
      })
})

const topThreeShooters = computed(() => {
  return [...playerTotals.value]
      .filter((row) => row.totalThrees > 0 || row.totalPoints > 0)
      .sort((a, b) => {
        if (b.totalThrees !== a.totalThrees) return b.totalThrees - a.totalThrees
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        return a.playerName.localeCompare(b.playerName)
      })
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Leaderboard</h2>
        <p class="text-body-secondary mb-0">
          Ranking acumulado de puntos y triples por jugador.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando leaderboard...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-4">
          <div class="col-12 col-xl-6">
            <div class="card border h-100">
              <div class="card-body">
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
                    <tr v-for="(row, index) in topScorers" :key="row.playerId">
                      <td>
                        <span v-if="index === 0">🥇</span>
                        <span v-else-if="index === 1">🥈</span>
                        <span v-else-if="index === 2">🥉</span>
                        <span v-else>{{ index + 1 }}</span>
                      </td>
                      <td class="fw-semibold">{{ row.playerName }}</td>
                      <td>{{ row.teamName }}</td>
                      <td>{{ row.totalPoints }}</td>
                    </tr>
                    </tbody>
                  </table>
                </div>

                <p v-else class="text-body-secondary mb-0">
                  No hay estadísticas todavía.
                </p>
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-6">
            <div class="card border h-100">
              <div class="card-body">
                <h3 class="h5 mb-3">Top en triples</h3>

                <div v-if="topThreeShooters.length" class="table-responsive">
                  <table class="table table-striped align-middle mb-0">
                    <thead class="table-light">
                    <tr>
                      <th>#</th>
                      <th>Jugador</th>
                      <th>Equipo</th>
                      <th>3PT</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr v-for="(row, index) in topThreeShooters" :key="row.playerId">
                      <td>
                        <span v-if="index === 0">🥇</span>
                        <span v-else-if="index === 1">🥈</span>
                        <span v-else-if="index === 2">🥉</span>
                        <span v-else>{{ index + 1 }}</span>
                      </td>
                      <td class="fw-semibold">{{ row.playerName }}</td>
                      <td>{{ row.teamName }}</td>
                      <td>{{ row.totalThrees }}</td>
                    </tr>
                    </tbody>
                  </table>
                </div>

                <p v-else class="text-body-secondary mb-0">
                  No hay estadísticas todavía.
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
