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
import TableView from './components/TableView.vue'
import TeamsManager from './components/TeamsManager.vue'
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


type NavItem = {
  id: AppTab
  label: string
  adminOnly?: boolean
}

const matchesRefreshKey = ref(0)
const teamsRefreshKey = ref(0)
const activeTab = ref<AppTab>('home')
const selectedMatchDetailsId = ref('')

const { isAdmin } = useAuth()

const navItems = computed<NavItem[]>(() => [
  { id: 'home', label: 'Inicio' },
  { id: 'table_view', label: 'Tabla General' },
  { id: 'match_days', label: 'Jornadas' },
  { id: 'match_details', label: 'Partido' },
  { id: 'leaderboard', label: 'Líderes' },
  { id: 'player_profile', label: 'Perfil' },
  { id: 'mvp_vote', label: 'MVP' },
  { id: 'new_match_flow', label: 'Nuevo Partido', adminOnly: true },
  { id: 'teams', label: 'Equipos', adminOnly: true },
  { id: 'players', label: 'Jugadores', adminOnly: true },
])

const visibleNavItems = computed(() => {
  return navItems.value.filter((item) => !item.adminOnly || isAdmin.value)
})

const allowedTabs = computed<AppTab[]>(() => {
  return visibleNavItems.value.map((item) => item.id)
})

const activeTabLabel = computed(() => {
  return visibleNavItems.value.find((item) => item.id === activeTab.value)?.label ?? 'Secciones'
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

function goToTab(tab: AppTab) {
  activeTab.value = tab
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
  if (!newIsAdmin && !allowedTabs.value.includes(activeTab.value)) {
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

    <nav class="mb-4">
      <div class="d-block d-md-none">
        <button
            class="btn btn-dark w-100 d-flex justify-content-between align-items-center"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#mobile-nav-offcanvas"
            aria-controls="mobile-nav-offcanvas">
          <span>{{ activeTabLabel }}</span>
          <i class="fa-solid fa-bars"></i>
        </button>

        <div
            id="mobile-nav-offcanvas"
            class="offcanvas offcanvas-bottom"
            tabindex="-1"
            aria-labelledby="mobile-nav-offcanvas-label"
            style="height: auto; max-height: 80vh;">
          <div class="offcanvas-header">
            <h5 id="mobile-nav-offcanvas-label" class="offcanvas-title">
              Ir a sección
            </h5>
            <button
                type="button"
                class="btn-close"
                data-bs-dismiss="offcanvas"
                aria-label="Close"></button>
          </div>

          <div class="offcanvas-body">
            <div class="list-group">
              <button
                  v-for="item in visibleNavItems"
                  :key="item.id"
                  type="button"
                  class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                  :class="activeTab === item.id ? 'bg-dark text-white border-dark' : ''"
                  data-bs-dismiss="offcanvas"
                  @click="goToTab(item.id)">
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="d-none d-md-flex gap-2 flex-wrap">
        <button
            v-for="item in visibleNavItems"
            :key="item.id"
            type="button"
            class="btn"
            :class="activeTab === item.id ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = item.id">
          {{ item.label }}
        </button>
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

      <div class="col-12">
        <PlayersManager />
      </div>
    </section>

  </main>
</template>
