<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AuthPanel from './components/AuthPanel.vue'
import MatchForm from './components/MatchForm.vue'
import MatchesList from './components/MatchesList.vue'
import MatchPlayerStats from './components/MatchPlayerStats.vue'
import PlayerProfile from './components/PlayerProfile.vue'
import PlayersLeaderboard from './components/PlayersLeaderboard.vue'
import PlayersManager from './components/PlayersManager.vue'
import StandingsTable from './components/StandingsTable.vue'
import TeamsManager from './components/TeamsManager.vue'
import LeagueDashboard from './components/LeagueDashboard.vue'
import MatchDetails from './components/MatchDetails.vue'

type AppTab =
    | 'standings'
    | 'matches'
    | 'teams'
    | 'players'
    | 'stats'
    | 'leaderboard'
    | 'player_profile'
    | 'match_details'

const matchesRefreshKey = ref(0)
const teamsRefreshKey = ref(0)
const activeTab = ref<AppTab>('standings')

function handleMatchCreated() {
  matchesRefreshKey.value += 1
}

function handleMatchesChanged() {
  matchesRefreshKey.value += 1
}

function handleTeamsChanged() {
  teamsRefreshKey.value += 1
}

function tabLabel(tab: AppTab) {
  return (
      {
        standings: 'Tabla',
        matches: 'Partidos',
        teams: 'Equipos',
        players: 'Jugadores',
        stats: 'Stats',
        leaderboard: 'Leaderboard',
        player_profile: 'Perfil jugador',
        match_details: 'Detalle partido'
      }[tab] ?? 'Navegación'
  )
}

onMounted(() => {
  const savedTab = localStorage.getItem('liga-basket-active-tab') as AppTab | null

  if (
      savedTab === 'standings' ||
      savedTab === 'matches' ||
      savedTab === 'teams' ||
      savedTab === 'players' ||
      savedTab === 'stats' ||
      savedTab === 'leaderboard' ||
      savedTab === 'player_profile' ||
      savedTab === 'match_details'
  ) {
    activeTab.value = savedTab
  }
})

watch(activeTab, (newTab) => {
  localStorage.setItem('liga-basket-active-tab', newTab)
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

          <p class="text-muted mb-0 col-lg-8">
            Administra equipos, registra resultados, consulta la tabla de
            posiciones y organiza jugadores en una sola app.
          </p>
        </div>
      </div>
    </header>

    <AuthPanel />

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
            <li><button class="dropdown-item" type="button" @click="activeTab = 'standings'">Tabla</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'matches'">Partidos</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'teams'">Equipos</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'players'">Jugadores</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'stats'">Stats</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'leaderboard'">Leaderboard</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'player_profile'">Perfil jugador</button></li>
            <li><button class="dropdown-item" type="button" @click="activeTab = 'match_details'">Detalle partido</button></li>>
          </ul>
        </div>
      </div>

      <div class="d-none d-md-flex gap-2 flex-wrap">
        <button
            type="button"
            class="btn"
            :class="activeTab === 'standings' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'standings'">
          Tabla
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'matches' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'matches'">
          Partidos
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'teams' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'teams'">
          Equipos
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'players' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'players'">
          Jugadores
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'stats' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'stats'">
          Stats
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'leaderboard' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'leaderboard'">
          Leaderboard
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'player_profile' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'player_profile'">
          Perfil jugador
        </button>

        <button
            type="button"
            class="btn"
            :class="activeTab === 'match_details' ? 'btn-dark' : 'btn-outline-dark'"
            @click="activeTab = 'match_details'">
          Detalle partido
        </button>
      </div>
    </nav>

    <section v-if="activeTab === 'standings'" class="row g-4">
      <div class="col-12">
        <LeagueDashboard :refresh-key="matchesRefreshKey + teamsRefreshKey" />
      </div>

      <div class="col-12">
        <StandingsTable :refresh-key="matchesRefreshKey + teamsRefreshKey" />
      </div>
    </section>

    <section v-else-if="activeTab === 'matches'" class="row g-4">
      <div class="col-12 col-xl-5">
        <MatchForm @match-created="handleMatchCreated" />
      </div>

      <div class="col-12 col-xl-7">
        <MatchesList
            :refresh-key="matchesRefreshKey"
            @matches-changed="handleMatchesChanged" />
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

    <section v-else-if="activeTab === 'stats'" class="row g-4">
      <div class="col-12 col-xl-8">
        <MatchPlayerStats />
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

    <section v-else-if="activeTab === 'match_details'" class="row g-4">
      <div class="col-12">
        <MatchDetails />
      </div>
    </section>
  </main>
</template>
