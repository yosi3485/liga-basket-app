<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import { getMatchLabel } from '../utils/matches'

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
  team_b_score: number
  status: 'in_progress' | 'finished'
}

type VoteRow = {
  id: string
  played_at: string
  voter_player_id: string
  voted_player_id: string
}

type PlayerRow = {
  id: string
  name: string
  team_id: string
}

const emit = defineEmits<{
  (e: 'open-match-details', matchId: string): void
}>()

const teams = ref<TeamRow[]>([])
const matches = ref<MatchRow[]>([])
const votes = ref<VoteRow[]>([])
const players = ref<PlayerRow[]>([])

const loading = ref(false)
const errorMessage = ref('')
const selectedDate = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: matchesData, error: matchesError },
      { data: votesData, error: votesError },
      { data: playersData, error: playersError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, created_at, team_a_id, team_b_id, team_a_score, team_b_score, status')
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false }),
      supabase
          .from('match_mvp_votes')
          .select('id, played_at, voter_player_id, voted_player_id'),
      supabase
          .from('players')
          .select('id, name, team_id')
          .order('name', { ascending: true })
    ])

    if (teamsError) throw teamsError
    if (matchesError) throw matchesError
    if (votesError) throw votesError
    if (playersError) throw playersError

    teams.value = teamsData ?? []
    matches.value = matchesData ?? []
    votes.value = votesData ?? []
    players.value = playersData ?? []

    if (!selectedDate.value && availableDates.value.length > 0) {
      selectedDate.value = availableDates.value[0]
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando jornadas'
  } finally {
    loading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const playersMap = computed(() => {
  return new Map(players.value.map((player) => [player.id, player]))
})

const availableDates = computed(() => {
  return [...new Set(matches.value.map((match) => match.played_at))].sort((a, b) => b.localeCompare(a))
})

const matchesForSelectedDate = computed(() => {
  return matches.value.filter((match) => match.played_at === selectedDate.value)
})

const jornadaMvp = computed(() => {
  if (!selectedDate.value) return null

  const votesForDate = votes.value.filter((vote) => vote.played_at === selectedDate.value)
  if (!votesForDate.length) return null

  const counts = new Map<string, number>()

  for (const vote of votesForDate) {
    counts.set(vote.voted_player_id, (counts.get(vote.voted_player_id) ?? 0) + 1)
  }

  const ranking = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  if (!ranking.length) return null

  const [playerId, totalVotes] = ranking[0]
  const player = playersMap.value.get(playerId)

  return {
    playerName: player?.name ?? 'Jugador',
    teamName: player ? (teamsMap.value.get(player.team_id) ?? 'Sin equipo') : 'Sin equipo',
    votes: totalVotes
  }
})

function teamName(teamId: string, fallback: string) {
  return teamsMap.value.get(teamId) ?? fallback
}

function winner(match: MatchRow) {
  if (match.team_a_score > match.team_b_score) return 'A'
  if (match.team_b_score > match.team_a_score) return 'B'
  return null
}

function teamClass(match: MatchRow, side: 'A' | 'B') {
  const win = winner(match)

  if ((side === 'A' && win === 'A') || (side === 'B' && win === 'B')) {
    return 'fw-bold text-success-emphasis'
  }

  return 'text-muted'
}

function matchTitle(match: MatchRow) {
  return getMatchLabel(match, matches.value)
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Jornadas</h2>
        <p class="text-muted mb-0">
          Revisa los partidos jugados por fecha y consulta el MVP de cada jornada.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando jornadas...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label class="form-label">Jornada</label>
            <select v-model="selectedDate" class="form-select">
              <option value="">Selecciona una jornada</option>
              <option
                  v-for="date in availableDates"
                  :key="date"
                  :value="date">
                {{ formatDate(date) }} · Jornada
              </option>
            </select>
          </div>
        </div>

        <div v-if="selectedDate" class="mb-4">
          <h3 class="h5 mb-1 d-flex align-items-center gap-2">
            {{ formatDate(selectedDate) }}
            <span class="badge text-bg-dark">Jornada</span>
          </h3>

          <div class="small text-muted">
            {{ matchesForSelectedDate.length }} partido(s) en esta jornada
          </div>
        </div>

        <div v-if="jornadaMvp" class="alert alert-warning">
          <div class="fw-semibold">
            🏆 MVP de la jornada: {{ jornadaMvp.playerName }}
          </div>
          <div class="small">
            {{ jornadaMvp.teamName }} · {{ jornadaMvp.votes }} voto(s)
          </div>
        </div>

        <div v-if="matchesForSelectedDate.length" class="row g-3">
          <div
              v-for="match in matchesForSelectedDate"
              :key="match.id"
              class="col-12">
            <div class="card border">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                  <div class="text-muted small">
                    {{ matchTitle(match) }}
                  </div>

                  <span
                      class="badge"
                      :class="match.status === 'finished' ? 'text-bg-success' : 'text-bg-warning'">
                    <i class="fa-solid fa-circle me-1"></i>
                    {{ match.status === 'finished' ? 'Finalizado' : 'En progreso' }}
                  </span>
                </div>

                <div class="row align-items-center text-center g-3 mb-3">
                  <div class="col-12 col-md-4">
                    <div :class="teamClass(match, 'A')">
                      <i
                          v-if="winner(match) === 'A'"
                          class="fa-solid fa-trophy me-1 text-warning"></i>
                      {{ teamName(match.team_a_id, 'Equipo A') }}
                    </div>
                  </div>

                  <div class="col-12 col-md-4">
                    <span class="badge bg-dark fs-5 px-4 py-3">
                      <i class="fa-solid fa-basketball me-1"></i>
                      {{ match.team_a_score }} - {{ match.team_b_score }}
                    </span>
                  </div>

                  <div class="col-12 col-md-4">
                    <div :class="teamClass(match, 'B')">
                      <i
                          v-if="winner(match) === 'B'"
                          class="fa-solid fa-trophy me-1 text-warning"></i>
                      {{ teamName(match.team_b_id, 'Equipo B') }}
                    </div>
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
                  <div>
                    <div
                        v-if="winner(match) === 'A'"
                        class="small fw-semibold text-success">
                      Ganador: {{ teamName(match.team_a_id, 'Equipo A') }}
                    </div>

                    <div
                        v-else-if="winner(match) === 'B'"
                        class="small fw-semibold text-success">
                      Ganador: {{ teamName(match.team_b_id, 'Equipo B') }}
                    </div>

                    <div
                        v-else
                        class="small fw-semibold text-secondary">
                      Empate
                    </div>
                  </div>

                  <button
                      type="button"
                      class="btn btn-outline-dark btn-sm"
                      @click="emit('open-match-details', match.id)">
                    Ver detalle
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-else class="text-muted mb-0">
          No hay partidos registrados para esta jornada.
        </p>
      </template>
    </div>
  </section>
</template>
