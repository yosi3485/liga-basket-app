<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import { getMatchLabel } from '../utils/matches'

const emit = defineEmits<{
  (e: 'open-match-details', matchId: string): void
}>()

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

const teams = ref<TeamRow[]>([])
const matches = ref<MatchRow[]>([])
const selectedDate = ref('')
const selectedMatchId = ref<string | null>(null)
const loading = ref(false)
const errorMessage = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      { data: teamsData, error: teamsError },
      { data: matchesData, error: matchesError }
    ] = await Promise.all([
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase
          .from('matches')
          .select(`
          id,
          played_at,
          created_at,
          team_a_id,
          team_b_id,
          team_a_score,
          team_b_score,
          status
        `)
          .order('played_at', { ascending: false })
          .order('created_at', { ascending: false })
    ])

    if (teamsError) throw teamsError
    if (matchesError) throw matchesError

    teams.value = teamsData ?? []
    matches.value = matchesData ?? []

    if (!selectedDate.value && matches.value.length > 0) {
      selectedDate.value = matches.value[0].played_at
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

const availableDates = computed(() => {
  const uniqueDates = [...new Set(matches.value.map((match) => match.played_at))]
  return uniqueDates.sort((a, b) => b.localeCompare(a))
})

const matchesForSelectedDate = computed(() => {
  return matches.value
      .filter((match) => match.played_at === selectedDate.value)
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        return aTime - bTime
      })
})

function teamName(teamId: string, fallback: string) {
  return teamsMap.value.get(teamId) ?? fallback
}

function matchTitle(match: MatchRow) {
  return getMatchLabel(match, matchesForSelectedDate.value)
}

function winner(match: MatchRow) {
  if (match.team_a_score > match.team_b_score) return 'A'
  if (match.team_b_score > match.team_a_score) return 'B'
  return 'DRAW'
}

function teamClass(match: MatchRow, side: 'A' | 'B') {
  const result = winner(match)

  if (result === 'DRAW') return 'text-body'
  if (result === side) return 'fw-bold text-success'
  return 'text-muted'
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
          Consulta todos los partidos jugados en una fecha específica.
        </p>
      </div>

      <p v-if="loading" class="mb-0">Cargando jornadas...</p>

      <div v-else-if="errorMessage" class="alert alert-danger mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label for="matchday-select" class="form-label">Selecciona una fecha</label>
            <select
                id="matchday-select"
                v-model="selectedDate"
                class="form-select">
              <option value="">Selecciona una fecha</option>
              <option
                  v-for="date in availableDates"
                  :key="date"
                  :value="date">
                {{ formatDate(date) }}
              </option>
            </select>
          </div>
        </div>

        <template v-if="selectedDate">
          <div class="mb-3">
            <h3 class="h5 mb-1">{{ formatDate(selectedDate) }}</h3>
            <p class="text-muted mb-0">
              {{ matchesForSelectedDate.length }} partido(s) registrado(s)
            </p>
          </div>

          <div v-if="matchesForSelectedDate.length" class="d-flex flex-column gap-3">
            <div
                v-for="match in matchesForSelectedDate"
                :key="match.id"
                class="card border">
              <div class="card-body">
                <div class="text-muted small mb-2">
                  {{ matchTitle(match) }}
                </div>

                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                  <span :class="teamClass(match, 'A')">
                    {{ teamName(match.team_a_id, 'Equipo A') }}
                  </span>

                  <span class="badge bg-dark fs-6 px-3 py-2">
                    <i class="fa-solid fa-basketball me-1"></i>
                    {{ match.team_a_score }} - {{ match.team_b_score }}
                  </span>

                  <span :class="teamClass(match, 'B')">
                    {{ teamName(match.team_b_id, 'Equipo B') }}
                  </span>
                </div>

                <div class="mt-3 d-flex gap-2 flex-wrap">
                  <span
                      v-if="winner(match) === 'A'"
                      class="badge text-bg-success">
                    Ganó {{ teamName(match.team_a_id, 'Equipo A') }}
                  </span>

                  <span
                      v-else-if="winner(match) === 'B'"
                      class="badge text-bg-success">
                    Ganó {{ teamName(match.team_b_id, 'Equipo B') }}
                  </span>

                  <span
                      v-else
                      class="badge text-bg-secondary">
                    Empate
                  </span>

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

          <p v-else class="text-muted mb-0">
            No hay partidos registrados para esta fecha.
          </p>
        </template>

        <p v-else class="text-muted mb-0">
          Selecciona una fecha para ver la jornada.
        </p>
      </template>

    </div>
  </section>
</template>
