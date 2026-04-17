<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import { useAuth } from '../composables/useAuth'

type TeamRow = {
  id: string
  name: string
}

type PlayerRow = {
  id: string
  name: string
  team_id: string
}

type MatchRow = {
  id: string
  played_at: string
  status: 'in_progress' | 'finished'
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
}

type MatchPlayerRow = {
  match_id: string
  player_id: string
  team_id: string | null
}

type PlayerUserRow = {
  player_id: string
}

type VoteRow = {
  id: string
  played_at: string
  voter_player_id: string
  voted_player_id: string
}

type EligiblePlayerRow = {
  id: string
  name: string
  rosterTeamId: string
  rosterTeamName: string
}

const { session } = useAuth()

const teams = ref<TeamRow[]>([])
const players = ref<PlayerRow[]>([])
const matches = ref<MatchRow[]>([])
const matchPlayers = ref<MatchPlayerRow[]>([])
const existingVotes = ref<VoteRow[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const currentPlayerId = ref('')
const selectedDate = ref('')
const selectedVotedPlayerId = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: playersData, error: playersError },
      { data: matchesData, error: matchesError },
      { data: matchPlayersData, error: matchPlayersError },
      { data: votesData, error: votesError }
    ] = await Promise.all([
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),
      supabase
          .from('players')
          .select('id, name, team_id')
          .order('name', { ascending: true }),
      supabase
          .from('matches')
          .select('id, played_at, status, team_a_id, team_b_id, team_a_score, team_b_score')
          .eq('status', 'finished')
          .order('played_at', { ascending: false }),
      supabase
          .from('match_players')
          .select('match_id, player_id, team_id'),
      supabase
          .from('match_mvp_votes')
          .select('id, played_at, voter_player_id, voted_player_id')
    ])

    if (teamsError) throw teamsError
    if (playersError) throw playersError
    if (matchesError) throw matchesError
    if (matchPlayersError) throw matchPlayersError
    if (votesError) throw votesError

    teams.value = teamsData ?? []
    players.value = playersData ?? []
    matches.value = matchesData ?? []
    matchPlayers.value = matchPlayersData ?? []
    existingVotes.value = votesData ?? []

    await loadCurrentPlayerLink()

    if (!selectedDate.value && availableDates.value.length > 0) {
      selectedDate.value = availableDates.value[0]
    }
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando votación MVP'
  } finally {
    loading.value = false
  }
}

async function loadCurrentPlayerLink() {
  if (!session.value?.user?.id) {
    currentPlayerId.value = ''
    return
  }

  const { data, error } = await supabase
      .from('player_users')
      .select('player_id')
      .eq('user_id', session.value.user.id)
      .maybeSingle()

  if (error) {
    errorMessage.value = error.message
    currentPlayerId.value = ''
    return
  }

  currentPlayerId.value = (data as PlayerUserRow | null)?.player_id ?? ''
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

const finishedMatchesForDate = computed(() => {
  return matches.value.filter((match) => match.played_at === selectedDate.value)
})

const finishedMatchIdsForDate = computed(() => {
  return new Set(finishedMatchesForDate.value.map((match) => match.id))
})

const jornadaWinnerTeamId = computed<string | null>(() => {
  if (!finishedMatchesForDate.value.length) return null

  const winsMap = new Map<string, number>()

  for (const match of finishedMatchesForDate.value) {
    let winnerTeamId: string | null = null

    if (match.team_a_score > match.team_b_score) {
      winnerTeamId = match.team_a_id
    } else if (match.team_b_score > match.team_a_score) {
      winnerTeamId = match.team_b_id
    }

    if (winnerTeamId) {
      winsMap.set(winnerTeamId, (winsMap.get(winnerTeamId) ?? 0) + 1)
    }
  }

  const entries = Array.from(winsMap.entries()).sort((a, b) => b[1] - a[1])

  if (!entries.length) return null
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null

  return entries[0][0]
})

const jornadaWinnerTeamName = computed(() => {
  return jornadaWinnerTeamId.value
      ? (teamsMap.value.get(jornadaWinnerTeamId.value) ?? 'Equipo ganador')
      : ''
})

const currentPlayerParticipated = computed(() => {
  if (!currentPlayerId.value) return false

  return matchPlayers.value.some(
      (row) =>
          row.player_id === currentPlayerId.value &&
          finishedMatchIdsForDate.value.has(row.match_id)
  )
})

const votedAlready = computed(() => {
  if (!currentPlayerId.value || !selectedDate.value) return null

  return existingVotes.value.find(
      (vote) =>
          vote.played_at === selectedDate.value &&
          vote.voter_player_id === currentPlayerId.value
  ) ?? null
})

const eligiblePlayers = computed<EligiblePlayerRow[]>(() => {
  if (!selectedDate.value || !jornadaWinnerTeamId.value) return []

  const playerRowsForWinningTeam = matchPlayers.value.filter((row) => {
    if (!finishedMatchIdsForDate.value.has(row.match_id)) return false

    const player = playersMap.value.get(row.player_id)
    const effectiveTeamId = row.team_id ?? player?.team_id ?? null

    return effectiveTeamId === jornadaWinnerTeamId.value
  })

  const uniquePlayerIds = [...new Set(playerRowsForWinningTeam.map((row) => row.player_id))]

  return uniquePlayerIds
      .filter((playerId) => playerId !== currentPlayerId.value)
      .map((playerId) => {
        const player = playersMap.value.get(playerId)
        const rosterRow = playerRowsForWinningTeam.find((row) => row.player_id === playerId)
        const rosterTeamId = rosterRow?.team_id ?? player?.team_id ?? ''
        const rosterTeamName = teamsMap.value.get(rosterTeamId) ?? 'Sin equipo'

        return {
          id: playerId,
          name: player?.name ?? 'Jugador',
          rosterTeamId,
          rosterTeamName
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
})

const voteResults = computed(() => {
  if (!selectedDate.value || !jornadaWinnerTeamId.value) return []

  const counts = new Map<string, number>()

  for (const vote of existingVotes.value.filter((v) => v.played_at === selectedDate.value)) {
    counts.set(vote.voted_player_id, (counts.get(vote.voted_player_id) ?? 0) + 1)
  }

  return eligiblePlayers.value
      .map((player) => ({
        id: player.id,
        name: player.name,
        teamName: player.rosterTeamName,
        votes: counts.get(player.id) ?? 0
      }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
})

async function submitVote() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!session.value) {
    errorMessage.value = 'Debes iniciar sesión para votar.'
    return
  }

  if (!currentPlayerId.value) {
    errorMessage.value = 'Tu cuenta no está vinculada a un jugador todavía.'
    return
  }

  if (!selectedDate.value) {
    errorMessage.value = 'Selecciona una jornada.'
    return
  }

  if (!currentPlayerParticipated.value) {
    errorMessage.value = 'Solo pueden votar jugadores que participaron en esa jornada.'
    return
  }

  if (!jornadaWinnerTeamId.value) {
    errorMessage.value = 'Esta jornada no tiene un equipo ganador único, así que no se puede votar MVP.'
    return
  }

  if (!selectedVotedPlayerId.value) {
    errorMessage.value = 'Selecciona a quién quieres votar.'
    return
  }

  if (selectedVotedPlayerId.value === currentPlayerId.value) {
    errorMessage.value = 'No puedes votarte a ti mismo.'
    return
  }

  if (!eligiblePlayers.value.some((player) => player.id === selectedVotedPlayerId.value)) {
    errorMessage.value = 'Solo puedes votar por jugadores elegibles del equipo ganador de la jornada.'
    return
  }

  saving.value = true

  const payload = {
    played_at: selectedDate.value,
    voter_player_id: currentPlayerId.value,
    voted_player_id: selectedVotedPlayerId.value
  }

  let error: { message: string } | null = null

  if (votedAlready.value) {
    const response = await supabase
        .from('match_mvp_votes')
        .update(payload)
        .eq('id', votedAlready.value.id)

    error = response.error
  } else {
    const response = await supabase
        .from('match_mvp_votes')
        .insert(payload)

    error = response.error
  }

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = votedAlready.value
        ? 'Tu voto fue actualizado.'
        : 'Tu voto fue guardado.'

    selectedVotedPlayerId.value = ''
    await loadData()
  }

  saving.value = false
}

watch(selectedDate, () => {
  selectedVotedPlayerId.value = ''
  errorMessage.value = ''
  successMessage.value = ''
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">MVP de la jornada</h2>
        <p class="text-muted mb-0">
          Solo puedes votar por jugadores del equipo ganador de la jornada, y nunca por ti mismo.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando votación MVP...</p>

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

          <div class="col-12 col-lg-6 d-flex align-items-end">
            <div class="w-100">
              <div class="small text-muted mb-1">Estado de tu cuenta</div>
              <div class="fw-semibold">
                <template v-if="!session">Debes iniciar sesión</template>
                <template v-else-if="!currentPlayerId">Cuenta sin jugador vinculado</template>
                <template v-else-if="currentPlayerParticipated">Puedes votar</template>
                <template v-else>No participaste en esta jornada</template>
              </div>
            </div>
          </div>
        </div>

        <div v-if="selectedDate && jornadaWinnerTeamId" class="alert alert-info">
          Equipo ganador de la jornada:
          <strong>{{ jornadaWinnerTeamName }}</strong>
        </div>

        <div v-else-if="selectedDate && finishedMatchesForDate.length" class="alert alert-warning">
          Esta jornada no tiene un equipo ganador único. Si hubo empate de partidos ganados, no se habilita la votación MVP.
        </div>

        <div
            v-if="session && currentPlayerId && currentPlayerParticipated && jornadaWinnerTeamId"
            class="row g-3 mb-4">
          <div class="col-12 col-lg-8">
            <label class="form-label">Votar por</label>
            <select v-model="selectedVotedPlayerId" class="form-select">
              <option value="">Selecciona un jugador</option>
              <option
                  v-for="player in eligiblePlayers"
                  :key="player.id"
                  :value="player.id">
                {{ player.name }} · {{ player.rosterTeamName }}
              </option>
            </select>
          </div>

          <div class="col-12 col-lg-4 d-flex align-items-end">
            <button
                class="btn btn-primary w-100"
                :disabled="saving || !eligiblePlayers.length"
                @click="submitVote">
              {{ saving ? 'Guardando...' : votedAlready ? 'Actualizar voto' : 'Votar MVP' }}
            </button>
          </div>
        </div>

        <div v-if="session && currentPlayerId && currentPlayerParticipated && jornadaWinnerTeamId && !eligiblePlayers.length" class="alert alert-warning">
          No hay jugadores elegibles para votar en el equipo ganador de esta jornada.
        </div>

        <div v-if="errorMessage" class="alert alert-danger" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <div v-if="voteResults.length" class="table-responsive">
          <table class="table table-striped align-middle mb-0">
            <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>Votos</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, index) in voteResults" :key="row.id">
              <td>
                <span v-if="index === 0">🥇</span>
                <span v-else-if="index === 1">🥈</span>
                <span v-else-if="index === 2">🥉</span>
                <span v-else>{{ index + 1 }}</span>
              </td>
              <td class="fw-semibold">{{ row.name }}</td>
              <td>{{ row.teamName }}</td>
              <td>{{ row.votes }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="text-muted mb-0">Todavía no hay votos para esta jornada.</p>
      </template>
    </div>
  </section>
</template>
