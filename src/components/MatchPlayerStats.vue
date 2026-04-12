<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { formatDate } from '../utils/date'

type Match = {
  id: string
  team_a_id: string
  team_b_id: string
  played_at: string
}

type Player = {
  id: string
  name: string
  team_id: string
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

type PlayerStatsState = Record<string, { points: number; threes: number }>

const { isAdmin } = useAuth()

const matches = ref<Match[]>([])
const players = ref<Player[]>([])
const selectedMatchId = ref('')
const stats = ref<PlayerStatsState>({})

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const [
    { data: matchesData, error: matchesError },
    { data: playersData, error: playersError }
  ] = await Promise.all([
    supabase
        .from('matches')
        .select('id, team_a_id, team_b_id, played_at')
        .order('played_at', { ascending: false }),
    supabase
        .from('players')
        .select('id, name, team_id')
        .eq('is_active', true)
        .order('name', { ascending: true })
  ])

  if (matchesError) {
    errorMessage.value = matchesError.message
    matches.value = []
  } else {
    matches.value = matchesData ?? []
  }

  if (playersError) {
    errorMessage.value = playersError.message
    players.value = []
  } else {
    players.value = playersData ?? []
  }

  loading.value = false
}

const selectedMatch = computed(() => {
  return matches.value.find((match) => match.id === selectedMatchId.value) ?? null
})

const playersForMatch = computed(() => {
  if (!selectedMatch.value) return []

  return players.value.filter(
      (player) =>
          player.team_id === selectedMatch.value?.team_a_id ||
          player.team_id === selectedMatch.value?.team_b_id
  )
})

async function loadStatsForMatch() {
  stats.value = {}

  if (!selectedMatchId.value) return

  const { data, error } = await supabase
      .from('player_game_stats')
      .select('player_id, points, three_pointers')
      .eq('match_id', selectedMatchId.value)

  if (error) {
    errorMessage.value = error.message
    return
  }

  const existingStats = (data as PlayerStatRow[]) ?? []

  for (const row of existingStats) {
    stats.value[row.player_id] = {
      points: row.points,
      threes: row.three_pointers
    }
  }
}

function updateStat(
    playerId: string,
    field: 'points' | 'threes',
    value: string
) {
  if (!stats.value[playerId]) {
    stats.value[playerId] = { points: 0, threes: 0 }
  }

  const parsedValue = Number(value)
  stats.value[playerId][field] = Number.isNaN(parsedValue) ? 0 : parsedValue
}

function statValue(playerId: string, field: 'points' | 'threes') {
  if (!stats.value[playerId]) return 0
  return stats.value[playerId][field]
}

async function saveStats() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedMatchId.value) {
    errorMessage.value = 'Selecciona un partido.'
    return
  }

  saving.value = true

  const rows = playersForMatch.value.map((player) => ({
    match_id: selectedMatchId.value,
    player_id: player.id,
    points: stats.value[player.id]?.points ?? 0,
    three_pointers: stats.value[player.id]?.threes ?? 0
  }))

  const { error } = await supabase
      .from('player_game_stats')
      .upsert(rows, {
        onConflict: 'match_id,player_id'
      })

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Estadísticas guardadas.'
    await loadStatsForMatch()
  }

  saving.value = false
}

watch(selectedMatchId, async () => {
  await loadStatsForMatch()
})

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <h2 class="h4 mb-3">Estadísticas por partido</h2>

      <div v-if="!isAdmin" class="alert alert-secondary" role="alert">
        Solo admins pueden registrar estadísticas.
      </div>

      <template v-else>
        <div class="mb-3">
          <label class="form-label">Selecciona partido</label>
          <select v-model="selectedMatchId" class="form-select">
            <option value="">Selecciona...</option>
            <option
                v-for="match in matches"
                :key="match.id"
                :value="match.id">
              {{ formatDate(match.played_at) }}
            </option>
          </select>
        </div>

        <div v-if="selectedMatchId && playersForMatch.length">
          <div
              v-for="player in playersForMatch"
              :key="player.id"
              class="row g-2 align-items-center mb-2">
            <div class="col-12 col-md-4">
              <span>{{ player.name }}</span>
            </div>

            <div class="col-6 col-md-4">
              <input
                  type="number"
                  class="form-control"
                  placeholder="Puntos"
                  :value="statValue(player.id, 'points')"
                  @input="updateStat(player.id, 'points', ($event.target as HTMLInputElement).value)" />
            </div>

            <div class="col-6 col-md-4">
              <input
                  type="number"
                  class="form-control"
                  placeholder="3PT"
                  :value="statValue(player.id, 'threes')"
                  @input="updateStat(player.id, 'threes', ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
        </div>

        <p v-else-if="selectedMatchId" class="text-muted">
          No hay jugadores activos para este partido.
        </p>

        <button
            class="btn btn-primary mt-3"
            :disabled="saving || !selectedMatchId"
            @click="saveStats">
          {{ saving ? 'Guardando...' : 'Guardar estadísticas' }}
        </button>
      </template>

      <div v-if="errorMessage" class="alert alert-danger mt-3">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="alert alert-success mt-3">
        {{ successMessage }}
      </div>
    </div>
  </section>
</template>
