<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type PlayerRow = {
  id: string
  name: string
  team_id: string
}

type TeamRow = {
  id: string
  name: string
}

type PlayerUserRow = {
  id: string
  user_id: string
  player_id: string
}

const { isAdmin } = useAuth()

const players = ref<PlayerRow[]>([])
const teams = ref<TeamRow[]>([])
const playerUsers = ref<PlayerUserRow[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedPlayerId = ref('')
const authUserId = ref('')

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [
      { data: playersData, error: playersError },
      { data: teamsData, error: teamsError },
      { data: linksData, error: linksError }
    ] = await Promise.all([
      supabase
          .from('players')
          .select('id, name, team_id')
          .order('name', { ascending: true }),
      supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true }),
      supabase
          .from('player_users')
          .select('id, user_id, player_id')
    ])

    if (playersError) throw playersError
    if (teamsError) throw teamsError
    if (linksError) throw linksError

    players.value = playersData ?? []
    teams.value = teamsData ?? []
    playerUsers.value = linksData ?? []
  } catch (error) {
    errorMessage.value =
        error instanceof Error ? error.message : 'Error cargando usuarios de jugadores'
  } finally {
    loading.value = false
  }
}

const teamsMap = computed(() => {
  return new Map(teams.value.map((team) => [team.id, team.name]))
})

const linkedPlayerIds = computed(() => {
  return new Set(playerUsers.value.map((row) => row.player_id))
})

const availablePlayers = computed(() => {
  return players.value.filter((player) => !linkedPlayerIds.value.has(player.id))
})

const playerLinks = computed(() => {
  return playerUsers.value
      .map((link) => {
        const player = players.value.find((p) => p.id === link.player_id)

        return {
          id: link.id,
          userId: link.user_id,
          playerId: link.player_id,
          playerName: player?.name ?? 'Jugador desconocido',
          teamName: player ? (teamsMap.value.get(player.team_id) ?? 'Sin equipo') : 'Sin equipo'
        }
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName))
})

async function createLink() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedPlayerId.value) {
    errorMessage.value = 'Selecciona un jugador.'
    return
  }

  if (!authUserId.value.trim()) {
    errorMessage.value = 'Escribe el UUID del usuario de Auth.'
    return
  }

  saving.value = true

  const { error } = await supabase
      .from('player_users')
      .insert({
        player_id: selectedPlayerId.value,
        user_id: authUserId.value.trim()
      })

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Usuario vinculado correctamente.'
    selectedPlayerId.value = ''
    authUserId.value = ''
    await loadData()
  }

  saving.value = false
}

async function deleteLink(linkId: string) {
  const confirmed = window.confirm('¿Seguro que quieres desvincular este usuario del jugador?')
  if (!confirmed) return

  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  const { error } = await supabase
      .from('player_users')
      .delete()
      .eq('id', linkId)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Vinculación eliminada.'
    await loadData()
  }

  saving.value = false
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <section class="card shadow-sm">
    <div class="card-body">
      <div class="mb-3">
        <h2 class="h4 mb-1">Usuarios de jugadores</h2>
        <p class="text-muted mb-0">
          Vincula una cuenta autenticada de Supabase con un jugador.
        </p>
      </div>

      <div v-if="!isAdmin" class="alert alert-secondary mb-0" role="alert">
        Solo administradores pueden gestionar usuarios de jugadores.
      </div>

      <template v-else>
        <div class="alert alert-info">
          Crea primero el usuario en Supabase Auth y luego pega aquí su <strong>UUID</strong>.
        </div>

        <div class="row g-3 mb-4">
          <div class="col-12 col-lg-6">
            <label class="form-label">Jugador</label>
            <select v-model="selectedPlayerId" class="form-select">
              <option value="">Selecciona un jugador</option>
              <option
                  v-for="player in availablePlayers"
                  :key="player.id"
                  :value="player.id">
                {{ player.name }} · {{ teamsMap.get(player.team_id) ?? 'Sin equipo' }}
              </option>
            </select>
          </div>

          <div class="col-12 col-lg-6">
            <label class="form-label">UUID del usuario Auth</label>
            <input
                v-model="authUserId"
                type="text"
                class="form-control"
                placeholder="Pega aquí el user_id de Supabase Auth" />
          </div>

          <div class="col-12">
            <button
                class="btn btn-primary"
                :disabled="saving || loading"
                @click="createLink">
              {{ saving ? 'Guardando...' : 'Vincular usuario' }}
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="alert alert-danger" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="alert alert-success" role="alert">
          {{ successMessage }}
        </div>

        <p v-if="loading" class="mb-0">Cargando vínculos...</p>

        <div v-else-if="playerLinks.length" class="table-responsive">
          <table class="table table-striped align-middle mb-0">
            <thead class="table-light">
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>User ID</th>
              <th></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="link in playerLinks" :key="link.id">
              <td class="fw-semibold">{{ link.playerName }}</td>
              <td>{{ link.teamName }}</td>
              <td class="small">{{ link.userId }}</td>
              <td class="text-end">
                <button
                    class="btn btn-outline-danger btn-sm"
                    :disabled="saving"
                    @click="deleteLink(link.id)">
                  Desvincular
                </button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="text-muted mb-0">No hay usuarios vinculados todavía.</p>
      </template>
    </div>
  </section>
</template>
