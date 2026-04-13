<script setup lang="ts">
import { computed, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getMatchLabel } from '../utils/matches'

type Team = {
  id: string
  name: string
}

type Player = {
  id: string
  name: string
  jersey_number: number | null
  team_id: string
  is_active: boolean
}

type Match = {
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
  player_id: string
}

type PlayerStatRow = {
  player_id: string
  points: number
  three_pointers: number
}

const emit = defineEmits<{
  (e: 'completed', matchId: string): void
}>()

const { isAdmin } = useAuth()

const step = ref<1 | 2 | 3>(1)

const teams = ref<Team[]>([])
const players = ref<Player[]>([])
const inProgressMatches = ref<Match[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedInProgressMatchId = ref('')

const matchId = ref('')
const playedAt = ref(getTodayLocalDate())
const teamAId = ref('')
const teamBId = ref('')

const selectedPlayerIds = ref<string[]>([])
const stats = ref<Record<string, { points: number; threes: number }>>({})

function getTodayLocalDate() {
  return new Date().toISOString().split('T')[0]
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  const [
    { data: teamsData, error: teamsError },
    { data: playersData, error: playersError },
    { data: matchesData, error: matchesError }
  ] = await Promise.all([
    supabase.from('teams').select('id, name').order('name', { ascending: true }),
    supabase
        .from('players')
        .select('id, name, jersey_number, team_id, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true }),
    supabase
        .from('matches')
        .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
        .eq('status', 'in_progress')
        .order('played_at', { ascending: false })
        .order('created_at', { ascending: false })
  ])

  if (teamsError) {
    errorMessage.value = teamsError.message
    teams.value = []
  } else {
    teams.value = teamsData ?? []
  }

  if (playersError) {
    errorMessage.value = playersError.message
    players.value = []
  } else {
    players.value = playersData ?? []
  }

  if (matchesError) {
    errorMessage.value = matchesError.message
    inProgressMatches.value = []
  } else {
    inProgressMatches.value = matchesData ?? []
  }

  if (!matchId.value) {
    setDefaultTeams()
  }

  loading.value = false
}

function setDefaultTeams() {
  if (teams.value.length === 2) {
    const santaCruz = teams.value.find((team) => team.name === 'Santa Cruz')
    const kendall = teams.value.find((team) => team.name === 'Kendall')

    if (santaCruz && kendall) {
      teamAId.value = santaCruz.id
      teamBId.value = kendall.id
      return
    }

    teamAId.value = teams.value[0].id
    teamBId.value = teams.value[1].id
    return
  }

  if (!teamAId.value && teams.value.length > 0) {
    teamAId.value = teams.value[0].id
  }
}

function resetFlow() {
  selectedInProgressMatchId.value = ''
  matchId.value = ''
  playedAt.value = getTodayLocalDate()
  teamAId.value = ''
  teamBId.value = ''
  selectedPlayerIds.value = []
  stats.value = {}
  step.value = 1
  successMessage.value = ''
  errorMessage.value = ''
  setDefaultTeams()
}

async function loadExistingMatch() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedInProgressMatchId.value) {
    errorMessage.value = 'Selecciona un partido en progreso.'
    return
  }

  loading.value = true

  try {
    const selectedMatch = inProgressMatches.value.find(
        (match) => match.id === selectedInProgressMatchId.value
    )

    if (!selectedMatch) {
      throw new Error('No se encontró el partido en progreso.')
    }

    const [
      { data: rosterData, error: rosterError },
      { data: statsData, error: statsError }
    ] = await Promise.all([
      supabase
          .from('match_players')
          .select('player_id')
          .eq('match_id', selectedMatch.id),
      supabase
          .from('player_game_stats')
          .select('player_id, points, three_pointers')
          .eq('match_id', selectedMatch.id)
    ])

    if (rosterError) throw rosterError
    if (statsError) throw statsError

    matchId.value = selectedMatch.id
    playedAt.value = selectedMatch.played_at || getTodayLocalDate()
    teamAId.value = selectedMatch.team_a_id
    teamBId.value = selectedMatch.team_b_id

    selectedPlayerIds.value = ((rosterData as MatchPlayerRow[]) ?? []).map((row) => row.player_id)

    stats.value = {}
    for (const row of ((statsData as PlayerStatRow[]) ?? [])) {
      stats.value[row.player_id] = {
        points: row.points,
        threes: row.three_pointers
      }
    }

    step.value = 3
    successMessage.value = 'Partido en progreso cargado correctamente.'
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando partido en progreso'
  } finally {
    loading.value = false
  }
}

const selectedTeamAName = computed(() => {
  return teams.value.find((team) => team.id === teamAId.value)?.name ?? 'Equipo A'
})

const selectedTeamBName = computed(() => {
  return teams.value.find((team) => team.id === teamBId.value)?.name ?? 'Equipo B'
})

const shouldShowTeamSelectors = computed(() => {
  return teams.value.length !== 2
})

const teamAPlayers = computed(() => {
  return players.value
      .filter((player) => player.team_id === teamAId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamBPlayers = computed(() => {
  return players.value
      .filter((player) => player.team_id === teamBId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const rosterPlayers = computed(() => {
  return players.value.filter((player) => selectedPlayerIds.value.includes(player.id))
})

const rosterTeamAPlayers = computed(() => {
  return rosterPlayers.value
      .filter((player) => player.team_id === teamAId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const rosterTeamBPlayers = computed(() => {
  return rosterPlayers.value
      .filter((player) => player.team_id === teamBId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
})

const teamASelectedCount = computed(() => {
  return rosterPlayers.value.filter(
      (player) => player.team_id === teamAId.value
  ).length
})

const teamBSelectedCount = computed(() => {
  return rosterPlayers.value.filter(
      (player) => player.team_id === teamBId.value
  ).length
})

const liveTeamAScore = computed(() => {
  return rosterTeamAPlayers.value.reduce(
      (sum, player) => sum + (stats.value[player.id]?.points ?? 0),
      0
  )
})

const liveTeamBScore = computed(() => {
  return rosterTeamBPlayers.value.reduce(
      (sum, player) => sum + (stats.value[player.id]?.points ?? 0),
      0
  )
})

function togglePlayer(playerId: string, checked: boolean) {
  if (checked) {
    if (!selectedPlayerIds.value.includes(playerId)) {
      selectedPlayerIds.value = [...selectedPlayerIds.value, playerId]
    }
  } else {
    selectedPlayerIds.value = selectedPlayerIds.value.filter((id) => id !== playerId)
  }
}

function isSelected(playerId: string) {
  return selectedPlayerIds.value.includes(playerId)
}

function updateStat(playerId: string, field: 'points' | 'threes', value: string) {
  if (!stats.value[playerId]) {
    stats.value[playerId] = { points: 0, threes: 0 }
  }

  if (value === '') {
    stats.value[playerId][field] = 0
    return
  }

  const parsedValue = Number(value)
  stats.value[playerId][field] = Number.isNaN(parsedValue) ? 0 : parsedValue
}

function statInputValue(playerId: string, field: 'points' | 'threes') {
  if (!stats.value[playerId]) return ''
  const value = stats.value[playerId][field]
  return value === 0 ? '' : String(value)
}

function validateStep1() {
  if (!teamAId.value || !teamBId.value) {
    return 'Selecciona los dos equipos.'
  }

  if (teamAId.value === teamBId.value) {
    return 'Los equipos deben ser diferentes.'
  }

  if (!playedAt.value) {
    playedAt.value = getTodayLocalDate()
  }

  return ''
}

function validateRoster() {
  if (!selectedPlayerIds.value.length) {
    return 'Selecciona al menos un jugador.'
  }

  if (teamASelectedCount.value < 3) {
    return `Debes seleccionar al menos 3 jugadores para ${selectedTeamAName.value}.`
  }

  if (teamBSelectedCount.value < 3) {
    return `Debes seleccionar al menos 3 jugadores para ${selectedTeamBName.value}.`
  }

  return ''
}

function validateFinalize() {
  if (liveTeamAScore.value === liveTeamBScore.value) {
    return 'El partido no puede terminar empatado.'
  }

  if (liveTeamAScore.value < 7 && liveTeamBScore.value < 7) {
    return 'El equipo ganador debe llegar al menos a 7 puntos.'
  }

  return ''
}

async function createMatchAndRoster() {
  errorMessage.value = ''
  successMessage.value = ''

  const step1Error = validateStep1()
  if (step1Error) {
    errorMessage.value = step1Error
    return
  }

  const rosterError = validateRoster()
  if (rosterError) {
    errorMessage.value = rosterError
    return
  }

  saving.value = true

  try {
    const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .insert({
          team_a_id: teamAId.value,
          team_b_id: teamBId.value,
          team_a_score: 0,
          team_b_score: 0,
          played_at: playedAt.value || getTodayLocalDate(),
          status: 'in_progress'
        })
        .select('id')
        .single()

    if (matchError) throw matchError

    matchId.value = matchData.id

    const rosterRows = selectedPlayerIds.value.map((playerId) => ({
      match_id: matchId.value,
      player_id: playerId
    }))

    const { error: rosterInsertError } = await supabase
        .from('match_players')
        .insert(rosterRows)

    if (rosterInsertError) throw rosterInsertError

    await loadData()

    successMessage.value = 'Partido creado en progreso. Ahora registra las estadísticas.'
    step.value = 3
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error creando el partido'
  } finally {
    saving.value = false
  }
}

async function saveProgress() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!matchId.value) {
    errorMessage.value = 'No hay partido en progreso.'
    return
  }

  saving.value = true

  try {
    const { error: matchUpdateError } = await supabase
        .from('matches')
        .update({
          team_a_score: liveTeamAScore.value,
          team_b_score: liveTeamBScore.value,
          played_at: playedAt.value || getTodayLocalDate(),
          status: 'in_progress'
        })
        .eq('id', matchId.value)

    if (matchUpdateError) throw matchUpdateError

    const statRows = rosterPlayers.value.map((player) => ({
      match_id: matchId.value,
      player_id: player.id,
      points: stats.value[player.id]?.points ?? 0,
      three_pointers: stats.value[player.id]?.threes ?? 0
    }))

    const { error: statsError } = await supabase
        .from('player_game_stats')
        .upsert(statRows, {
          onConflict: 'match_id,player_id'
        })

    if (statsError) throw statsError

    await loadData()

    successMessage.value = 'Progreso guardado correctamente.'
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

  if (!matchId.value) {
    errorMessage.value = 'No hay partido en progreso.'
    return
  }

  const finalizeError = validateFinalize()
  if (finalizeError) {
    errorMessage.value = finalizeError
    return
  }

  saving.value = true

  try {
    const statRows = rosterPlayers.value.map((player) => ({
      match_id: matchId.value,
      player_id: player.id,
      points: stats.value[player.id]?.points ?? 0,
      three_pointers: stats.value[player.id]?.threes ?? 0
    }))

    const { error: statsError } = await supabase
        .from('player_game_stats')
        .upsert(statRows, {
          onConflict: 'match_id,player_id'
        })

    if (statsError) throw statsError

    const { error: matchUpdateError } = await supabase
        .from('matches')
        .update({
          team_a_score: liveTeamAScore.value,
          team_b_score: liveTeamBScore.value,
          played_at: playedAt.value || getTodayLocalDate(),
          status: 'finished'
        })
        .eq('id', matchId.value)

    if (matchUpdateError) throw matchUpdateError

    await loadData()

    successMessage.value = 'Partido finalizado correctamente.'
    emit('completed', matchId.value)
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error finalizando el partido'
  } finally {
    saving.value = false
  }
}

function goToRoster() {
  errorMessage.value = ''
  successMessage.value = ''

  const validationError = validateStep1()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  step.value = 2
}

function goToStats() {
  errorMessage.value = ''
  successMessage.value = ''

  const rosterError = validateRoster()
  if (rosterError) {
    errorMessage.value = rosterError
    return
  }

  createMatchAndRoster()
}

function matchLabel(match: Match) {
  return getMatchLabel(match, inProgressMatches.value)
}

loadData()
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3 d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h2 class="h4 mb-1">Nuevo partido</h2>
          <p class="text-muted mb-0">
            Crea el partido, define quién jugó, registra stats en vivo y finalízalo cuando termine.
          </p>
        </div>

        <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            @click="resetFlow">
          Nuevo partido limpio
        </button>
      </div>

      <div v-if="!isAdmin" class="alert alert-secondary mb-0" role="alert">
        Solo los administradores pueden registrar partidos.
      </div>

      <template v-else>
        <div class="row g-3 mb-4" v-if="inProgressMatches.length">
          <div class="col-12 col-lg-7">
            <label class="form-label">Continuar partido en progreso</label>
            <select v-model="selectedInProgressMatchId" class="form-select">
              <option value="">Selecciona un partido en progreso</option>
              <option
                  v-for="match in inProgressMatches"
                  :key="match.id"
                  :value="match.id">
                {{ matchLabel(match) }}
              </option>
            </select>
          </div>

          <div class="col-12 col-lg-5 d-flex align-items-end">
            <button
                type="button"
                class="btn btn-outline-dark w-100"
                :disabled="loading"
                @click="loadExistingMatch">
              Continuar editando
            </button>
          </div>
        </div>

        <div class="mb-4">
          <div class="d-flex gap-2 flex-wrap">
            <span class="badge" :class="step === 1 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 1 · Fecha / Equipos</span>
            <span class="badge" :class="step === 2 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 2 · Jugadores que fueron</span>
            <span class="badge" :class="step === 3 ? 'text-bg-dark' : 'text-bg-secondary'">Paso 3 · Stats en vivo / Finalizar</span>
          </div>
        </div>

        <div v-if="step === 1" class="row g-3">
          <div v-if="shouldShowTeamSelectors" class="col-12 col-md-6">
            <label class="form-label">{{ selectedTeamAName }}</label>
            <select v-model="teamAId" class="form-select">
              <option value="">Selecciona un equipo</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div v-if="shouldShowTeamSelectors" class="col-12 col-md-6">
            <label class="form-label">{{ selectedTeamBName }}</label>
            <select v-model="teamBId" class="form-select">
              <option value="">Selecciona un equipo</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="col-12 col-md-6">
            <label class="form-label">Fecha</label>
            <input v-model="playedAt" type="date" class="form-control" />
            <div class="form-text">Si no cambias la fecha, se usará hoy.</div>
          </div>

          <div class="col-12">
            <button class="btn btn-primary" :disabled="loading" @click="goToRoster">
              Continuar al roster
            </button>
          </div>
        </div>

        <div v-else-if="step === 2" class="row g-4">
          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-2">{{ selectedTeamAName }}</h3>
            <p
                class="small mb-3"
                :class="teamASelectedCount >= 3 ? 'text-success' : 'text-danger'">
              {{ teamASelectedCount }}/3 mínimo
            </p>

            <ul class="list-group">
              <li v-for="player in teamAPlayers" :key="player.id" class="list-group-item">
                <div class="form-check d-flex align-items-center gap-2">
                  <input
                      :id="`roster-a-${player.id}`"
                      class="form-check-input"
                      type="checkbox"
                      :checked="isSelected(player.id)"
                      @change="togglePlayer(player.id, ($event.target as HTMLInputElement).checked)" />
                  <label
                      class="form-check-label d-flex justify-content-between align-items-center w-100"
                      :for="`roster-a-${player.id}`">
                    <span>{{ player.name }}</span>
                    <span class="badge text-bg-dark">{{ player.jersey_number ?? 'Sin número' }}</span>
                  </label>
                </div>
              </li>
            </ul>
          </div>

          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-2">{{ selectedTeamBName }}</h3>
            <p
                class="small mb-3"
                :class="teamBSelectedCount >= 3 ? 'text-success' : 'text-danger'">
              {{ teamBSelectedCount }}/3 mínimo
            </p>

            <ul class="list-group">
              <li v-for="player in teamBPlayers" :key="player.id" class="list-group-item">
                <div class="form-check d-flex align-items-center gap-2">
                  <input
                      :id="`roster-b-${player.id}`"
                      class="form-check-input"
                      type="checkbox"
                      :checked="isSelected(player.id)"
                      @change="togglePlayer(player.id, ($event.target as HTMLInputElement).checked)" />
                  <label
                      class="form-check-label d-flex justify-content-between align-items-center w-100"
                      :for="`roster-b-${player.id}`">
                    <span>{{ player.name }}</span>
                    <span class="badge text-bg-dark">{{ player.jersey_number ?? 'Sin número' }}</span>
                  </label>
                </div>
              </li>
            </ul>
          </div>

          <div class="col-12 d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary" @click="step = 1">
              Volver
            </button>
            <button class="btn btn-primary" :disabled="saving" @click="goToStats">
              Crear partido y pasar a stats
            </button>
          </div>
        </div>

        <div v-else class="row g-4">
          <div class="col-12">
            <div class="card border">
              <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                <div class="fw-bold fs-5">{{ selectedTeamAName }}</div>
                <div class="badge bg-dark fs-4 px-4 py-3">
                  <i class="fa-solid fa-basketball me-2"></i>
                  {{ liveTeamAScore }} - {{ liveTeamBScore }}
                </div>
                <div class="fw-bold fs-5 text-md-end">{{ selectedTeamBName }}</div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <div class="alert alert-info mb-0" role="alert">
              El partido está en progreso. Puedes guardar avance varias veces y finalizar cuando termine.
            </div>
          </div>

          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-3">{{ selectedTeamAName }}</h3>

            <div v-if="rosterTeamAPlayers.length">
              <div
                  v-for="player in rosterTeamAPlayers"
                  :key="player.id"
                  class="row g-2 align-items-center mb-2">
                <div class="col-12 col-md-4">
                  <span class="fw-semibold">{{ player.name }}</span>
                </div>

                <div class="col-6 col-md-4">
                  <input
                      type="number"
                      class="form-control"
                      placeholder="Puntos"
                      :value="statInputValue(player.id, 'points')"
                      @input="updateStat(player.id, 'points', ($event.target as HTMLInputElement).value)" />
                </div>

                <div class="col-6 col-md-4">
                  <input
                      type="number"
                      class="form-control"
                      placeholder="3PT"
                      :value="statInputValue(player.id, 'threes')"
                      @input="updateStat(player.id, 'threes', ($event.target as HTMLInputElement).value)" />
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-6">
            <h3 class="h5 mb-3">{{ selectedTeamBName }}</h3>

            <div v-if="rosterTeamBPlayers.length">
              <div
                  v-for="player in rosterTeamBPlayers"
                  :key="player.id"
                  class="row g-2 align-items-center mb-2">
                <div class="col-12 col-md-4">
                  <span class="fw-semibold">{{ player.name }}</span>
                </div>

                <div class="col-6 col-md-4">
                  <input
                      type="number"
                      class="form-control"
                      placeholder="Puntos"
                      :value="statInputValue(player.id, 'points')"
                      @input="updateStat(player.id, 'points', ($event.target as HTMLInputElement).value)" />
                </div>

                <div class="col-6 col-md-4">
                  <input
                      type="number"
                      class="form-control"
                      placeholder="3PT"
                      :value="statInputValue(player.id, 'threes')"
                      @input="updateStat(player.id, 'threes', ($event.target as HTMLInputElement).value)" />
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary" @click="step = 2">
              Volver al roster
            </button>
            <button class="btn btn-outline-primary" :disabled="saving" @click="saveProgress">
              {{ saving ? 'Guardando...' : 'Guardar progreso' }}
            </button>
            <button class="btn btn-success" :disabled="saving" @click="finalizeMatch">
              {{ saving ? 'Guardando...' : 'Finalizar partido' }}
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success mt-3 mb-0" role="alert">
          {{ successMessage }}
        </div>
      </template>
    </div>
  </section>
</template>
