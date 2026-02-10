import { Formatter } from './utils/formatter.js'

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
    const today = Formatter.getTodayDate()
    return {
      inputs: {
        dataInicio: today,
        withdrawalDaySelect: '1',
        viewPeriodSelect: '30',
        customViewStartDate: today,
        customViewEndDate: Formatter.addDays(today, 30),
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
        simStartDate: Formatter.getTodayDate(),
        diasCiclo: '3',
        taxaDiaria: '1.2',
        repeticoesCiclo: '1',
        bonusTier1: '3',
        minTier1: '50',
        limitTier1: '99',
        bonusTier2: '6',
        commitBaseName: '',
        geminiApiKey: '',
        openaiApiKey: '',
        groqApiKey: '',
        groqModel: 'qwen-qwq-32b',
        aiProvider: 'gemini',
        syncAiKeys: false,
        teamCounts: {
          'S1': { A: 0, B: 0, C: 0 },
          'S2': { A: 0, B: 0, C: 0 },
          'M1': { A: 0, B: 0, C: 0 },
          'M2': { A: 0, B: 0, C: 0 },
          'M3': { A: 0, B: 0, C: 0 },
          'L1': { A: 0, B: 0, C: 0 },
          'L2': { A: 0, B: 0, C: 0 },
          'L3': { A: 0, B: 0, C: 0 },
          'L4': { A: 0, B: 0, C: 0 },
          'L5': { A: 0, B: 0, C: 0 }
        }
      },
      portfolio: [],
      selectedWeeks: [],
      goals: [],
      realizedWithdrawals: [],
      manualAdjustments: [],
      dismissedNotifications: []
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
      realizedWithdrawals: [...(this.state.realizedWithdrawals || [])],
      manualAdjustments: [...(this.state.manualAdjustments || [])],
      dismissedNotifications: [...(this.state.dismissedNotifications || [])]
    }

    this.state.currentProfileId = id
    const profile = this.state.profiles[id].data
    const defaults = this.getInitialData().inputs

    this.state.inputs = { ...defaults, ...profile.inputs }
    this.state.portfolio = [...profile.portfolio]
    this.state.selectedWeeks = [...profile.selectedWeeks]
    this.state.goals = [...(profile.goals || [])]
    this.state.realizedWithdrawals = [...(profile.realizedWithdrawals || [])]
    this.state.manualAdjustments = [...(profile.manualAdjustments || [])]
    this.state.dismissedNotifications = [...(profile.dismissedNotifications || [])]

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
      realizedWithdrawals: this.state.realizedWithdrawals || [],
      manualAdjustments: this.state.manualAdjustments || [],
      dismissedNotifications: this.state.dismissedNotifications || []
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
    // Sync current state into the current profile first
    this.state.profiles[this.state.currentProfileId].data = {
      inputs: { ...this.state.inputs },
      portfolio: [...this.state.portfolio],
      selectedWeeks: [...this.state.selectedWeeks],
      goals: [...(this.state.goals || [])],
      realizedWithdrawals: [...(this.state.realizedWithdrawals || [])],
      manualAdjustments: [...(this.state.manualAdjustments || [])],
      dismissedNotifications: [...(this.state.dismissedNotifications || [])]
    }

    // Create a deep copy for cloud persistence to avoid side effects
    const cloudProfiles = JSON.parse(JSON.stringify(this.state.profiles))
    
    // Check if we should sync AI keys
    const shouldSync = this.state.inputs.syncAiKeys === true

    if (!shouldSync) {
      // Remove AI keys from ALL profiles
      Object.keys(cloudProfiles).forEach(id => {
        const profileInputs = cloudProfiles[id].data?.inputs
        if (profileInputs) {
          delete profileInputs.geminiApiKey
          delete profileInputs.openaiApiKey
          delete profileInputs.groqApiKey
        }
      })
    }

    return {
      currentProfileId: this.state.currentProfileId,
      profiles: cloudProfiles
    }
  }

  loadFromPersistence(data) {
    const { data: migratedData, migrated } = this.migrateData(data)
    if (!migratedData || !migratedData.profiles) return

    // Preserve local AI keys just in case cloud data doesn't have them (sanitization)
    const localGeminiKey = this.state.inputs.geminiApiKey
    const localOpenaiKey = this.state.inputs.openaiApiKey
    const localGroqKey = this.state.inputs.groqApiKey

    this.state.currentProfileId = migratedData.currentProfileId
    this.state.profiles = migratedData.profiles

    const current = this.state.profiles[this.state.currentProfileId].data
    const defaults = this.getInitialData().inputs
    
    this.state.inputs = { ...defaults, ...current.inputs }

    // If cloud data didn't have the keys, restore local ones
    if (this.state.inputs.geminiApiKey === undefined && localGeminiKey) {
      this.state.inputs.geminiApiKey = localGeminiKey
    }
    if (this.state.inputs.openaiApiKey === undefined && localOpenaiKey) {
      this.state.inputs.openaiApiKey = localOpenaiKey
    }
    if (this.state.inputs.groqApiKey === undefined && localGroqKey) {
      this.state.inputs.groqApiKey = localGroqKey
    }

    this.state.portfolio = [...current.portfolio]
    this.state.selectedWeeks = [...current.selectedWeeks]
    this.state.goals = [...(current.goals || [])]
    this.state.realizedWithdrawals = [...(current.realizedWithdrawals || [])]
    this.state.manualAdjustments = [...(current.manualAdjustments || [])]
    this.state.dismissedNotifications = [...(current.dismissedNotifications || [])]

    this.saveToStorage() // Update local storage too
    this.notify()
  }

  migrateData(data) {
    if (!data || !data.profiles) return { data, migrated: false }
    let migrated = false

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
          migrated = true
        }
      }
    })

    if (migrated) {
      console.log('Dados migrados para estrutura de carteira dupla.')
    }
    return { data, migrated }
  }

  setPersistenceCallback(callback) {
    this.onPersistenceUpdate = callback
  }

  loadFromStorage() {
    const saved = localStorage.getItem('gestor_sp_profiles')
    if (saved) {
      const { data: parsed, migrated } = this.migrateData(JSON.parse(saved))
      this.state.currentProfileId = parsed.currentProfileId
      this.state.profiles = parsed.profiles

      const current = this.state.profiles[this.state.currentProfileId].data
      const defaults = this.getInitialData().inputs
      this.state.inputs = { ...defaults, ...current.inputs }
      this.state.portfolio = [...current.portfolio]
      this.state.selectedWeeks = [...current.selectedWeeks]
      this.state.goals = [...(current.goals || [])]
      this.state.realizedWithdrawals = [...(current.realizedWithdrawals || [])]
      this.state.manualAdjustments = [...(current.manualAdjustments || [])]
      this.state.dismissedNotifications = [...(current.dismissedNotifications || [])]

      if (migrated) {
        this.saveToStorage() // Persist migration immediately
      }
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
      const { data: parsed, migrated } = this.migrateData(
        JSON.parse(jsonString)
      )
      if (!parsed.profiles || !parsed.currentProfileId)
        throw new Error('Formato inválido')

      this.state.profiles = parsed.profiles
      this.state.currentProfileId = parsed.currentProfileId

      // Reload current profile
      const current = this.state.profiles[this.state.currentProfileId].data
      const defaults = this.getInitialData().inputs
      this.state.inputs = { ...defaults, ...current.inputs }
      this.state.portfolio = [...current.portfolio]
      this.state.selectedWeeks = [...current.selectedWeeks]
      this.state.goals = [...(current.goals || [])]
      this.state.realizedWithdrawals = [...(current.realizedWithdrawals || [])]
      this.state.manualAdjustments = [...(current.manualAdjustments || [])]
      this.state.dismissedNotifications = [...(current.dismissedNotifications || [])]

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
