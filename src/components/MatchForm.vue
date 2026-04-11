<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const emit = defineEmits<{
  (e: 'match-created'): void
}>()

type Team = {
  id: string
  name: string
}

const teams = ref<Team[]>([])
const loadingTeams = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const teamAId = ref('')
const teamBId = ref('')
const teamAScore = ref<number | null>(null)
const teamBScore = ref<number | null>(null)
const playedAt = ref('')

const selectedTeamAName = computed(() => {
  return teams.value.find((team) => team.id === teamAId.value)?.name ?? 'Equipo A'
})

const selectedTeamBName = computed(() => {
  return teams.value.find((team) => team.id === teamBId.value)?.name ?? 'Equipo B'
})

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

  teamAId.value = ''
  teamBId.value = ''
}

async function loadTeams() {
  loadingTeams.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    teams.value = []
  } else {
    teams.value = data ?? []
    setDefaultTeams()
  }

  loadingTeams.value = false
}

function resetForm() {
  teamAScore.value = null
  teamBScore.value = null
  playedAt.value = ''
  setDefaultTeams()
}

async function addMatch() {
  errorMessage.value = ''
  successMessage.value = ''

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

  const { error } = await supabase.from('matches').insert({
    team_a_id: teamAId.value,
    team_b_id: teamBId.value,
    team_a_score: teamAScore.value,
    team_b_score: teamBScore.value,
    played_at: playedAt.value
  })

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Partido guardado correctamente.'
    resetForm()
    emit('match-created')
  }

  saving.value = false
}

onMounted(() => {
  loadTeams()
})
</script>

<template>
  <section class="card shadow-sm h-100">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Agregar partido</h2>
        <p class="text-muted mb-0">
          Registra un resultado nuevo para actualizar la tabla.
        </p>
      </div>

      <p v-if="loadingTeams" class="mb-0">Cargando equipos...</p>

      <template v-else>
        <div class="row g-3">
          <div class="col-12">
            <label for="team-a" class="form-label">{{ selectedTeamAName }}</label>
            <select id="team-a" v-model="teamAId" class="form-select">
              <option value="">Selecciona un equipo</option>
              <option
                  v-for="team in teams"
                  :key="team.id"
                  :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="col-12 col-md-6">
            <label for="team-a-score" class="form-label">
              Puntos {{ selectedTeamAName }}
            </label>
            <input
                id="team-a-score"
                v-model.number="teamAScore"
                class="form-control"
                type="number"
                min="0" />
          </div>

          <div class="col-12">
            <label for="team-b" class="form-label">{{ selectedTeamBName }}</label>
            <select id="team-b" v-model="teamBId" class="form-select">
              <option value="">Selecciona un equipo</option>
              <option
                  v-for="team in teams"
                  :key="team.id"
                  :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="col-12 col-md-6">
            <label for="team-b-score" class="form-label">
              Puntos {{ selectedTeamBName }}
            </label>
            <input
                id="team-b-score"
                v-model.number="teamBScore"
                class="form-control"
                type="number"
                min="0" />
          </div>

          <div class="col-12">
            <label for="played-at" class="form-label">Fecha</label>
            <input
                id="played-at"
                v-model="playedAt"
                class="form-control"
                type="date" />
          </div>
        </div>

        <div class="mt-4 d-flex gap-2">
          <button class="btn btn-primary" :disabled="saving" @click="addMatch">
            {{ saving ? 'Guardando...' : 'Guardar partido' }}
          </button>
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
