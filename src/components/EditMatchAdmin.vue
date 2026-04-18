<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'

type TeamRow = {
  id: string
  name: string
}

type PlayerRow = {
  id: string
  name: string
  team_id: string
  jersey_number: number | null
  is_active: boolean
}

type MatchRow = {
  id: string
  played_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: 'in_progress' | 'finished'
}

type MatchPlayerRow = {
  player_id: string
  team_id: string | null
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

const props = defineProps<{
  matchId: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'cancel'): void
}>()

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const match = ref<MatchRow | null>(null)

const selectedPlayerIds = ref<string[]>([])
const assignedTeamByPlayer = ref<Record<string, string>>({})
const stats = ref<Record<string, { points: number; threes: number }>>({})

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: matchData, error: matchError },
      { data: rosterData, error: rosterError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('players').select('id, name, team_id, jersey_number, is_active').order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .eq('id', props.matchId)
          .single(),
      supabase
          .from('match_players')
          .select('player_id, team_id')
          .eq('match_id', props.matchId),
      supabase
          .from('player_game_stats')
          .select('player_id, points, three_pointers')
          .eq('match_id', props.matchId)
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchError) throw matchError
    if (rosterError) throw rosterError
    if (statsError) throw statsError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    match.value = matchData as MatchRow

    const rosterRows = (rosterData ?? []) as MatchPlayerRow[]
    selectedPlayerIds.value = rosterRows.map((row) => row.player_id)

    assignedTeamByPlayer.value = {}
    for (const row of rosterRows) {
      const player = players.value.find((p) => p.id === row.player_id)
      assignedTeamByPlayer.value[row.player_id] = row.team_id ?? player?.team_id ?? ''
    }

    stats.value = {}
    for (const row of ((statsData ?? []) as PlayerStatRow[])) {
      stats.value[row.player_id] = {
        points: row.points,
        threes: row.three_pointers
      }
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando partido'
  } finally {
    loading.value = false
  }
}

const teamAPlayers = computed(() => {
  if (!match.value) return []

  return players.value
      .filter((player) => selectedPlayerIds.value.includes(player.id))
      .filter((player) => assignedTeamByPlayer.value[player.id] === match.value?.team_a_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamBPlayers = computed(() => {
  if (!match.value) return []

  return players.value
      .filter((player) => selectedPlayerIds.value.includes(player.id))
      .filter((player) => assignedTeamByPlayer.value[player.id] === match.value?.team_b_id)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const rosterCandidates = computed(() => {
  if (!match.value) return []

  return players.value.filter((player) =>
      player.team_id === match.value?.team_a_id || player.team_id === match.value?.team_b_id
  )
})

const teamASelectedCount = computed(() => {
  if (!match.value) return 0
  return selectedPlayerIds.value.filter((playerId) => assignedTeamByPlayer.value[playerId] === match.value?.team_a_id).length
})

const teamBSelectedCount = computed(() => {
  if (!match.value) return 0
  return selectedPlayerIds.value.filter((playerId) => assignedTeamByPlayer.value[playerId] === match.value?.team_b_id).length
})

const liveTeamAScore = computed(() => {
  return teamAPlayers.value.reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)
})

const liveTeamBScore = computed(() => {
  return teamBPlayers.value.reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)
})

function teamName(teamId: string) {
  return teams.value.find((team) => team.id === teamId)?.name ?? 'Equipo'
}

function isSelected(playerId: string) {
  return selectedPlayerIds.value.includes(playerId)
}

function togglePlayer(playerId: string, checked: boolean) {
  if (!match.value) return

  if (checked) {
    if (!selectedPlayerIds.value.includes(playerId)) {
      selectedPlayerIds.value = [...selectedPlayerIds.value, playerId]
    }

    if (!assignedTeamByPlayer.value[playerId]) {
      const player = players.value.find((p) => p.id === playerId)
      assignedTeamByPlayer.value[playerId] = player?.team_id ?? match.value.team_a_id
    }
  } else {
    selectedPlayerIds.value = selectedPlayerIds.value.filter((id) => id !== playerId)
    delete assignedTeamByPlayer.value[playerId]
    delete stats.value[playerId]
  }
}

function setPlayerTeam(playerId: string, teamId: string) {
  assignedTeamByPlayer.value[playerId] = teamId
}

function addQuickPoints(playerId: string, amount: number) {
  if (!stats.value[playerId]) {
    stats.value[playerId] = { points: 0, threes: 0 }
  }

  stats.value[playerId].points += amount

  if (amount === 2) {
    stats.value[playerId].threes += 1
  }
}

function removeQuickPoints(playerId: string, amount: number) {
  if (!stats.value[playerId]) {
    stats.value[playerId] = { points: 0, threes: 0 }
  }

  const currentPoints = stats.value[playerId].points
  const currentThrees = stats.value[playerId].threes

  if (amount === 1) {
    stats.value[playerId].points = Math.max(0, currentPoints - 1)
    return
  }

  if (amount === 2 && currentPoints >= 2) {
    stats.value[playerId].points = currentPoints - 2
    stats.value[playerId].threes = Math.max(0, currentThrees - 1)
  }
}

function validateBeforeSave() {
  if (!match.value) return 'No hay partido cargado.'

  if (teamASelectedCount.value < 3) {
    return `Debes tener al menos 3 jugadores en ${teamName(match.value.team_a_id)}.`
  }

  if (teamBSelectedCount.value < 3) {
    return `Debes tener al menos 3 jugadores en ${teamName(match.value.team_b_id)}.`
  }

  if (liveTeamAScore.value === liveTeamBScore.value) {
    return 'El partido no puede terminar empatado.'
  }

  if (liveTeamAScore.value < 7 && liveTeamBScore.value < 7) {
    return 'El equipo ganador debe llegar al menos a 7 puntos.'
  }

  return ''
}

async function saveChanges() {
  errorMessage.value = ''
  successMessage.value = ''

  const validationError = validateBeforeSave()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  if (!match.value) return

  saving.value = true

  try {
    const { error: updateMatchError } = await supabase
        .from('matches')
        .update({
          played_at: match.value.played_at,
          team_a_score: liveTeamAScore.value,
          team_b_score: liveTeamBScore.value,
          status: 'finished'
        })
        .eq('id', match.value.id)

    if (updateMatchError) throw updateMatchError

    const { error: deleteRosterError } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', match.value.id)

    if (deleteRosterError) throw deleteRosterError

    const rosterRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: match.value!.id,
      player_id: playerId,
      team_id: assignedTeamByPlayer.value[playerId]
    }))

    const { error: insertRosterError } = await supabase
        .from('match_players')
        .insert(rosterRows)

    if (insertRosterError) throw insertRosterError

    const { error: deleteStatsError } = await supabase
        .from('player_game_stats')
        .delete()
        .eq('match_id', match.value.id)

    if (deleteStatsError) throw deleteStatsError

    const statsRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: match.value!.id,
      player_id: playerId,
      points: stats.value[playerId]?.points ?? 0,
      three_pointers: stats.value[playerId]?.threes ?? 0
    }))

    const { error: insertStatsError } = await supabase
        .from('player_game_stats')
        .insert(statsRows)

    if (insertStatsError) throw insertStatsError

    successMessage.value = 'Partido actualizado correctamente.'
    emit('saved')
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error guardando cambios'
  } finally {
    saving.value = false
  }
}

watch(
    () => props.matchId,
    () => {
      loadData()
    }
)

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm border-primary">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h3 class="h4 mb-1">Editar partido</h3>
          <p class="text-muted mb-0">
            Corrige roster, estadísticas y marcador final del partido.
          </p>
        </div>

        <button class="btn btn-outline-secondary" @click="emit('cancel')">
          Cerrar editor
        </button>
      </div>

      <p v-if="loading" class="mb-0">Cargando partido...</p>

      <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else-if="match">
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-4">
            <label class="form-label">Fecha</label>
            <input v-model="match.played_at" type="date" class="form-control" />
          </div>
          <div class="col-12 col-lg-4">
            <label class="form-label">Equipo A</label>
            <input :value="teamName(match.team_a_id)" class="form-control" disabled />
          </div>
          <div class="col-12 col-lg-4">
            <label class="form-label">Equipo B</label>
            <input :value="teamName(match.team_b_id)" class="form-control" disabled />
          </div>
        </div>

        <div class="card border mb-4">
          <div class="card-body">
            <h4 class="h5 mb-3">Roster del partido</h4>

            <div class="row g-3">
              <div
                  v-for="player in rosterCandidates"
                  :key="player.id"
                  class="col-12 col-lg-6">
                <div class="card border-0 bg-light">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-2">
                      <div class="fw-semibold">{{ player.name }}</div>

                      <div class="form-check">
                        <input
                            :id="`edit-roster-${player.id}`"
                            class="form-check-input"
                            type="checkbox"
                            :checked="isSelected(player.id)"
                            @change="togglePlayer(player.id, ($event.target as HTMLInputElement).checked)" />
                        <label class="form-check-label" :for="`edit-roster-${player.id}`">
                          Participa
                        </label>
                      </div>
                    </div>

                    <div v-if="isSelected(player.id)">
                      <label class="form-label small">Equipo en este partido</label>
                      <select
                          class="form-select"
                          :value="assignedTeamByPlayer[player.id]"
                          @change="setPlayerTeam(player.id, ($event.target as HTMLSelectElement).value)">
                        <option :value="match.team_a_id">{{ teamName(match.team_a_id) }}</option>
                        <option :value="match.team_b_id">{{ teamName(match.team_b_id) }}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-3 small text-muted">
              {{ teamName(match.team_a_id) }}: {{ teamASelectedCount }} jugadores ·
              {{ teamName(match.team_b_id) }}: {{ teamBSelectedCount }} jugadores
            </div>
          </div>
        </div>

        <div class="card border-dark shadow-sm mb-4">
          <div class="card-body">
            <div class="small text-muted mb-3">Marcador actualizado automáticamente</div>

            <div class="row align-items-center text-center g-3">
              <div class="col-5">
                <div class="fw-bold fs-4">{{ teamName(match.team_a_id) }}</div>
              </div>

              <div class="col-2">
                <div class="display-6 fw-bold">
                  {{ liveTeamAScore }} - {{ liveTeamBScore }}
                </div>
              </div>

              <div class="col-5">
                <div class="fw-bold fs-4">{{ teamName(match.team_b_id) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="row g-4 mb-4">
          <div class="col-12 col-xl-6">
            <div class="card h-100 border-start border-4 border-primary shadow-sm">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h4 class="h5 mb-0">{{ teamName(match.team_a_id) }}</h4>
                  <span class="badge text-bg-primary">{{ liveTeamAScore }} pts</span>
                </div>

                <div
                    v-for="player in teamAPlayers"
                    :key="player.id"
                    class="card border-0 bg-light mb-3 shadow-sm">
                  <div class="card-body py-3 px-3">
                    <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                      <div>
                        <div class="fw-semibold">{{ player.name }}</div>
                        <div class="small text-muted">
                          Puntos: {{ stats[player.id]?.points ?? 0 }} · 3PT: {{ stats[player.id]?.threes ?? 0 }}
                        </div>
                      </div>

                      <div class="d-flex gap-2 flex-wrap">
                        <span class="badge text-bg-dark px-3 py-2 fs-6">
                          {{ stats[player.id]?.points ?? 0 }} pts
                        </span>
                        <span class="badge text-bg-secondary px-3 py-2 fs-6">
                          {{ stats[player.id]?.threes ?? 0 }} 3PT
                        </span>
                      </div>
                    </div>

                    <div class="d-flex gap-2 flex-wrap">
                      <button type="button" class="btn btn-outline-danger" @click="removeQuickPoints(player.id, 1)">-1</button>
                      <button type="button" class="btn btn-outline-danger" @click="removeQuickPoints(player.id, 2)">-2</button>
                      <button type="button" class="btn btn-outline-primary" @click="addQuickPoints(player.id, 1)">+1</button>
                      <button type="button" class="btn btn-warning fw-bold" @click="addQuickPoints(player.id, 2)">+2 · 3PT</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-6">
            <div class="card h-100 border-start border-4 border-success shadow-sm">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h4 class="h5 mb-0">{{ teamName(match.team_b_id) }}</h4>
                  <span class="badge text-bg-success">{{ liveTeamBScore }} pts</span>
                </div>

                <div
                    v-for="player in teamBPlayers"
                    :key="player.id"
                    class="card border-0 bg-light mb-3 shadow-sm">
                  <div class="card-body py-3 px-3">
                    <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                      <div>
                        <div class="fw-semibold">{{ player.name }}</div>
                        <div class="small text-muted">
                          Puntos: {{ stats[player.id]?.points ?? 0 }} · 3PT: {{ stats[player.id]?.threes ?? 0 }}
                        </div>
                      </div>

                      <div class="d-flex gap-2 flex-wrap">
                        <span class="badge text-bg-dark px-3 py-2 fs-6">
                          {{ stats[player.id]?.points ?? 0 }} pts
                        </span>
                        <span class="badge text-bg-secondary px-3 py-2 fs-6">
                          {{ stats[player.id]?.threes ?? 0 }} 3PT
                        </span>
                      </div>
                    </div>

                    <div class="d-flex gap-2 flex-wrap">
                      <button type="button" class="btn btn-outline-danger" @click="removeQuickPoints(player.id, 1)">-1</button>
                      <button type="button" class="btn btn-outline-danger" @click="removeQuickPoints(player.id, 2)">-2</button>
                      <button type="button" class="btn btn-outline-primary" @click="addQuickPoints(player.id, 1)">+1</button>
                      <button type="button" class="btn btn-warning fw-bold" @click="addQuickPoints(player.id, 2)">+2 · 3PT</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-success fw-bold" :disabled="saving" @click="saveChanges">
            {{ saving ? 'Guardando...' : 'Guardar cambios del partido' }}
          </button>

          <button class="btn btn-outline-secondary" :disabled="saving" @click="emit('cancel')">
            Cancelar
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
