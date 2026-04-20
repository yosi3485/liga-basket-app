<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'

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
  created_at: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: 'in_progress' | 'finished'
}

type MatchPlayerRow = {
  match_id: string
  player_id: string
  team_id: string | null
}

type PlayerStatRow = {
  match_id: string
  player_id: string
  points: number
  three_pointers: number
}

const emit = defineEmits<{
  (e: 'completed', matchId: string): void
}>()

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const matches = ref<MatchRow[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const currentStep = ref<1 | 2 | 3>(1)

const matchId = ref('')
const matchDate = ref(new Date().toISOString().slice(0, 10))
const teamAId = ref('')
const teamBId = ref('')

const selectedPlayerIds = ref<string[]>([])
const assignedTeamByPlayer = ref<Record<string, string>>({})
const stats = ref<Record<string, { points: number; threes: number }>>({})

const showNewMatchWarning = ref(false)

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: matchesData, error: matchesError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),
      supabase
          .from('players')
          .select('id, name, team_id, jersey_number, is_active')
          .order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false })
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchesError) throw matchesError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    matches.value = matchesData ?? []

    if (!teamAId.value && teams.value.length >= 2) {
      teamAId.value = teams.value[0].id
      teamBId.value = teams.value[1].id
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando nuevo partido'
  } finally {
    loading.value = false
  }
}

async function refreshMatches() {
  const { data, error } = await supabase
      .from('matches')
      .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
      .order('played_at', { ascending: false })
      .order('created_at', { ascending: false })

  if (!error) {
    matches.value = data ?? []
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const inProgressMatchesForSelectedDate = computed(() => {
  return matches.value.filter(
      (match) =>
          match.status === 'in_progress' &&
          match.played_at === matchDate.value
  )
})

const hasCurrentDayInProgress = computed(() => {
  return inProgressMatchesForSelectedDate.value.length > 0
})

const allEligiblePlayersForThisMatch = computed(() => {
  if (!teamAId.value || !teamBId.value) return []

  return players.value
      .filter((player) => player.is_active)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamABasePlayers = computed(() => {
  return allEligiblePlayersForThisMatch.value.filter((player) => player.team_id === teamAId.value)
})

const teamAReinforcementPlayers = computed(() => {
  return allEligiblePlayersForThisMatch.value.filter((player) => player.team_id !== teamAId.value)
})

const teamBBasePlayers = computed(() => {
  return allEligiblePlayersForThisMatch.value.filter((player) => player.team_id === teamBId.value)
})

const teamBReinforcementPlayers = computed(() => {
  return allEligiblePlayersForThisMatch.value.filter((player) => player.team_id !== teamBId.value)
})

const teamASelectedCount = computed(() => {
  return selectedPlayerIds.value.filter(
      (playerId) => assignedTeamByPlayer.value[playerId] === teamAId.value
  ).length
})

const teamBSelectedCount = computed(() => {
  return selectedPlayerIds.value.filter(
      (playerId) => assignedTeamByPlayer.value[playerId] === teamBId.value
  ).length
})

const rosterTeamAPlayers = computed(() => {
  return players.value
      .filter((player) => selectedPlayerIds.value.includes(player.id))
      .filter((player) => assignedTeamByPlayer.value[player.id] === teamAId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const rosterTeamBPlayers = computed(() => {
  return players.value
      .filter((player) => selectedPlayerIds.value.includes(player.id))
      .filter((player) => assignedTeamByPlayer.value[player.id] === teamBId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const liveTeamAScore = computed(() => {
  return rosterTeamAPlayers.value.reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)
})

const liveTeamBScore = computed(() => {
  return rosterTeamBPlayers.value.reduce((sum, player) => sum + (stats.value[player.id]?.points ?? 0), 0)
})

function teamName(teamId: string) {
  return teamsMap.value.get(teamId) ?? 'Equipo'
}

function teamLabel(teamId: string, fallback: string) {
  return teamsMap.value.get(teamId) ?? fallback
}

function isAssignedToTeam(playerId: string, teamId: string) {
  return selectedPlayerIds.value.includes(playerId) && assignedTeamByPlayer.value[playerId] === teamId
}

function assignPlayerToTeam(playerId: string, destinationTeamId: string) {
  if (!teamAId.value || !teamBId.value) return
  if (destinationTeamId !== teamAId.value && destinationTeamId !== teamBId.value) return

  if (!selectedPlayerIds.value.includes(playerId)) {
    selectedPlayerIds.value = [...selectedPlayerIds.value, playerId]
  }

  assignedTeamByPlayer.value[playerId] = destinationTeamId
}

function removePlayerFromMatch(playerId: string) {
  selectedPlayerIds.value = selectedPlayerIds.value.filter((id) => id !== playerId)
  delete assignedTeamByPlayer.value[playerId]
  delete stats.value[playerId]
}

function togglePlayerForTeam(playerId: string, checked: boolean, destinationTeamId: string) {
  if (checked) {
    assignPlayerToTeam(playerId, destinationTeamId)
  } else {
    removePlayerFromMatch(playerId)
  }
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

function playerBaseTeamName(player: PlayerRow) {
  return teamName(player.team_id)
}

function playerIsReinforcementForTeam(player: PlayerRow, destinationTeamId: string) {
  return player.team_id !== destinationTeamId
}

function validateStep1() {
  if (!teamAId.value || !teamBId.value) {
    return 'Debes seleccionar los dos equipos.'
  }

  if (teamAId.value === teamBId.value) {
    return 'Los equipos deben ser diferentes.'
  }

  return ''
}

function validateStep2() {
  if (teamASelectedCount.value < 3) {
    return `Debes seleccionar al menos 3 jugadores para ${teamName(teamAId.value)}.`
  }

  if (teamBSelectedCount.value < 3) {
    return `Debes seleccionar al menos 3 jugadores para ${teamName(teamBId.value)}.`
  }

  return ''
}

function validateBeforeFinalize() {
  const step1Error = validateStep1()
  if (step1Error) return step1Error

  const step2Error = validateStep2()
  if (step2Error) return step2Error

  if (liveTeamAScore.value === liveTeamBScore.value) {
    return 'El partido no puede terminar empatado.'
  }

  if (liveTeamAScore.value < 7 && liveTeamBScore.value < 7) {
    return 'El equipo ganador debe llegar al menos a 7 puntos.'
  }

  return ''
}

function goToStep2() {
  errorMessage.value = ''
  const validationError = validateStep1()

  if (validationError) {
    errorMessage.value = validationError
    return
  }

  currentStep.value = 2
}

function goToStep3() {
  errorMessage.value = ''
  const validationError = validateStep2()

  if (validationError) {
    errorMessage.value = validationError
    return
  }

  currentStep.value = 3
}

function resetNewMatchFlow() {
  matchId.value = ''
  matchDate.value = new Date().toISOString().slice(0, 10)

  if (teams.value.length >= 2) {
    teamAId.value = teams.value[0].id
    teamBId.value = teams.value[1].id
  } else {
    teamAId.value = ''
    teamBId.value = ''
  }

  selectedPlayerIds.value = []
  assignedTeamByPlayer.value = {}
  stats.value = {}
  currentStep.value = 1
  errorMessage.value = ''
  successMessage.value = ''
}

function startNewMatchRequested() {
  if (hasCurrentDayInProgress.value) {
    showNewMatchWarning.value = true
    return
  }

  resetNewMatchFlow()
}

async function resumeMatch(existingMatchId: string) {
  errorMessage.value = ''
  successMessage.value = ''

  const targetMatch = matches.value.find((match) => match.id === existingMatchId)
  if (!targetMatch) {
    errorMessage.value = 'No se encontró el partido en progreso.'
    return
  }

  loading.value = true

  try {
    const [
      { data: rosterData, error: rosterError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase
          .from('match_players')
          .select('match_id, player_id, team_id')
          .eq('match_id', existingMatchId),
      supabase
          .from('player_game_stats')
          .select('match_id, player_id, points, three_pointers')
          .eq('match_id', existingMatchId)
    ])

    if (rosterError) throw rosterError
    if (statsError) throw statsError

    matchId.value = targetMatch.id
    matchDate.value = targetMatch.played_at
    teamAId.value = targetMatch.team_a_id
    teamBId.value = targetMatch.team_b_id
    currentStep.value = 3

    selectedPlayerIds.value = []
    assignedTeamByPlayer.value = {}
    stats.value = {}

    for (const row of (rosterData ?? []) as MatchPlayerRow[]) {
      selectedPlayerIds.value.push(row.player_id)

      const player = players.value.find((p) => p.id === row.player_id)
      assignedTeamByPlayer.value[row.player_id] = row.team_id ?? player?.team_id ?? ''
    }

    for (const row of (statsData ?? []) as PlayerStatRow[]) {
      stats.value[row.player_id] = {
        points: row.points ?? 0,
        threes: row.three_pointers ?? 0
      }
    }

    successMessage.value = 'Partido en progreso cargado correctamente.'
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error reanudando partido'
  } finally {
    loading.value = false
  }
}

async function saveProgress() {
  errorMessage.value = ''
  successMessage.value = ''

  const step1Error = validateStep1()
  if (step1Error) {
    errorMessage.value = step1Error
    return
  }

  const step2Error = validateStep2()
  if (step2Error) {
    errorMessage.value = step2Error
    return
  }

  saving.value = true

  try {
    let currentMatchId = matchId.value

    if (!currentMatchId) {
      const { data: insertedMatch, error: insertMatchError } = await supabase
          .from('matches')
          .insert({
            played_at: matchDate.value,
            team_a_id: teamAId.value,
            team_b_id: teamBId.value,
            team_a_score: liveTeamAScore.value,
            team_b_score: liveTeamBScore.value,
            status: 'in_progress'
          })
          .select('id')
          .single()

      if (insertMatchError) throw insertMatchError

      currentMatchId = insertedMatch.id
      matchId.value = currentMatchId
    } else {
      const { error: updateMatchError } = await supabase
          .from('matches')
          .update({
            played_at: matchDate.value,
            team_a_id: teamAId.value,
            team_b_id: teamBId.value,
            team_a_score: liveTeamAScore.value,
            team_b_score: liveTeamBScore.value,
            status: 'in_progress'
          })
          .eq('id', currentMatchId)

      if (updateMatchError) throw updateMatchError
    }

    const { error: deleteRosterError } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', currentMatchId)

    if (deleteRosterError) throw deleteRosterError

    const rosterRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: currentMatchId,
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
        .eq('match_id', currentMatchId)

    if (deleteStatsError) throw deleteStatsError

    const statsRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: currentMatchId,
      player_id: playerId,
      points: stats.value[playerId]?.points ?? 0,
      three_pointers: stats.value[playerId]?.threes ?? 0
    }))

    const { error: insertStatsError } = await supabase
        .from('player_game_stats')
        .insert(statsRows)

    if (insertStatsError) throw insertStatsError

    successMessage.value = 'Progreso guardado sin duplicar estadísticas.'
    await refreshMatches()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error guardando progreso'
  } finally {
    saving.value = false
  }
}

async function finalizeMatch() {
  errorMessage.value = ''
  successMessage.value = ''

  const validationError = validateBeforeFinalize()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  saving.value = true

  try {
    let currentMatchId = matchId.value

    if (!currentMatchId) {
      const { data: insertedMatch, error: insertMatchError } = await supabase
          .from('matches')
          .insert({
            played_at: matchDate.value,
            team_a_id: teamAId.value,
            team_b_id: teamBId.value,
            team_a_score: liveTeamAScore.value,
            team_b_score: liveTeamBScore.value,
            status: 'finished'
          })
          .select('id')
          .single()

      if (insertMatchError) throw insertMatchError

      currentMatchId = insertedMatch.id
      matchId.value = currentMatchId
    } else {
      const { error: updateMatchError } = await supabase
          .from('matches')
          .update({
            played_at: matchDate.value,
            team_a_id: teamAId.value,
            team_b_id: teamBId.value,
            team_a_score: liveTeamAScore.value,
            team_b_score: liveTeamBScore.value,
            status: 'finished'
          })
          .eq('id', currentMatchId)

      if (updateMatchError) throw updateMatchError
    }

    const { error: deleteRosterError } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', currentMatchId)

    if (deleteRosterError) throw deleteRosterError

    const rosterRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: currentMatchId,
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
        .eq('match_id', currentMatchId)

    if (deleteStatsError) throw deleteStatsError

    const statsRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: currentMatchId,
      player_id: playerId,
      points: stats.value[playerId]?.points ?? 0,
      three_pointers: stats.value[playerId]?.threes ?? 0
    }))

    const { error: insertStatsError } = await supabase
        .from('player_game_stats')
        .insert(statsRows)

    if (insertStatsError) throw insertStatsError

    successMessage.value = 'Partido finalizado correctamente.'
    await refreshMatches()
    emit('completed', currentMatchId)
    resetNewMatchFlow()
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error finalizando partido'
  } finally {
    saving.value = false
  }
}

watch(matchDate, () => {
  showNewMatchWarning.value = false
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h2 class="h4 mb-1">Nuevo partido</h2>
          <p class="text-body-secondary mb-0">
            Registra resultado, roster y estadísticas del partido.
          </p>
        </div>

        <button
            type="button"
            class="btn btn-outline-secondary"
            @click="startNewMatchRequested">
          Revisar partido en progreso
        </button>
      </div>

      <div v-if="inProgressMatchesForSelectedDate.length" class="alert alert-warning mb-4">
        <div class="fw-semibold mb-2">
          Tienes partido(s) en progreso para esta jornada
        </div>

        <div class="d-flex flex-column gap-2">
          <div
              v-for="match in inProgressMatchesForSelectedDate"
              :key="match.id"
              class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
            <div>
              <div class="fw-semibold">
                {{ formatDate(match.played_at) }}
              </div>
              <div class="small text-body-secondary">
                {{ teamLabel(match.team_a_id, 'Equipo A') }}
                {{ match.team_a_score }} -
                {{ match.team_b_score }}
                {{ teamLabel(match.team_b_id, 'Equipo B') }}
              </div>
            </div>

            <button
                type="button"
                class="btn btn-outline-dark btn-sm"
                @click="resumeMatch(match.id)">
              Reanudar
            </button>
          </div>
        </div>
      </div>

      <div v-if="showNewMatchWarning" class="alert alert-danger mb-4">
        <div class="fw-semibold mb-2">
          No puedes pasar a otro partido sin finalizar el que está en progreso hoy.
        </div>

        <p class="mb-3">
          Primero reanuda y termina ese partido de esta jornada.
        </p>

        <div class="d-flex gap-2 flex-wrap">
          <button
              v-for="match in inProgressMatchesForSelectedDate"
              :key="match.id"
              type="button"
              class="btn btn-primary"
              @click="resumeMatch(match.id); showNewMatchWarning = false">
            Reanudar {{ formatDate(match.played_at) }}
          </button>

          <button
              type="button"
              class="btn btn-outline-dark"
              @click="showNewMatchWarning = false">
            Cerrar aviso
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <div v-if="successMessage" class="alert alert-success" role="alert">
        {{ successMessage }}
      </div>

      <p v-if="loading" class="mb-0">Cargando nuevo partido...</p>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12">
            <div class="d-flex gap-2 flex-wrap">
              <span class="badge" :class="currentStep === 1 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 1: resultado</span>
              <span class="badge" :class="currentStep === 2 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 2: jugadores</span>
              <span class="badge" :class="currentStep === 3 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 3: stats</span>
            </div>
          </div>
        </div>

        <div v-if="currentStep === 1" class="card border mb-4">
          <div class="card-body">
            <h3 class="h5 mb-3">Paso 1: resultado</h3>

            <div class="row g-3">
              <div class="col-12 col-lg-4">
                <label class="form-label">Fecha</label>
                <input
                    v-model="matchDate"
                    type="date"
                    class="form-control" />
              </div>

              <div class="col-12 col-lg-4">
                <label class="form-label">Equipo A</label>
                <select v-model="teamAId" class="form-select">
                  <option value="">Selecciona equipo</option>
                  <option v-for="team in teams" :key="team.id" :value="team.id">
                    {{ team.name }}
                  </option>
                </select>
              </div>

              <div class="col-12 col-lg-4">
                <label class="form-label">Equipo B</label>
                <select v-model="teamBId" class="form-select">
                  <option value="">Selecciona equipo</option>
                  <option v-for="team in teams" :key="team.id" :value="team.id">
                    {{ team.name }}
                  </option>
                </select>
              </div>

              <div class="col-12">
                <button class="btn btn-primary" @click="goToStep2">
                  Continuar al roster
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentStep === 2" class="card border mb-4">
          <div class="card-body">
            <h3 class="h5 mb-3">Paso 2: jugadores que fueron</h3>

            <div class="alert alert-info mb-4">
              Selecciona jugadores directamente dentro del equipo para el que van a jugar hoy.
              Sus estadísticas contarán, pero su equipo base no cambiará.
            </div>

            <div class="row g-4">
              <div class="col-12 col-xl-6">
                <div class="card border h-100">
                  <div class="card-body">
                    <h4 class="h6 mb-3">{{ teamName(teamAId) }}</h4>

                    <div class="mb-3">
                      <div class="small fw-semibold text-body-secondary mb-2">Plantilla base</div>

                      <div class="row g-3">
                        <div
                            v-for="player in teamABasePlayers"
                            :key="`team-a-base-${player.id}`"
                            class="col-12">
                          <div class="card border-0 bg-light-subtle h-100">
                            <div class="card-body py-2 d-flex justify-content-between align-items-center">
                              <div>
                                <div class="fw-semibold">{{ player.name }}</div>
                                <div class="small text-body-secondary">
                                  Equipo base: {{ playerBaseTeamName(player) }}
                                </div>
                              </div>

                              <input
                                  class="form-check-input"
                                  type="checkbox"
                                  :checked="isAssignedToTeam(player.id, teamAId)"
                                  @change="togglePlayerForTeam(player.id, ($event.target as HTMLInputElement).checked, teamAId)" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div class="small fw-semibold text-body-secondary mb-2">Refuerzos posibles</div>

                      <div class="row g-3">
                        <div
                            v-for="player in teamAReinforcementPlayers"
                            :key="`team-a-reinf-${player.id}`"
                            class="col-12">
                          <div class="card border-0 bg-light-subtle h-100">
                            <div class="card-body py-2 d-flex justify-content-between align-items-center">
                              <div>
                                <div class="fw-semibold">{{ player.name }}</div>
                                <div class="small text-body-secondary">
                                  Equipo base: {{ playerBaseTeamName(player) }}
                                  <span v-if="playerIsReinforcementForTeam(player, teamAId)" class="ms-1 badge text-bg-warning">
                                    Refuerzo
                                  </span>
                                </div>
                              </div>

                              <input
                                  class="form-check-input"
                                  type="checkbox"
                                  :checked="isAssignedToTeam(player.id, teamAId)"
                                  @change="togglePlayerForTeam(player.id, ($event.target as HTMLInputElement).checked, teamAId)" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="small text-body-secondary mt-3">
                      Asignados a {{ teamName(teamAId) }}: {{ teamASelectedCount }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12 col-xl-6">
                <div class="card border h-100">
                  <div class="card-body">
                    <h4 class="h6 mb-3">{{ teamName(teamBId) }}</h4>

                    <div class="mb-3">
                      <div class="small fw-semibold text-body-secondary mb-2">Plantilla base</div>

                      <div class="row g-3">
                        <div
                            v-for="player in teamBBasePlayers"
                            :key="`team-b-base-${player.id}`"
                            class="col-12">
                          <div class="card border-0 bg-light-subtle h-100">
                            <div class="card-body py-2 d-flex justify-content-between align-items-center">
                              <div>
                                <div class="fw-semibold">{{ player.name }}</div>
                                <div class="small text-body-secondary">
                                  Equipo base: {{ playerBaseTeamName(player) }}
                                </div>
                              </div>

                              <input
                                  class="form-check-input"
                                  type="checkbox"
                                  :checked="isAssignedToTeam(player.id, teamBId)"
                                  @change="togglePlayerForTeam(player.id, ($event.target as HTMLInputElement).checked, teamBId)" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div class="small fw-semibold text-body-secondary mb-2">Refuerzos posibles</div>

                      <div class="row g-3">
                        <div
                            v-for="player in teamBReinforcementPlayers"
                            :key="`team-b-reinf-${player.id}`"
                            class="col-12">
                          <div class="card border-0 bg-light-subtle h-100">
                            <div class="card-body py-2 d-flex justify-content-between align-items-center">
                              <div>
                                <div class="fw-semibold">{{ player.name }}</div>
                                <div class="small text-body-secondary">
                                  Equipo base: {{ playerBaseTeamName(player) }}
                                  <span v-if="playerIsReinforcementForTeam(player, teamBId)" class="ms-1 badge text-bg-warning">
                                    Refuerzo
                                  </span>
                                </div>
                              </div>

                              <input
                                  class="form-check-input"
                                  type="checkbox"
                                  :checked="isAssignedToTeam(player.id, teamBId)"
                                  @change="togglePlayerForTeam(player.id, ($event.target as HTMLInputElement).checked, teamBId)" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="small text-body-secondary mt-3">
                      Asignados a {{ teamName(teamBId) }}: {{ teamBSelectedCount }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="d-flex gap-2 flex-wrap mt-4">
              <button class="btn btn-outline-secondary" @click="currentStep = 1">
                Volver
              </button>

              <button class="btn btn-primary" @click="goToStep3">
                Continuar a stats
              </button>
            </div>
          </div>
        </div>

        <div v-else class="card border mb-4">
          <div class="card-body">
            <h3 class="h5 mb-3">Paso 3: stats por jugador</h3>

            <div class="card border-dark shadow-sm mb-4">
              <div class="card-body">
                <div class="small text-body-secondary mb-3">Marcador en vivo</div>

                <div class="row align-items-center text-center g-3">
                  <div class="col-5">
                    <div class="fw-bold fs-4">{{ teamName(teamAId) }}</div>
                  </div>

                  <div class="col-2">
                    <div class="display-6 fw-bold">
                      {{ liveTeamAScore }} - {{ liveTeamBScore }}
                    </div>
                  </div>

                  <div class="col-5">
                    <div class="fw-bold fs-4">{{ teamName(teamBId) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="row g-4 mb-4">
              <div class="col-12 col-xl-6">
                <div class="card h-100 border-start border-4 border-primary shadow-sm">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <h4 class="h5 mb-0">{{ teamName(teamAId) }}</h4>
                      <span class="badge text-bg-primary">{{ liveTeamAScore }} pts</span>
                    </div>

                    <div
                        v-for="player in rosterTeamAPlayers"
                        :key="player.id"
                        class="card border-0 bg-light-subtle mb-3 shadow-sm">
                      <div class="card-body py-3 px-3">
                        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                          <div>
                            <div class="fw-semibold">
                              {{ player.name }}
                              <span
                                  v-if="player.team_id !== teamAId"
                                  class="ms-1 badge text-bg-warning">
                                Refuerzo
                              </span>
                            </div>
                            <div class="small text-body-secondary">
                              Equipo base: {{ playerBaseTeamName(player) }}
                            </div>
                            <div class="small text-body-secondary">
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
                      <h4 class="h5 mb-0">{{ teamName(teamBId) }}</h4>
                      <span class="badge text-bg-success">{{ liveTeamBScore }} pts</span>
                    </div>

                    <div
                        v-for="player in rosterTeamBPlayers"
                        :key="player.id"
                        class="card border-0 bg-light-subtle mb-3 shadow-sm">
                      <div class="card-body py-3 px-3">
                        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                          <div>
                            <div class="fw-semibold">
                              {{ player.name }}
                              <span
                                  v-if="player.team_id !== teamBId"
                                  class="ms-1 badge text-bg-warning">
                                Refuerzo
                              </span>
                            </div>
                            <div class="small text-body-secondary">
                              Equipo base: {{ playerBaseTeamName(player) }}
                            </div>
                            <div class="small text-body-secondary">
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

            <div class="d-flex gap-2 flex-wrap pt-2">
              <button class="btn btn-outline-secondary" @click="currentStep = 2">
                Volver al roster
              </button>

              <button class="btn btn-outline-primary" :disabled="saving" @click="saveProgress">
                {{ saving ? 'Guardando...' : 'Guardar progreso' }}
              </button>

              <button class="btn btn-success fw-bold" :disabled="saving" @click="finalizeMatch">
                {{ saving ? 'Finalizando...' : 'Finalizar partido' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
