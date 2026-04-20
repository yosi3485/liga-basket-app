<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import { useAuth } from '../composables/useAuth'

type MatchRow = {
  id: string
  played_at: string
  status: 'in_progress' | 'finished'
}

type MatchPlayerRow = {
  match_id: string
  player_id: string
}

type VoteRow = {
  id: string
  played_at: string
  voter_player_id: string
  voted_player_id: string
}

type PlayerUserRow = {
  player_id: string
}

const emit = defineEmits<{
  (e: 'go-to-mvp'): void
}>()

const { session } = useAuth()

const loading = ref(false)
const errorMessage = ref('')
const currentPlayerId = ref('')
const matches = ref<MatchRow[]>([])
const matchPlayers = ref<MatchPlayerRow[]>([])
const votes = ref<VoteRow[]>([])

async function loadReminderData() {
  if (!session.value?.user?.id) {
    currentPlayerId.value = ''
    matches.value = []
    matchPlayers.value = []
    votes.value = []
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: playerUserData, error: playerUserError },
      { data: matchesData, error: matchesError },
      { data: matchPlayersData, error: matchPlayersError },
      { data: votesData, error: votesError }
    ] = await Promise.all([
      supabase
          .from('player_users')
          .select('player_id')
          .eq('user_id', session.value.user.id)
          .maybeSingle(),
      supabase
          .from('matches')
          .select('id, played_at, status')
          .eq('status', 'finished')
          .order('played_at', { ascending: false }),
      supabase
          .from('match_players')
          .select('match_id, player_id'),
      supabase
          .from('match_mvp_votes')
          .select('id, played_at, voter_player_id, voted_player_id')
    ])

    if (playerUserError) throw playerUserError
    if (matchesError) throw matchesError
    if (matchPlayersError) throw matchPlayersError
    if (votesError) throw votesError

    currentPlayerId.value = (playerUserData as PlayerUserRow | null)?.player_id ?? ''
    matches.value = matchesData ?? []
    matchPlayers.value = matchPlayersData ?? []
    votes.value = votesData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando recordatorio MVP'
  } finally {
    loading.value = false
  }
}

const latestFinishedDate = computed(() => {
  return matches.value[0]?.played_at ?? ''
})

const latestFinishedMatchIds = computed(() => {
  if (!latestFinishedDate.value) return new Set<string>()

  return new Set(
      matches.value
          .filter((match) => match.played_at === latestFinishedDate.value)
          .map((match) => match.id)
  )
})

const participatedInLatestJornada = computed(() => {
  if (!currentPlayerId.value || !latestFinishedMatchIds.value.size) return false

  return matchPlayers.value.some(
      (row) =>
          row.player_id === currentPlayerId.value &&
          latestFinishedMatchIds.value.has(row.match_id)
  )
})

const alreadyVotedLatestJornada = computed(() => {
  if (!currentPlayerId.value || !latestFinishedDate.value) return false

  return votes.value.some(
      (vote) =>
          vote.played_at === latestFinishedDate.value &&
          vote.voter_player_id === currentPlayerId.value
  )
})

const shouldShowReminder = computed(() => {
  return Boolean(
      session.value &&
      currentPlayerId.value &&
      latestFinishedDate.value &&
      participatedInLatestJornada.value &&
      !alreadyVotedLatestJornada.value
  )
})

watch(
    () => session.value?.user?.id,
    () => {
      loadReminderData()
    }
)

onMounted(() => {
  loadReminderData()
})
</script>

<template>
  <div v-if="shouldShowReminder" class="alert alert-warning d-flex justify-content-between align-items-center gap-3 flex-wrap mb-4">
    <div>
      <div class="fw-semibold mb-1">Todavía no has votado por el MVP</div>
      <div class="small">
        Participaste en la jornada del {{ formatDate(latestFinishedDate) }}.
        Ve aquí para hacer tu votación del MVP.
      </div>
    </div>

    <button
        type="button"
        class="btn btn-dark"
        @click="emit('go-to-mvp')">
      Ir a votar
    </button>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger mb-4">
    {{ errorMessage }}
  </div>
</template>
