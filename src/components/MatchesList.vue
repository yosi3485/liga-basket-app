<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { formatDate } from '../utils/date'

const props = defineProps<{
  refreshKey: number
}>()

const emit = defineEmits<{
  (e: 'matches-changed'): void
}>()

type Team = {
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

const { isAdmin } = useAuth()

const teams = ref<Team[]>([])
const matches = ref<MatchRow[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const editingMatchId = ref<string | null>(null)
const teamAId = ref('')
const teamBId = ref('')
const teamAScore = ref<number | null>(null)
const teamBScore = ref<number | null>(null)
const playedAt = ref('')

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

async function loadTeams() {
  const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    teams.value = []
  } else {
    teams.value = data ?? []
  }
}

async function loadMatches() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const { data, error } = await supabase
      .from('matches')
      .select(`
      id,
      played_at,
      team_a_id,
      team_b_id,
      team_a_score,
      team_b_score
    `)
      .order('played_at', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    matches.value = []
  } else {
    matches.value = (data as MatchRow[]) ?? []
  }

  loading.value = false
}

function teamName(teamId: string, fallback: string) {
  return teamsMap.value.get(teamId) ?? fallback
}

function startEditing(match: MatchRow) {
  editingMatchId.value = match.id
  teamAId.value = match.team_a_id
  teamBId.value = match.team_b_id
  teamAScore.value = match.team_a_score
  teamBScore.value = match.team_b_score
  playedAt.value = match.played_at
  errorMessage.value = ''
  successMessage.value = ''
}

function cancelEditing() {
  editingMatchId.value = null
  teamAId.value = ''
  teamBId.value = ''
  teamAScore.value = null
  teamBScore.value = null
  playedAt.value = ''
}

async function updateMatch() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!editingMatchId.value) return

  if (!teamAId.value || !teamBId.value) {
    errorMessage.value = 'Selecciona los dos equipos.'
    return
  }

  if (teamAId.value === teamBId.value) {
    errorMessage.value = 'Los equipos deben ser diferentes.'
    return
  }

  if (teamAScore.value === null || teamBScore.value === null) {
    errorMessage.value = 'Escribe los dos marcadores.'
    return
  }

  if (!playedAt.value) {
    errorMessage.value = 'Selecciona la fecha del partido.'
    return
  }

  saving.value = true

  const { error } = await supabase
      .from('matches')
      .update({
        team_a_id: teamAId.value,
        team_b_id: teamBId.value,
        team_a_score: teamAScore.value,
        team_b_score: teamBScore.value,
        played_at: playedAt.value
      })
      .eq('id', editingMatchId.value)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Partido actualizado correctamente.'
    cancelEditing()
    await loadMatches()
    emit('matches-changed')
  }

  saving.value = false
}

async function deleteMatch(matchId: string) {
  const confirmed = window.confirm('¿Seguro que quieres eliminar este partido?')

  if (!confirmed) return

  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchId)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Partido eliminado correctamente.'
    if (editingMatchId.value === matchId) {
      cancelEditing()
    }
    await loadMatches()
    emit('matches-changed')
  }

  saving.value = false
}

function getWinner(match: MatchRow) {
  if (match.team_a_score > match.team_b_score) return 'A'
  if (match.team_b_score > match.team_a_score) return 'B'
  return 'DRAW'
}

function getTeamClass(match: MatchRow, side: 'A' | 'B') {
  const winner = getWinner(match)

  if (winner === 'DRAW') return 'text-body'
  if (winner === side) return 'fw-bold text-success'
  return 'text-muted'
}

onMounted(async () => {
  await loadTeams()
  await loadMatches()
})

watch(
    () => props.refreshKey,
    () => {
      loadMatches()
    }
)
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Partidos</h2>
        <p class="text-muted mb-0">
          Revisa los resultados guardados y corrige cualquier error.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando partidos...</p>

      <template v-else>
        <div v-if="errorMessage" class="alert alert-danger" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <ul v-if="matches.length" class="list-group">
          <li
              v-for="match in matches"
              :key="match.id"
              class="list-group-item">
            <template v-if="editingMatchId === match.id">
              <div class="row g-3">
                <div class="col-12 col-md-6">
                  <label class="form-label">Equipo A</label>
                  <select v-model="teamAId" class="form-select">
                    <option value="">Selecciona equipo A</option>
                    <option
                        v-for="team in teams"
                        :key="team.id"
                        :value="team.id">
                      {{ team.name }}
                    </option>
                  </select>
                </div>

                <div class="col-12 col-md-6">
                  <label class="form-label">Puntos equipo A</label>
                  <input
                      v-model.number="teamAScore"
                      class="form-control"
                      type="number"
                      min="0"
                      placeholder="Puntos A" />
                </div>

                <div class="col-12 col-md-6">
                  <label class="form-label">Equipo B</label>
                  <select v-model="teamBId" class="form-select">
                    <option value="">Selecciona equipo B</option>
                    <option
                        v-for="team in teams"
                        :key="team.id"
                        :value="team.id">
                      {{ team.name }}
                    </option>
                  </select>
                </div>

                <div class="col-12 col-md-6">
                  <label class="form-label">Puntos equipo B</label>
                  <input
                      v-model.number="teamBScore"
                      class="form-control"
                      type="number"
                      min="0"
                      placeholder="Puntos B" />
                </div>

                <div class="col-12 col-md-6">
                  <label class="form-label">Fecha</label>
                  <input
                      v-model="playedAt"
                      class="form-control"
                      type="date" />
                </div>
              </div>

              <div class="d-flex gap-2 flex-wrap mt-3">
                <button
                    class="btn btn-success btn-sm"
                    :disabled="saving"
                    @click="updateMatch">
                  Guardar
                </button>
                <button
                    class="btn btn-outline-secondary btn-sm"
                    :disabled="saving"
                    @click="cancelEditing">
                  Cancelar
                </button>
              </div>
            </template>

            <template v-else>
              <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                <div>
                  <div class="text-muted small mb-1">{{ formatDate(match.played_at) }}</div>

                  <div class="d-flex flex-wrap align-items-center gap-2">
                    <span :class="getTeamClass(match, 'A')">
                      {{ teamName(match.team_a_id, 'Equipo A') }}
                    </span>

                    <span class="badge bg-dark fs-6 px-3 py-2">
                      <i class="fa-solid fa-basketball me-1"></i>
                      {{ match.team_a_score }} - {{ match.team_b_score }}
                    </span>

                    <span :class="getTeamClass(match, 'B')">
                      {{ teamName(match.team_b_id, 'Equipo B') }}
                    </span>

                    <span
                        v-if="getWinner(match) === 'A'"
                        class="badge text-bg-success">
                      Ganó {{ teamName(match.team_a_id, 'Equipo A') }}
                    </span>

                    <span
                        v-else-if="getWinner(match) === 'B'"
                        class="badge text-bg-success">
                      Ganó {{ teamName(match.team_b_id, 'Equipo B') }}
                    </span>

                    <span
                        v-else
                        class="badge text-bg-secondary">
                      Empate
                    </span>
                  </div>
                </div>

                <div v-if="isAdmin" class="d-flex gap-2 flex-wrap">
                  <button
                      class="btn btn-outline-primary btn-sm"
                      :disabled="saving"
                      @click="startEditing(match)">
                    Editar
                  </button>
                  <button
                      class="btn btn-outline-danger btn-sm"
                      :disabled="saving"
                      @click="deleteMatch(match.id)">
                    Eliminar
                  </button>
                </div>
              </div>
            </template>
          </li>
        </ul>

        <p v-else class="text-muted mb-0">No hay partidos todavía.</p>
      </template>
    </div>
  </section>
</template>
