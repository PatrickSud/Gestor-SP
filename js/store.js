/**
 * State Management using Pub/Sub pattern
 */

class Store {
  constructor() {
    this.state = {
      currentProfileId: 'default',
      profiles: {
        default: {
          name: 'Principal',
          data: this.getInitialData()
        }
      },
      portfolio: [],
      selectedWeeks: [],
      inputs: {},
      results: {
        netProfit: 0,
        totalWithdrawn: 0,
        finalBalance: 0,
        nextWithdraw: 0,
        nextWithdrawDate: '-',
        roi: 0,
        graphData: [] // For Chart.js
      },
      dailyData: {},
      lastCalculationTime: Date.now()
    }

    this.listeners = []
    this.loadFromStorage()
  }

  getInitialData() {
    const today = new Date().toISOString().split('T')[0]
    return {
      inputs: {
        dataInicio: today,
        withdrawalDaySelect: '1',
        viewPeriodSelect: '30',
        personalWalletStart: '0',
        revenueWalletStart: '0',
        monthlyExtraIncome: '0',
        monthlyIncomeToggle: false,
        fixedIncomes: [],
        taskLevel: '0',
        taskDailyValue: '0',
        withdrawStrategy: 'none',
        withdrawTarget: '0',
        futureToggle: 'false',
        capitalInicial: '50',
        simStartDate: new Date().toISOString().split('T')[0],
        diasCiclo: '3',
        taxaDiaria: '1.2',
        repeticoesCiclo: '1',
        bonusTier1: '3',
        minTier1: '50',
        limitTier1: '99',
        bonusTier2: '6',
        commitBaseName: ''
      },
      portfolio: [],
      selectedWeeks: [],
      goals: [],
      realizedWithdrawals: []
    }
  }

  // --- Subscription Logic ---
  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state))
  }

  // --- State Mutations ---
  setState(newState) {
    this.state = { ...this.state, ...newState }
    this.saveToStorage()
    this.notify()
  }

  updateInput(id, value) {
    this.state.inputs[id] = value
    this.saveToStorage()
    this.notify()
  }

  setResults(results) {
    this.state.results = { ...this.state.results, ...results }
    // Não chamamos notify() aqui para evitar loop infinito com o runCalculation
  }

  setDailyData(data) {
    this.state.dailyData = data
  }

  // --- Profile Management ---
  switchProfile(id) {
    if (!this.state.profiles[id]) return

    // Save current profile data before switching
    this.state.profiles[this.state.currentProfileId].data = {
      inputs: { ...this.state.inputs },
      portfolio: [...this.state.portfolio],
      selectedWeeks: [...this.state.selectedWeeks],
      goals: [...(this.state.goals || [])],
      realizedWithdrawals: [...(this.state.realizedWithdrawals || [])]
    }

    this.state.currentProfileId = id
    const profile = this.state.profiles[id].data

    this.state.inputs = { ...profile.inputs }
    this.state.portfolio = [...profile.portfolio]
    this.state.selectedWeeks = [...profile.selectedWeeks]
    this.state.goals = [...(profile.goals || [])]
    this.state.realizedWithdrawals = [...(profile.realizedWithdrawals || [])]

    this.saveToStorage()
    this.notify()
  }

  addProfile(name) {
    const id = 'prof_' + Date.now()
    this.state.profiles[id] = {
      name: name,
      data: this.getInitialData()
    }
    this.switchProfile(id)
  }

  deleteProfile(id) {
    if (Object.keys(this.state.profiles).length <= 1) return false

    const wasCurrent = this.state.currentProfileId === id
    delete this.state.profiles[id]

    if (wasCurrent) {
      this.switchProfile(Object.keys(this.state.profiles)[0])
    } else {
      this.saveToStorage()
      this.notify()
    }
    return true
  }

  // --- Persistence & Backup ---
  saveToStorage() {
    // Sync current state into profiles object
    this.state.profiles[this.state.currentProfileId].data = {
      inputs: this.state.inputs,
      portfolio: this.state.portfolio,
      selectedWeeks: this.state.selectedWeeks,
      goals: this.state.goals || [],
      realizedWithdrawals: this.state.realizedWithdrawals || []
    }

    const dataToSave = {
      currentProfileId: this.state.currentProfileId,
      profiles: this.state.profiles
    }
    localStorage.setItem('gestor_sp_profiles', JSON.stringify(dataToSave))

    // Notify persistence listener if exists (for cloud sync)
    if (this.onPersistenceUpdate) {
      this.onPersistenceUpdate(dataToSave)
    }
  }

  getDataForPersistence() {
    this.state.profiles[this.state.currentProfileId].data = {
      inputs: this.state.inputs,
      portfolio: this.state.portfolio,
      selectedWeeks: this.state.selectedWeeks,
      goals: this.state.goals || [],
      realizedWithdrawals: this.state.realizedWithdrawals || []
    }
    return {
      currentProfileId: this.state.currentProfileId,
      profiles: this.state.profiles
    }
  }

  loadFromPersistence(data) {
    const migrated = this.migrateData(data)
    if (!migrated || !migrated.profiles) return

    this.state.currentProfileId = migrated.currentProfileId
    this.state.profiles = migrated.profiles

    const current = this.state.profiles[this.state.currentProfileId].data
    this.state.inputs = { ...current.inputs }
    this.state.portfolio = [...current.portfolio]
    this.state.selectedWeeks = [...current.selectedWeeks]
    this.state.goals = [...(current.goals || [])]
    this.state.realizedWithdrawals = [...(current.realizedWithdrawals || [])]

    this.saveToStorage() // Update local storage too
    this.notify()
  }

  migrateData(data) {
    if (!data || !data.profiles) return data

    Object.keys(data.profiles).forEach(id => {
      const profileData = data.profiles[id].data
      if (profileData && profileData.inputs) {
        // If old variable exists and new ones don't or are '0'
        if (
          profileData.inputs.currentWalletBalance !== undefined &&
          profileData.inputs.personalWalletStart === undefined
        ) {
          profileData.inputs.personalWalletStart =
            profileData.inputs.currentWalletBalance
          profileData.inputs.revenueWalletStart = '0'
          // Clean up old variable
          delete profileData.inputs.currentWalletBalance
        }
      }
    })
    return data
  }

  setPersistenceCallback(callback) {
    this.onPersistenceUpdate = callback
  }

  loadFromStorage() {
    const saved = localStorage.getItem('gestor_sp_profiles')
    if (saved) {
      const parsed = this.migrateData(JSON.parse(saved))
      this.state.currentProfileId = parsed.currentProfileId
      this.state.profiles = parsed.profiles

      const current = this.state.profiles[this.state.currentProfileId].data
      this.state.inputs = { ...current.inputs }
      this.state.portfolio = [...current.portfolio]
      this.state.selectedWeeks = [...current.selectedWeeks]
      this.state.goals = [...(current.goals || [])]
      this.state.realizedWithdrawals = [...(current.realizedWithdrawals || [])]
    } else {
      this.state.inputs = this.getInitialData().inputs
      this.state.goals = []
      this.state.realizedWithdrawals = []
    }
  }

  exportAllData() {
    const data = {
      currentProfileId: this.state.currentProfileId,
      profiles: this.state.profiles,
      exportDate: new Date().toISOString(),
      version: '2.0'
    }
    return JSON.stringify(data, null, 2)
  }

  importAllData(jsonString) {
    try {
      const parsed = this.migrateData(JSON.parse(jsonString))
      if (!parsed.profiles || !parsed.currentProfileId)
        throw new Error('Formato inválido')

      this.state.profiles = parsed.profiles
      this.state.currentProfileId = parsed.currentProfileId

      // Reload current profile
      const current = this.state.profiles[this.state.currentProfileId].data
      this.state.inputs = { ...current.inputs }
      this.state.portfolio = [...current.portfolio]
      this.state.selectedWeeks = [...current.selectedWeeks]
      this.state.goals = [...(current.goals || [])]

      this.saveToStorage()
      this.notify()
      return true
    } catch (e) {
      console.error('Import error:', e)
      return false
    }
  }
}

export const store = new Store()
