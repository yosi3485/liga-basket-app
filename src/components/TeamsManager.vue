<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const emit = defineEmits<{
  (e: 'teams-changed'): void
}>()

type Team = {
  id: string
  name: string
  created_at: string
}

const teams = ref<Team[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const newTeamName = ref('')

const editingTeamId = ref<string | null>(null)
const editingTeamName = ref('')

async function loadTeams() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    teams.value = []
  } else {
    teams.value = data ?? []
  }

  loading.value = false
}

async function addTeam() {
  const name = newTeamName.value.trim()

  if (!name) {
    errorMessage.value = 'Escribe un nombre de equipo.'
    return
  }

  saving.value = true
  errorMessage.value = ''

  const { error } = await supabase.from('teams').insert({ name })

  if (error) {
    errorMessage.value = error.message
  } else {
    newTeamName.value = ''
    await loadTeams()
    emit('teams-changed')
  }

  saving.value = false
}

function startEditing(team: Team) {
  editingTeamId.value = team.id
  editingTeamName.value = team.name
  errorMessage.value = ''
}

function cancelEditing() {
  editingTeamId.value = null
  editingTeamName.value = ''
}

async function updateTeam() {
  const id = editingTeamId.value
  const name = editingTeamName.value.trim()

  if (!id) return

  if (!name) {
    errorMessage.value = 'El nombre del equipo no puede estar vacío.'
    return
  }

  saving.value = true
  errorMessage.value = ''

  const { error } = await supabase
      .from('teams')
      .update({ name })
      .eq('id', id)

  if (error) {
    errorMessage.value = error.message
  } else {
    cancelEditing()
    await loadTeams()
    emit('teams-changed')
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
        <h2 class="h4 mb-1">Equipos</h2>
        <p class="text-muted mb-0">
          Agrega equipos nuevos o cambia el nombre de los existentes.
        </p>
      </div>

      <div class="mb-4">
        <label for="new-team-name" class="form-label">Nuevo equipo</label>
        <div class="input-group">
          <input
              id="new-team-name"
              v-model="newTeamName"
              type="text"
              class="form-control"
              placeholder="Nombre del equipo"
              @keyup.enter="addTeam" />
          <button class="btn btn-primary" :disabled="saving" @click="addTeam">
            {{ saving ? 'Guardando...' : 'Agregar' }}
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <p v-if="loading" class="mb-0">Cargando equipos...</p>

      <ul v-else-if="teams.length" class="list-group">
        <li
            v-for="team in teams"
            :key="team.id"
            class="list-group-item">
          <template v-if="editingTeamId === team.id">
            <div class="d-flex flex-column gap-2">
              <input
                  v-model="editingTeamName"
                  type="text"
                  class="form-control"
                  @keyup.enter="updateTeam" />

              <div class="d-flex gap-2 flex-wrap">
                <button
                    class="btn btn-success btn-sm"
                    :disabled="saving"
                    @click="updateTeam">
                  Guardar
                </button>
                <button
                    class="btn btn-outline-secondary btn-sm"
                    :disabled="saving"
                    @click="cancelEditing">
                  Cancelar
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
              <span class="fw-medium">{{ team.name }}</span>
              <button
                  class="btn btn-outline-primary btn-sm"
                  @click="startEditing(team)">
                Editar
              </button>
            </div>
          </template>
        </li>
      </ul>

      <p v-else class="text-muted mb-0">No hay equipos todavía.</p>
    </div>
  </section>
</template>
