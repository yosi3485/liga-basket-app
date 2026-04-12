<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'

type TeamRow = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  played_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
}

type PlayerRow = {
  id: string
  name: string
  jersey_number: number | null
  team_id: string
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

type MatchPlayerDetail = {
  id: string
  name: string
  jerseyNumber: number | null
  teamId: string
  points: number
  threes: number
}

const teams = ref<TeamRow[]>([])
const matches = ref<MatchRow[]>([])
const players = ref<PlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])

const selectedMatchId = ref('')
const loading = ref(false)
const statsLoading = ref(false)
const errorMessage = ref('')

async function loadBaseData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: matchesData, error: matchesError },
      { data: playersData, error: playersError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, team_a_id, team_b_id, team_a_score, team_b_score')
          .order('played_at', { ascending: false }),
      supabase
          .from('players')
          .select('id, name, jersey_number, team_id')
          .order('name', { ascending: true })
    ])

    if (teamsError) throw teamsError
    if (matchesError) throw matchesError
    if (playersError) throw playersError

    teams.value = teamsData ?? []
    matches.value = matchesData ?? []
    players.value = playersData ?? []

    if (!selectedMatchId.value && matches.value.length > 0) {
      selectedMatchId.value = matches.value[0].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando partido'
  } finally {
    loading.value = false
  }
}

async function loadPlayerStats() {
  playerStats.value = []

  if (!selectedMatchId.value) return

  statsLoading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
        .from('player_game_stats')
        .select('player_id, points, three_pointers')
        .eq('match_id', selectedMatchId.value)

    if (error) throw error

    playerStats.value = data ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando estadísticas del partido'
  } finally {
    statsLoading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const selectedMatch = computed(() => {
  return matches.value.find((match) => match.id === selectedMatchId.value) ?? null
})

const teamAName = computed(() => {
  return selectedMatch.value
      ? (teamsMap.value.get(selectedMatch.value.team_a_id) ?? 'Equipo A')
      : ''
})

const teamBName = computed(() => {
  return selectedMatch.value
      ? (teamsMap.value.get(selectedMatch.value.team_b_id) ?? 'Equipo B')
      : ''
})

const playersForMatch = computed<MatchPlayerDetail[]>(() => {
  if (!selectedMatch.value) return []

  const statsMap = new Map(
      playerStats.value.map((stat) => [
        stat.player_id,
        {
          points: stat.points,
          threes: stat.three_pointers
        }
      ])
  )

  return players.value
      .filter(
          (player) =>
              player.team_id === selectedMatch.value?.team_a_id ||
              player.team_id === selectedMatch.value?.team_b_id
      )
      .map((player) => ({
        id: player.id,
        name: player.name,
        jerseyNumber: player.jersey_number,
        teamId: player.team_id,
        points: statsMap.get(player.id)?.points ?? 0,
        threes: statsMap.get(player.id)?.threes ?? 0
      }))
})

const teamAPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return playersForMatch.value
      .filter((player) => player.teamId === selectedMatch.value?.team_a_id)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
})

const teamBPlayers = computed(() => {
  if (!selectedMatch.value) return []

  return playersForMatch.value
      .filter((player) => player.teamId === selectedMatch.value?.team_b_id)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
})

watch(selectedMatchId, async () => {
  await loadPlayerStats()
})

onMounted(async () => {
  await loadBaseData()
  await loadPlayerStats()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Detalle del partido</h2>
        <p class="text-muted mb-0">
          Consulta marcador, fecha y estadísticas de jugadores por partido.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando partidos...</p>

      <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label for="match-detail-select" class="form-label">Partido</label>
            <select
                id="match-detail-select"
                v-model="selectedMatchId"
                class="form-select">
              <option value="">Selecciona un partido</option>
              <option
                  v-for="match in matches"
                  :key="match.id"
                  :value="match.id">
                {{ formatDate(match.played_at) }}
              </option>
            </select>
          </div>
        </div>

        <template v-if="selectedMatch">
          <div class="card border mb-4">
            <div class="card-body">
              <div class="small text-muted mb-2">
                {{ formatDate(selectedMatch.played_at) }}
              </div>

              <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                <div class="fw-bold fs-5">{{ teamAName }}</div>

                <div class="badge bg-dark fs-5 px-4 py-3">
                  <i class="fa-solid fa-basketball me-2"></i>
                  {{ selectedMatch.team_a_score }} - {{ selectedMatch.team_b_score }}
                </div>

                <div class="fw-bold fs-5 text-md-end">{{ teamBName }}</div>
              </div>
            </div>
          </div>

          <p v-if="statsLoading" class="mb-0">Cargando estadísticas...</p>

          <div v-else class="row g-4">
            <div class="col-12 col-xl-6">
              <h3 class="h5 mb-3">{{ teamAName }}</h3>

              <div v-if="teamAPlayers.length" class="table-responsive">
                <table class="table table-striped align-middle mb-0">
                  <thead class="table-light">
                  <tr>
                    <th>Jugador</th>
                    <th>#</th>
                    <th>Puntos</th>
                    <th>Triples</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-for="player in teamAPlayers" :key="player.id">
                    <td class="fw-semibold">{{ player.name }}</td>
                    <td>{{ player.jerseyNumber ?? '—' }}</td>
                    <td>{{ player.points }}</td>
                    <td>{{ player.threes }}</td>
                  </tr>
                  </tbody>
                </table>
              </div>

              <p v-else class="text-muted mb-0">
                No hay jugadores o estadísticas para este equipo.
              </p>
            </div>

            <div class="col-12 col-xl-6">
              <h3 class="h5 mb-3">{{ teamBName }}</h3>

              <div v-if="teamBPlayers.length" class="table-responsive">
                <table class="table table-striped align-middle mb-0">
                  <thead class="table-light">
                  <tr>
                    <th>Jugador</th>
                    <th>#</th>
                    <th>Puntos</th>
                    <th>Triples</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-for="player in teamBPlayers" :key="player.id">
                    <td class="fw-semibold">{{ player.name }}</td>
                    <td>{{ player.jerseyNumber ?? '—' }}</td>
                    <td>{{ player.points }}</td>
                    <td>{{ player.threes }}</td>
                  </tr>
                  </tbody>
                </table>
              </div>

              <p v-else class="text-muted mb-0">
                No hay jugadores o estadísticas para este equipo.
              </p>
            </div>
          </div>
        </template>

        <p v-else class="text-muted mb-0">No hay partido seleccionado.</p>
      </template>
    </div>
  </section>
</template>
