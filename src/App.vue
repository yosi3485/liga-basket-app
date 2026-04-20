<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AuthPanel from './components/AuthPanel.vue'
import JornadaMvpVoting from './components/JornadaMvpVoting.vue'
import LeagueDashboard from './components/LeagueDashboard.vue'
import MatchDaysView from './components/MatchDaysView.vue'
import MatchDetails from './components/MatchDetails.vue'
import NewMatchFlow from './components/NewMatchFlow.vue'
import PlayerProfile from './components/PlayerProfile.vue'
import PlayersLeaderboard from './components/PlayersLeaderboard.vue'
import PlayersManager from './components/PlayersManager.vue'
import PlayerUsersManager from './components/PlayerUsersManager.vue'
import TableView from './components/TableView.vue'
import TeamsManager from './components/TeamsManager.vue'
import MvpVoteReminder from './components/MvpVoteReminder.vue'
import { useAuth } from './composables/useAuth'

type AppTab =
    | 'home'
    | 'table_view'
    | 'leaderboard'
    | 'match_days'
    | 'match_details'
    | 'player_profile'
    | 'mvp_vote'
    | 'new_match_flow'
    | 'teams'
    | 'players'
    | 'player_users'

const matchesRefreshKey = ref(0)
const teamsRefreshKey = ref(0)
const activeTab = ref<AppTab>('home')
const selectedMatchDetailsId = ref('')

const { isAdmin } = useAuth()

const publicTabs = computed<AppTab[]>(() => [
  'home',
  'table_view',
  'match_days',
  'match_details',
  'leaderboard',
  'player_profile',
  'mvp_vote'
])

const adminTabs = computed<AppTab[]>(() => [
  'new_match_flow',
  'teams',
  'players',
  'player_users'
])

const allowedTabs = computed<AppTab[]>(() => {
  return isAdmin.value
      ? [...publicTabs.value, ...adminTabs.value]
      : [...publicTabs.value]
})

function handleMatchesChanged() {
  matchesRefreshKey.value += 1
}

function handleTeamsChanged() {
  teamsRefreshKey.value += 1
}

function handleOpenMatchDetails(matchId: string) {
  selectedMatchDetailsId.value = matchId
  activeTab.value = 'match_details'
}

function handleFlowCompleted(matchId: string) {
  matchesRefreshKey.value += 1
  selectedMatchDetailsId.value = matchId
  activeTab.value = 'match_details'
}

function handleGoToMvpVote() {
  activeTab.value = 'mvp_vote'
}

function tabLabel(tab: AppTab) {
  return (
      {
        home: 'Home',
        table_view: 'Tabla',
        leaderboard: 'Leaderboard',
        match_days: 'Jornadas',
        match_details: 'Detalle partido',
        player_profile: 'Perfil jugador',
        mvp_vote: 'MVP jornada',
        new_match_flow: 'Nuevo partido',
        teams: 'Equipos admin',
        players: 'Jugadores',
        player_users: 'Usuarios jugadores'
      }[tab] ?? 'Navegación'
  )
}

function isTabVisible(tab: AppTab) {
  return allowedTabs.value.includes(tab)
}

onMounted(() => {
  const savedTab = localStorage.getItem('liga-basket-active-tab') as AppTab | null

  if (savedTab && allowedTabs.value.includes(savedTab)) {
    activeTab.value = savedTab
    return
  }

  activeTab.value = 'home'
})

watch(activeTab, (newTab) => {
  localStorage.setItem('liga-basket-active-tab', newTab)
})

watch(isAdmin, (newIsAdmin) => {
  if (!newIsAdmin && !publicTabs.value.includes(activeTab.value)) {
    activeTab.value = 'home'
  }
})
</script>

<template>
  <main class="container py-4 py-md-5">
    <header class="mb-4 mb-md-5">
      <div class="row">
        <div class="col-12">
          <div class="mb-3">
            <span class="badge text-bg-dark rounded-pill px-3 py-2">
              Liga amateur
            </span>
          </div>

          <h1 class="display-6 fw-bold mb-2">
            <i class="fa-solid fa-basketball me-2 text-warning"></i>
            Liga de Basket
          </h1>

          <p class="text-body-secondary mb-0 col-lg-8">
            Administra equipos, registra resultados, consulta la tabla, revisa jornadas y sigue el rendimiento de los jugadores.
          </p>
        </div>
      </div>
    </header>

    <AuthPanel />

    <MvpVoteReminder @go-to-mvp="handleGoToMvpVote" />

    <nav class="mb-4">
      <div class="d-block d-md-none">
        <div class="dropdown">
          <button
              class="btn btn-dark dropdown-toggle w-100"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false">
            {{ tabLabel(activeTab) }}
          </button>

          <ul class="dropdown-menu w-100">
            <li v-if="isTabVisible('home')">
              <button class="dropdown-item" type="button" @click="activeTab = 'home'">Home</button>
            </li>
            <li v-if="isTabVisible('table_view')">
              <button class="dropdown-item" type="button" @click="activeTab = 'table_view'">Tabla</button>
            </li>
            <li v-if="isTabVisible('match_days')">
              <button class="dropdown-item" type="button" @click="activeTab = 'match_days'">Jornadas</button>
            </li>
            <li v-if="isTabVisible('match_details')">
              <button class="dropdown-item" type="button" @click="activeTab = 'match_details'">Detalle partido</button>
            </li>
            <li v-if="isTabVisible('leaderboard')">
              <button class="dropdown-item" type="button" @click="activeTab = 'leaderboard'">Leaderboard</button>
            </li>
            <li v-if="isTabVisible('player_profile')">
              <button class="dropdown-item" type="button" @click="activeTab = 'player_profile'">Perfil jugador</button>
            </li>
            <li v-if="isTabVisible('mvp_vote')">
              <button class="dropdown-item" type="button" @click="activeTab = 'mvp_vote'">MVP jornada</button>
            </li>

            <li v-if="isTabVisible('new_match_flow')">
              <button class="dropdown-item" type="button" @click="activeTab = 'new_match_flow'">Nuevo partido</button>
            </li>
            <li v-if="isTabVisible('teams')">
              <button class="dropdown-item" type="button" @click="activeTab = 'teams'">Equipos admin</button>
            </li>
            <li v-if="isTabVisible('players')">
              <button class="dropdown-item" type="button" @click="activeTab = 'players'">Jugadores</button>
            </li>
            <li v-if="isTabVisible('player_users')">
              <button class="dropdown-item" type="button" @click="activeTab = 'player_users'">Usuarios jugadores</button>
            </li>
          </ul>
        </div>
      </div>

      <div class="d-none d-md-flex gap-2 flex-wrap">
        <button v-if="isTabVisible('home')" type="button" class="btn" :class="activeTab === 'home' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'home'">Home</button>
        <button v-if="isTabVisible('table_view')" type="button" class="btn" :class="activeTab === 'table_view' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'table_view'">Tabla</button>
        <button v-if="isTabVisible('match_days')" type="button" class="btn" :class="activeTab === 'match_days' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'match_days'">Jornadas</button>
        <button v-if="isTabVisible('match_details')" type="button" class="btn" :class="activeTab === 'match_details' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'match_details'">Detalle partido</button>
        <button v-if="isTabVisible('leaderboard')" type="button" class="btn" :class="activeTab === 'leaderboard' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'leaderboard'">Leaderboard</button>
        <button v-if="isTabVisible('player_profile')" type="button" class="btn" :class="activeTab === 'player_profile' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'player_profile'">Perfil jugador</button>
        <button v-if="isTabVisible('mvp_vote')" type="button" class="btn" :class="activeTab === 'mvp_vote' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'mvp_vote'">MVP jornada</button>

        <button v-if="isTabVisible('new_match_flow')" type="button" class="btn" :class="activeTab === 'new_match_flow' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'new_match_flow'">Nuevo partido</button>
        <button v-if="isTabVisible('teams')" type="button" class="btn" :class="activeTab === 'teams' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'teams'">Equipos admin</button>
        <button v-if="isTabVisible('players')" type="button" class="btn" :class="activeTab === 'players' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'players'">Jugadores</button>
        <button v-if="isTabVisible('player_users')" type="button" class="btn" :class="activeTab === 'player_users' ? 'btn-dark' : 'btn-outline-dark'" @click="activeTab = 'player_users'">Usuarios jugadores</button>
      </div>
    </nav>

    <section v-if="activeTab === 'home'" class="row g-4">
      <div class="col-12">
        <LeagueDashboard :refresh-key="matchesRefreshKey + teamsRefreshKey" />
      </div>
    </section>

    <section v-else-if="activeTab === 'table_view'" class="row g-4">
      <div class="col-12">
        <TableView :refresh-key="matchesRefreshKey + teamsRefreshKey" />
      </div>
    </section>

    <section v-else-if="activeTab === 'match_days'" class="row g-4">
      <div class="col-12">
        <MatchDaysView @open-match-details="handleOpenMatchDetails" />
      </div>
    </section>

    <section v-else-if="activeTab === 'match_details'" class="row g-4">
      <div class="col-12">
        <MatchDetails
            :initial-match-id="selectedMatchDetailsId"
            @match-deleted="handleMatchesChanged" />
      </div>
    </section>

    <section v-else-if="activeTab === 'leaderboard'" class="row g-4">
      <div class="col-12">
        <PlayersLeaderboard />
      </div>
    </section>

    <section v-else-if="activeTab === 'player_profile'" class="row g-4">
      <div class="col-12">
        <PlayerProfile />
      </div>
    </section>

    <section v-else-if="activeTab === 'mvp_vote'" class="row g-4">
      <div class="col-12">
        <JornadaMvpVoting />
      </div>
    </section>

    <section v-else-if="activeTab === 'new_match_flow'" class="row g-4">
      <div class="col-12">
        <NewMatchFlow @completed="handleFlowCompleted" />
      </div>
    </section>

    <section v-else-if="activeTab === 'teams'" class="row g-4">
      <div class="col-12 col-lg-8 col-xl-6">
        <TeamsManager @teams-changed="handleTeamsChanged" />
      </div>
    </section>

    <section v-else-if="activeTab === 'players'" class="row g-4">
      <div class="col-12 col-xl-8">
        <PlayersManager />
      </div>
    </section>

    <section v-else-if="activeTab === 'player_users'" class="row g-4">
      <div class="col-12">
        <PlayerUsersManager />
      </div>
    </section>
  </main>
</template>
