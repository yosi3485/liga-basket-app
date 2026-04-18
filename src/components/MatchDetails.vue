<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { getMatchLabel } from '../utils/matches'
import EditMatchAdmin from './EditMatchAdmin.vue'
import { useAuth } from '../composables/useAuth'

type TeamRow = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  played_at: string
  created_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number,
  status: 'in_progress' | 'finished'
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

type MatchPlayerRow = {
  player_id: string
}

type MatchPlayerDetail = {
  id: string
  name: string
  jerseyNumber: number | null
  teamId: string
  points: number
  threes: number
}

const props = defineProps<{
  initialMatchId?: string
}>()

const emit = defineEmits<{
  (e: 'match-deleted'): void
}>()

const { isAdmin } = useAuth()

const isEditing = ref(false)

function handleMatchSaved() {
  isEditing.value = false
  loadBaseData()
  emit('match-deleted')
}

const teams = ref<TeamRow[]>([])
const matches = ref<MatchRow[]>([])
const players = ref<PlayerRow[]>([])
const playerStats = ref<PlayerStatRow[]>([])
const rosterPlayerIds = ref<string[]>([])

const selectedMatchId = ref('')
const loading = ref(false)
const statsLoading = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

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
          .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),
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

async function loadRosterAndStats() {
  playerStats.value = []
  rosterPlayerIds.value = []

  if (!selectedMatchId.value) return

  statsLoading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: rosterData, error: rosterError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase
          .from('match_players')
          .select('player_id')
          .eq('match_id', selectedMatchId.value),
      supabase
          .from('player_game_stats')
          .select('player_id, points, three_pointers')
          .eq('match_id', selectedMatchId.value)
    ])

    if (rosterError) throw rosterError
    if (statsError) throw statsError

    rosterPlayerIds.value = ((rosterData as MatchPlayerRow[]) ?? []).map((row) => row.player_id)
    playerStats.value = statsData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando estadísticas del partido'
  } finally {
    statsLoading.value = false
  }
}

async function deleteMatch() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedMatch.value) return

  const confirmed = window.confirm(
      '¿Seguro que quieres eliminar este partido? También se borrarán el roster y las estadísticas de jugadores de ese juego.'
  )

  if (!confirmed) return

  deleting.value = true

  const matchIdToDelete = selectedMatch.value.id

  const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchIdToDelete)

  if (error) {
    errorMessage.value = error.message
    deleting.value = false
    return
  }

  successMessage.value = 'Partido eliminado correctamente.'

  await loadBaseData()

  if (matches.value.length > 0) {
    selectedMatchId.value = matches.value[0].id
    await loadRosterAndStats()
  } else {
    selectedMatchId.value = ''
    rosterPlayerIds.value = []
    playerStats.value = []
  }

  deleting.value = false
  emit('match-deleted')
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
      .filter((player) => rosterPlayerIds.value.includes(player.id))
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

function matchLabel(match: MatchRow) {
  return getMatchLabel(match, matches.value)
}

watch(selectedMatchId, async () => {
  successMessage.value = ''
  await loadRosterAndStats()
})

watch(
    () => props.initialMatchId,
    async (newMatchId) => {
      if (newMatchId && newMatchId !== selectedMatchId.value) {
        selectedMatchId.value = newMatchId
        await loadRosterAndStats()
      }
    }
)

onMounted(async () => {
  await loadBaseData()

  if (props.initialMatchId) {
    selectedMatchId.value = props.initialMatchId
  }

  await loadRosterAndStats()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3 d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h2 class="h4 mb-1">Detalle del partido</h2>
          <p class="text-muted mb-0">
            Consulta marcador, roster y estadísticas del partido.
          </p>
        </div>

        <button
            v-if="isAdmin && selectedMatch"
            type="button"
            class="btn btn-outline-danger btn-sm"
            :disabled="deleting"
            @click="deleteMatch">
          {{ deleting ? 'Eliminando...' : 'Eliminar partido' }}
        </button>
        <button
            v-if="isAdmin && selectedMatch"
            type="button"
            class="btn btn-outline-primary btn-sm"
            @click="isEditing = !isEditing">
          {{ isEditing ? 'Cerrar editor' : 'Editar partido' }}
        </button>
        <div v-if="isAdmin && isEditing && selectedMatch" class="mt-4">
          <EditMatchAdmin
              :match-id="selectedMatch.id"
              @saved="handleMatchSaved"
              @cancel="isEditing = false" />
        </div>
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
                {{ matchLabel(match) }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="successMessage" class="alert alert-success mb-4" role="alert">
          {{ successMessage }}
        </div>

        <template v-if="selectedMatch">
          <div class="card border mb-4">
            <div class="card-body">
              <div class="small text-muted mb-2">
                {{ matchLabel(selectedMatch) }}
              </div>
              <div class="mb-2">
                <span
                    class="badge"
                    :class="selectedMatch.status === 'finished' ? 'text-bg-success' : 'text-bg-warning'">
                  <i class="fa-solid fa-circle me-1"></i>
                  {{ selectedMatch.status === 'finished' ? 'Finalizado' : 'En progreso' }}
                </span>
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
                No hay roster ni estadísticas para este equipo.
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
                No hay roster ni estadísticas para este equipo.
              </p>
            </div>
          </div>
        </template>

        <p v-else class="text-muted mb-0">No hay partido seleccionado.</p>
      </template>
    </div>
  </section>
</template>
