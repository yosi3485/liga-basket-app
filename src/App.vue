<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import MatchForm from './components/MatchForm.vue'
import MatchesList from './components/MatchesList.vue'
import StandingsTable from './components/StandingsTable.vue'
import TeamsManager from './components/TeamsManager.vue'

type AppTab = 'standings' | 'matches' | 'teams'

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

onMounted(() => {
  const savedTab = localStorage.getItem('liga-basket-active-tab') as AppTab | null

  if (
      savedTab === 'standings' ||
      savedTab === 'matches' ||
      savedTab === 'teams'
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

          <h1 class="display-6 fw-bold mb-2">Liga de Basket</h1>

          <p class="text-muted mb-0 col-lg-8">
            Administra equipos, registra resultados y consulta la tabla de posiciones
            en una sola app.
          </p>
        </div>
      </div>
    </header>

    <nav class="mb-4">
      <div class="nav nav-pills gap-2">
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
      </div>
    </nav>

    <section v-if="activeTab === 'standings'" class="row g-4">
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

    <section v-else class="row g-4">
      <div class="col-12 col-lg-8 col-xl-6">
        <TeamsManager @teams-changed="handleTeamsChanged" />
      </div>
    </section>
  </main>
</template>
