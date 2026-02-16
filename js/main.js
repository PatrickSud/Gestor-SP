import { store } from './store.js'
import { Formatter } from './utils/formatter.js'
import { Calculator } from './core/calculator.js'
import { Renderer } from './ui/render.js'
import { ChartManager } from './ui/chart.js'
import { authService } from './auth-service.js'
import { Exporter } from './utils/exporter.js'
import { aiService } from './ai-service.js'
import { NotificationManager } from './utils/notification-manager.js'

/**
 * Main Application Controller
 */

class App {
  constructor() {
    this.insightsTimer = null
    this.onboardingStep = 0
    this.init()
  }

  init() {
    // Global access for onclick handlers in HTML (temporary until fully migrated)
    window.app = this

    try {
      // Initialize UI State from Store
      this.applyStoreToUI()

      // Initial Calculation
      this.runCalculation()

      // Subscribe to store changes
      store.subscribe(state => {
        this.runCalculation(false) // Run without saving to avoid infinite loops
        this.updateUIPieces(state)
      })

      // Set up event listeners
      this.setupEventListeners()

      // Orientation handling (mobile landscape)
      this.setupOrientationMode()

      // Check notification permission
      this.checkNotificationPermission()

      // Initialize AI Assistant visibility
      this.updateAiButtonVisibility()

      // Load proactive insights
      this.loadInsights()

      // Trigger Onboarding if not completed
      if (!store.state.inputs.setupCompleted) {
        this.openOnboarding()
      }

      Renderer.toast('Sistema inicializado com sucesso', 'success')
    } catch (error) {
      console.error('Erro na inicialização do App:', error)
      Renderer.toast(
        'Erro ao carregar dados. Tente redefinir as configurações se o problema persistir.',
        'error'
      )
    }
  }

  // --- Core Logic ---
  runCalculation(save = true) {
    const results = Calculator.calculate(
      store.state.inputs,
      store.state.portfolio,
      store.state.selectedWeeks,
      store.state.realizedWithdrawals,
      store.state.manualAdjustments
    )

    if (results) {
      store.setResults(results.results)
      store.setDailyData(results.dailyData)

      // Determine View Start Date
      let viewStartDate = Formatter.getTodayDate()
      let viewDays = parseInt(store.state.inputs.viewPeriodSelect)

      if (store.state.inputs.viewPeriodSelect === 'custom') {
        const start =
          store.state.inputs.customViewStartDate || Formatter.getTodayDate()
        const end = store.state.inputs.customViewEndDate
        viewStartDate = start
        if (end) {
          viewDays = Formatter.daysBetween(start, end)
          if (viewDays < 1) viewDays = 1
        }
      } else if (store.state.inputs.viewPeriodSelect === 'month') {
        const today = Formatter.getTodayDate()
        const [y, m] = today.split('-').map(Number)
        const start = `${y}-${String(m).padStart(2, '0')}-01`
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
        const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        viewStartDate = start
        viewDays = Formatter.daysBetween(start, end)
        if (viewDays < 1) viewDays = 1
      }

      // Update UI components
      Renderer.renderResults(results.results)
      Renderer.renderTodayClosing(results.dailyData)
      Renderer.renderTable(results.dailyData, viewDays, viewStartDate)
      Renderer.renderCalendar(
        viewStartDate,
        results.dailyData,
        results.cycleEnds
      )
      // Optional: Render Timeline if container exists
      Renderer.renderTimeline(results.dailyData, viewDays, viewStartDate)

      Renderer.renderPortfolio(store.state.portfolio, id =>
        this.removeInvestment(id)
      )

      // Sync strategy buttons
      Renderer.renderWithdrawButtons(val => {
        store.updateInput('withdrawTarget', val)
        this.runCalculation()
      }, store.state.inputs.withdrawTarget)

      // Update Chart
      ChartManager.renderBalanceChart('balanceChart', results.results.graphData)

      // Goals & Icons
      Renderer.renderGoals(store.state.goals, results.dailyData, idx =>
        this.removeGoal(idx)
      )

      Renderer.renderSimulationSummary(
        results.results,
        store.state.inputs,
        results.cycleEnds
      )

      // Local Notification for Withdrawal Day
      this.checkWithdrawalNotification(results.results)

      // Refresh proactive insights (debounced to avoid API rate limits)
      clearTimeout(this.insightsTimer)
      this.insightsTimer = setTimeout(() => {
        this.loadInsights()
      }, 2000)

      this.updatePromotionDisplay()

      if (save) store.saveToStorage()
    }
  }

  // --- UI Event Handlers ---
  setupEventListeners() {
    // Generic Input Handler
    document.querySelectorAll('input, select').forEach(el => {
      if (!el.id) return

      // Skip fields that shouldn't auto-calculate or are handled specifically
      const skip = [
        'newInv',
        'newProfile',
        'editCurrentProfile',
        'commit',
        'search'
      ]
      if (skip.some(s => el.id.startsWith(s)) || el.type === 'file') return

      el.addEventListener('change', e => {
        const val =
          e.target.type === 'checkbox' ? e.target.checked : e.target.value
        store.updateInput(el.id, val)

        // Specific UI toggles
        if (el.id === 'taskLevel') {
          if (val === 'custom') {
            document
              .getElementById('customTaskInput')
              .classList.remove('hidden')
          } else {
            document.getElementById('customTaskInput').classList.add('hidden')
            document.getElementById('taskDailyValue').value = val
            store.updateInput('taskDailyValue', val)
          }
        }

        if (
          el.id === 'monthlyIncomeToggle' ||
          el.id === 'promotionToggle' ||
          el.id === 'teamBonusToggle' ||
          el.id === 'aiAssistantToggle'
        ) {
          const containerMap = {
            monthlyIncomeToggle: 'monthlyIncomeContainer',
            promotionToggle: 'promotionContainer',
            teamBonusToggle: 'teamBonusContainer',
            aiAssistantToggle: 'aiSettingsContainer'
          }
          const container = document.getElementById(containerMap[el.id])
          if (container) container.classList.toggle('hidden', !val)

          const btnMap = {
            monthlyIncomeToggle: 'toggleMonthlyIncome',
            promotionToggle: 'togglePromotion',
            teamBonusToggle: 'toggleTeamBonus',
            aiAssistantToggle: 'toggleAiSettings'
          }
          const btn = document.getElementById(btnMap[el.id])
          if (btn) {
            btn.innerHTML = val
              ? `Recolher <i class="fas fa-chevron-down ml-1 transition-transform rotate-180"></i>`
              : `Expandir <i class="fas fa-chevron-down ml-1 transition-transform"></i>`
          }

          if (el.id === 'aiAssistantToggle') {
            this.updateAiButtonVisibility()
          } else {
            this.runCalculation()
          }
        }

        if (el.id === 'withdrawStrategy') {
          document
            .getElementById('withdrawFixedOptions')
            .classList.toggle('hidden', val !== 'fixed')
          document
            .getElementById('withdrawWeeklyOptions')
            .classList.toggle('hidden', val !== 'weekly')
        }

        if (el.id === 'viewPeriodSelect') {
          const isCustom = val === 'custom'
          const customRange = document.getElementById('customDateRange')
          if (customRange) {
            if (isCustom) {
              customRange.classList.remove('hidden')
              customRange.classList.add('flex')
            } else {
              customRange.classList.add('hidden')
              customRange.classList.remove('flex')
            }
          }
        }

        if (el.id === 'bonusTier3Toggle' || el.id === 'limitTier1') {
          this.updateBonusTierUI()
        }

        this.runCalculation() // Force immediate calculation on change
      })
    })

    // Investment Add Handler
    document.getElementById('addInvBtn').onclick = () => this.addInvestment()

    // Monthly Fixed Income Add Handler
    const addIncomeBtn = document.getElementById('addMonthlyIncomeBtn')
    if (addIncomeBtn) {
      addIncomeBtn.onclick = () => {
        const amount = document.getElementById('monthlyIncomeAmount').value
        const day = parseInt(document.getElementById('monthlyIncomeDay').value)
        if (!amount || isNaN(day) || day < 1 || day > 31) {
          return Renderer.toast(
            'Informe o valor e um dia entre 1 e 31',
            'error'
          )
        }
        const current = store.state.inputs.fixedIncomes || []
        store.updateInput('fixedIncomes', [...current, { amount, day }])
        document.getElementById('monthlyIncomeAmount').value = ''
        document.getElementById('monthlyIncomeDay').value = ''
        Renderer.renderFixedIncomes(store.state.inputs)
        this.runCalculation()
      }
    }
    // Backup Import Handler
    const importInp = document.getElementById('importFile')
    if (importInp) {
      importInp.onchange = e => this.importBackup(e.target.files[0])
    }

    // AI API Key & Provider Handlers
    const geminiKeyInp = document.getElementById('geminiApiKey')
    const openaiKeyInp = document.getElementById('openaiApiKey')
    const providerSelect = document.getElementById('aiProvider')

    const groqKeyInp = document.getElementById('groqApiKey')
    const groqModelInp = document.getElementById('groqModel')

    if (geminiKeyInp) {
      geminiKeyInp.addEventListener('change', e => {
        store.updateInput('geminiApiKey', e.target.value)
        aiService.clearHistory()
        this.updateAiButtonVisibility()
        if (e.target.value.trim())
          Renderer.toast('API Key do Gemini salva', 'success')
      })
    }

    if (openaiKeyInp) {
      openaiKeyInp.addEventListener('change', e => {
        store.updateInput('openaiApiKey', e.target.value)
        aiService.clearHistory()
        this.updateAiButtonVisibility()
        if (e.target.value.trim())
          Renderer.toast('API Key da OpenAI salva', 'success')
      })
    }

    if (groqKeyInp) {
      groqKeyInp.addEventListener('change', e => {
        store.updateInput('groqApiKey', e.target.value)
        aiService.clearHistory()
        this.updateAiButtonVisibility()
        if (e.target.value.trim())
          Renderer.toast('API Key da Groq salva', 'success')
      })
    }

    if (groqModelInp) {
      groqModelInp.addEventListener('change', e => {
        store.updateInput('groqModel', e.target.value)
        Renderer.toast(
          `Modelo alterado para ${e.target.options[e.target.selectedIndex].text}`,
          'info'
        )
      })
    }

    if (providerSelect) {
      providerSelect.addEventListener('change', e => {
        const val = e.target.value
        store.updateInput('aiProvider', val)

        // Limpar histórico ao trocar de provedor para evitar conflitos de formato
        aiService.clearHistory()

        // Toggle visibility of config sections
        document
          .getElementById('geminiConfig')
          ?.classList.toggle('hidden', val !== 'gemini')
        document
          .getElementById('openaiConfig')
          ?.classList.toggle('hidden', val !== 'openai')
        document
          .getElementById('groqConfig')
          ?.classList.toggle('hidden', val !== 'groq')

        this.updateAiButtonVisibility()
      })
    }

    const testAiBtn = document.getElementById('testAiBtn')
    if (testAiBtn) {
      testAiBtn.addEventListener('click', () => this.testAiConnection())
    }

    const syncKeysInp = document.getElementById('syncAiKeys')
    if (syncKeysInp) {
      syncKeysInp.addEventListener('change', e => {
        store.updateInput('syncAiKeys', e.target.checked)
        if (e.target.checked) {
          Renderer.toast('Sincronização em nuvem ativada!', 'success')
        } else {
          Renderer.toast('As chaves agora são apenas locais', 'info')
        }
      })
    }

    // Monthly Fixed Income Handlers
    const toggleMonthlyBtn = document.getElementById('toggleMonthlyIncome')
    if (toggleMonthlyBtn) {
      toggleMonthlyBtn.onclick = () => {
        const container = document.getElementById('monthlyIncomeContainer')
        const chevron = document.getElementById('monthlyIncomeChevron')
        const isHidden = container.classList.contains('hidden')
        container.classList.toggle('hidden')

        if (chevron) {
          chevron.classList.toggle('rotate-180', !isHidden)
        }

        toggleMonthlyBtn.innerHTML = isHidden
          ? `Recolher <i class="fas fa-chevron-down ml-1 transition-transform rotate-180" id="monthlyIncomeChevron"></i>`
          : `Expandir <i class="fas fa-chevron-down ml-1 transition-transform" id="monthlyIncomeChevron"></i>`
      }
    }

    // Team Bonus Handlers
    const toggleTeamBtn = document.getElementById('toggleTeamBonus')
    if (toggleTeamBtn) {
      toggleTeamBtn.onclick = () => {
        const container = document.getElementById('teamBonusContainer')
        const isHidden = container.classList.contains('hidden')
        container.classList.toggle('hidden')

        toggleTeamBtn.innerHTML = isHidden
          ? `Recolher <i class="fas fa-chevron-down ml-1 transition-transform rotate-180"></i>`
          : `Expandir <i class="fas fa-chevron-down ml-1 transition-transform"></i>`
      }
    }

    // Promotion Handlers

    const togglePromoBtn = document.getElementById('togglePromotion')
    if (togglePromoBtn) {
      togglePromoBtn.onclick = () => {
        const container = document.getElementById('promotionContainer')
        const chevron = document.getElementById('promotionChevron')
        const isHidden = container.classList.contains('hidden')
        container.classList.toggle('hidden')

        if (chevron) {
          chevron.classList.toggle('rotate-180', !isHidden)
        }

        togglePromoBtn.innerHTML = isHidden
          ? `Recolher <i class="fas fa-chevron-down ml-1 transition-transform rotate-180" id="promotionChevron"></i>`
          : `Expandir <i class="fas fa-chevron-down ml-1 transition-transform" id="promotionChevron"></i>`
      }
    }

    const toggleAiBtn = document.getElementById('toggleAiSettings')
    if (toggleAiBtn) {
      toggleAiBtn.onclick = () => {
        const container = document.getElementById('aiSettingsContainer')
        const chevron = document.getElementById('aiChevron')
        const isHidden = container.classList.contains('hidden')
        container.classList.toggle('hidden')

        if (chevron) {
          chevron.classList.toggle('rotate-180', !isHidden)
        }

        toggleAiBtn.innerHTML = isHidden
          ? `Recolher <i class="fas fa-chevron-down ml-1 transition-transform rotate-180" id="aiChevron"></i>`
          : `Expandir <i class="fas fa-chevron-down ml-1 transition-transform" id="aiChevron"></i>`
      }
    }

    document.querySelectorAll('.team-input').forEach(el => {
      el.addEventListener('input', e => {
        const level = e.target.getAttribute('data-level')
        const team = e.target.getAttribute('data-team')
        const val = parseInt(e.target.value) || 0

        const teamCounts = { ...(store.state.inputs.teamCounts || {}) }
        if (!teamCounts[level]) teamCounts[level] = { A: 0, B: 0, C: 0 }
        teamCounts[level][team] = val

        store.updateInput('teamCounts', teamCounts)
        this.updateTeamDailyIncome()
        this.runCalculation()
      })
    })
  }

  // --- Orientation Mode ---
  setupOrientationMode() {
    const btn = document.getElementById('orientationToggleBtn')
    if (!btn) return

    let isLandscape = document.body.classList.contains('landscape-mode')

    const isMobile = () =>
      window.innerWidth <= 768 ||
      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '')

    const updateButtonState = () => {
      if (!isMobile()) {
        btn.classList.add('hidden')
        document.body.classList.remove('landscape-mode')
        isLandscape = false
        return
      }

      btn.classList.remove('hidden')
      btn.innerHTML = isLandscape
        ? '<i class="fas fa-compress text-xs mr-1"></i><span>Modo padrão</span>'
        : '<i class="fas fa-expand-arrows-alt text-xs mr-1"></i><span>Modo horizontal</span>'
    }

    btn.addEventListener('click', () => {
      isLandscape = !isLandscape
      document.body.classList.toggle('landscape-mode', isLandscape)
      updateButtonState()
    })

    window.addEventListener('resize', updateButtonState)
    updateButtonState()
  }

  // --- Push Notification Methods ---
  checkNotificationPermission() {
    const btn = document.getElementById('pushNotificationBtn')
    if (!btn) return

    if (Notification.permission === 'granted') {
      btn.classList.add('hidden')
    } else {
      btn.classList.remove('hidden')
    }
  }

  async requestNotificationPermission() {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        const btn = document.getElementById('pushNotificationBtn')
        if (btn) btn.classList.add('hidden')
        Renderer.toast('Notificações ativadas com sucesso!', 'success')
      } else {
        Renderer.toast('Permissão de notificação negada.', 'warning')
      }
    } catch (error) {
      console.error('Erro ao pedir permissão:', error)
      Renderer.toast('Erro ao configurar notificações.', 'error')
    }
  }

  checkWithdrawalNotification(results) {
    if (Notification.permission !== 'granted' || !results.nextWithdrawDate)
      return

    const today = Formatter.getTodayDate()
    if (results.nextWithdrawDate === today) {
      // Check if we already notified today to avoid spam
      const lastNotify = localStorage.getItem('lastWithdrawNotify')
      if (lastNotify !== today) {
        new Notification('💰 Gestor SP: Dia de Saque!', {
          body: `Hoje é dia de saque estimado de ${Formatter.currency(results.nextWithdraw)}. Acesse o app para confirmar!`,
          icon: 'assets/icons/icon-192x192.png'
        })
        localStorage.setItem('lastWithdrawNotify', today)
      }
    }
  }

  applyStoreToUI() {
    const { inputs } = store.state
    for (const [id, value] of Object.entries(inputs)) {
      const el = document.getElementById(id)
      if (!el) continue

      if (el.type === 'checkbox') el.checked = value
      else if (el.type !== 'file') el.value = value
    }

    // Restore Toggle Switch States (Containers stay hidden by default as per HTML)
    this.updateAiButtonVisibility()

    document
      .getElementById('customTaskInput')
      .classList.toggle('hidden', inputs.taskLevel !== 'custom')
    document
      .getElementById('withdrawFixedOptions')
      .classList.toggle('hidden', inputs.withdrawStrategy !== 'fixed')
    document
      .getElementById('withdrawWeeklyOptions')
      .classList.toggle('hidden', inputs.withdrawStrategy !== 'weekly')

    // Restore Custom View Period Toggle
    const customRange = document.getElementById('customDateRange')
    if (customRange) {
      const isCustom = inputs.viewPeriodSelect === 'custom'
      if (isCustom) {
        customRange.classList.remove('hidden')
        customRange.classList.add('flex')
      } else {
        customRange.classList.add('hidden')
        customRange.classList.remove('flex')
      }
    }

    // Restore AI Provider visibility
    const provider = inputs.aiProvider || 'gemini'
    document
      .getElementById('geminiConfig')
      ?.classList.toggle('hidden', provider !== 'gemini')
    document
      .getElementById('openaiConfig')
      ?.classList.toggle('hidden', provider !== 'openai')
    document
      .getElementById('groqConfig')
      ?.classList.toggle('hidden', provider !== 'groq')

    // Restore Future Toggle Visuals
    const futureOn = inputs.futureToggle === 'true'
    document
      .getElementById('futureConfigPanel')
      .classList.toggle('hidden', !futureOn)
    this.updateFutureToggleVisual(futureOn)
    this.updateBonusTierUI()

    const simIndicator = document.getElementById('simActiveIndicator')
    if (simIndicator) simIndicator.classList.toggle('hidden', !futureOn)

    const simContent = document.getElementById('content-simulation')
    if (simContent) {
      simContent.classList.toggle('collapsed-padding', !futureOn)
    }

    // Render Initial Pieces
    Renderer.renderFixedIncomes(inputs)
    Renderer.renderWithdrawButtons(val => {
      store.updateInput('withdrawTarget', val)
      this.runCalculation()
      Renderer.renderWithdrawButtons(null, val) // Refresh selection
    }, inputs.withdrawTarget)

    this.restoreWeeksUI()
    this.restoreTeamUI()
  }

  restoreTeamUI() {
    const isTeamActive =
      store.state.inputs.teamBonusToggle === 'true' ||
      store.state.inputs.teamBonusToggle === true
    const check = document.getElementById('teamBonusToggle')
    if (check) check.checked = isTeamActive

    const grid = document.getElementById('teamBonusGrid')
    const head = document.querySelector('#teamBonusContainer > div.grid')
    // Containers stay hidden on load as per user requirement

    const teamCounts = store.state.inputs.teamCounts || {}
    document.querySelectorAll('.team-input').forEach(el => {
      const level = el.getAttribute('data-level')
      const team = el.getAttribute('data-team')
      if (teamCounts[level] && teamCounts[level][team] !== undefined) {
        el.value = teamCounts[level][team] || ''
      }
    })
    this.updateTeamDailyIncome()
  }

  updateTeamDailyIncome() {
    const teamCounts = store.state.inputs.teamCounts || {}
    let totalDaily = 0
    Object.keys(teamCounts).forEach(level => {
      const counts = teamCounts[level]
      const rates = Calculator.TEAM_RATES[level]
      if (rates) {
        totalDaily +=
          (counts.A || 0) * (rates.A || 0) +
          (counts.B || 0) * (rates.B || 0) +
          (counts.C || 0) * (rates.C || 0)
      }
    })
    const display = document.getElementById('teamDailyIncomeDisplay')
    if (display) {
      display.innerText = Formatter.currency(
        Formatter.toCents(totalDaily.toFixed(2))
      )
    }
  }

  updatePromotionDisplay() {
    const level = store.state.inputs.promotionLevel
    const promoData = Calculator.PROMOTION_SALARIES[level]
    const display = document.getElementById('promotionMonthlyIncomeDisplay')
    if (display && promoData) {
      display.innerText = Formatter.currency(Formatter.toCents(promoData.value))
    }
  }

  updateUIPieces(state) {
    Renderer.renderProfileList(
      state.profiles,
      state.currentProfileId,
      id => this.switchProfile(id),
      id => this.deleteProfile(id)
    )

    // Refresh dynamic UI selectors
    this.restoreWeeksUI()
    Renderer.renderWithdrawButtons(val => {
      store.updateInput('withdrawTarget', val)
      this.runCalculation()
    }, state.inputs.withdrawTarget)
  }

  // --- Actions ---
  removeFixedIncome(idx) {
    const list = store.state.inputs.fixedIncomes || []
    const next = list.filter((_, i) => i !== idx)
    store.updateInput('fixedIncomes', next)
    Renderer.renderFixedIncomes(store.state.inputs)
    this.runCalculation()
  }
  addInvestment() {
    const name = document.getElementById('newInvName').value
    const val = parseFloat(document.getElementById('newInvVal').value)
    const date = document.getElementById('newInvDate').value
    const days = parseInt(document.getElementById('newInvDays').value)
    const rate = parseFloat(document.getElementById('newInvRate').value)
    const wallet = document.getElementById('newInvWallet').value

    if (!name || isNaN(val) || !date || isNaN(days) || isNaN(rate)) {
      return Renderer.toast('Preencha todos os campos do investimento', 'error')
    }

    const newInv = { id: Date.now(), name, val, date, days, rate, wallet }
    store.setState({ portfolio: [...store.state.portfolio, newInv] })

    // Clear inputs
    document.getElementById('newInvName').value = ''
    document.getElementById('newInvVal').value = ''

    Renderer.toast('Investimento adicionado')
    this.runCalculation()
  }

  removeInvestment(id) {
    store.setState({
      portfolio: store.state.portfolio.filter(p => p.id !== id)
    })
    this.runCalculation()
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('sidebarOverlay')
    const isOpen = !sidebar.classList.contains('-translate-x-full')

    if (isOpen) {
      sidebar.classList.add('-translate-x-full')
      overlay.classList.add('opacity-0')
      setTimeout(() => overlay.classList.add('hidden'), 300)
    } else {
      sidebar.classList.remove('-translate-x-full')
      overlay.classList.remove('hidden')
      setTimeout(() => overlay.classList.remove('opacity-0'), 10)
    }
  }

  switchTab(tabName) {
    const tabs = ['resources', 'simulation', 'goals']
    tabs.forEach(t => {
      const btn = document.getElementById('tab-' + t)
      const content = document.getElementById('content-' + t)
      if (!btn || !content) return
      if (t === tabName) {
        btn.className =
          'flex-1 py-3 text-xs font-bold uppercase tracking-wider text-white bg-slate-700/50 border-b-2 border-blue-500 transition-colors'
        content.classList.remove('hidden')
      } else {
        btn.className =
          'flex-1 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white border-b-2 border-transparent transition-colors'
        content.classList.add('hidden')
      }
    })

    const portfolioDetails = document.getElementById('portfolioDetails')
    const resourcesContent = document.getElementById('content-resources')
    if (resourcesContent && portfolioDetails) {
      resourcesContent.classList.toggle(
        'collapsed-padding',
        portfolioDetails.classList.contains('hidden')
      )
    }
  }

  toggleFuturePlanning() {
    const current = store.state.inputs.futureToggle === 'true'
    const newVal = !current
    store.updateInput('futureToggle', String(newVal))

    document
      .getElementById('futureConfigPanel')
      .classList.toggle('hidden', !newVal)
    this.updateFutureToggleVisual(newVal)

    const simContent = document.getElementById('content-simulation')
    if (simContent) {
      simContent.classList.toggle('collapsed-padding', !newVal)
    }

    const simIndicator = document.getElementById('simActiveIndicator')
    if (simIndicator) simIndicator.classList.toggle('hidden', !newVal)

    if (newVal) {
      const today = Formatter.getTodayDate()
      const simDateEl = document.getElementById('simStartDate')
      if (simDateEl) simDateEl.value = today
      store.updateInput('simStartDate', today)
    }

    this.updateBonusTierUI()
    this.runCalculation()
  }

  updateBonusTierUI() {
    const enabled =
      store.state.inputs.bonusTier3Toggle === 'true' ||
      store.state.inputs.bonusTier3Toggle === true

    const rangeText = document.getElementById('bonusTier2Range')
    const rangeFields = document.getElementById('bonusTier2RangeFields')
    const tier3Panel = document.getElementById('bonusTier3Panel')
    const minTier2 = document.getElementById('minTier2')
    const limitTier1 = document.getElementById('limitTier1')

    if (rangeText) rangeText.classList.toggle('hidden', enabled)
    if (rangeFields) rangeFields.classList.toggle('hidden', !enabled)
    if (tier3Panel) tier3Panel.classList.toggle('hidden', !enabled)

    if (enabled && minTier2 && limitTier1) {
      const newMin = (parseInt(limitTier1.value) || 0) + 1
      minTier2.value = newMin
      minTier2.readOnly = true
      minTier2.classList.add('text-slate-500')
      minTier2.classList.remove('text-slate-300')
      store.updateInput('minTier2', String(newMin))
    } else if (minTier2) {
      minTier2.readOnly = false
      minTier2.classList.remove('text-slate-500')
      minTier2.classList.add('text-slate-300')
    }
  }

  updateFutureToggleVisual(on) {
    const knob = document.getElementById('futureToggleKnob')
    const visual = document.getElementById('futureToggleVisual')
    if (on) {
      visual.classList.replace('bg-slate-800', 'bg-emerald-500')
      visual.classList.replace('border-slate-600', 'border-emerald-400')
      knob.classList.replace('left-1', 'left-6')
      knob.classList.replace('bg-slate-400', 'bg-white')
    } else {
      visual.classList.replace('bg-emerald-500', 'bg-slate-800')
      visual.classList.replace('border-emerald-400', 'border-slate-600')
      knob.classList.replace('left-6', 'left-1')
      knob.classList.replace('bg-white', 'bg-slate-400')
    }
  }

  togglePortfolioDetails() {
    const content = document.getElementById('portfolioDetails')
    const chevron = document.getElementById('invChevron')
    const isHidden = content.classList.contains('hidden')
    content.classList.toggle('hidden')
    chevron.classList.toggle('-rotate-90', !isHidden)

    const resourcesContent = document.getElementById('content-resources')
    if (resourcesContent) {
      resourcesContent.classList.toggle('collapsed-padding', !isHidden)
    }
  }

  adjustInput(id, delta) {
    const current = parseFloat(store.state.inputs[id]) || 0
    const newVal = Math.max(0, current + delta).toFixed(2)
    store.updateInput(id, newVal)
    this.applyStoreToUI()
    this.runCalculation()
  }

  openDayDetails(dateStr) {
    const data = store.state.dailyData[dateStr]
    if (!data)
      return Renderer.toast('Dia fora do período de simulação', 'error')

    document.getElementById('modalDate').innerText =
      Formatter.dateDisplay(dateStr)
    document.getElementById('modalStartBal').innerText = Formatter.currency(
      data.startBal
    )
    document.getElementById('modalEndBal').innerText = Formatter.currency(
      data.endBal
    )

    // Detailed Flows (New structure)
    const flowsContainer = document.getElementById('modalFlowsContainer') // Ensure this container exists in HTML or we reuse existing slots
    // Since we don't want to change HTML structure too much, we will map values to existing IDs where possible
    // But for better visual separation, we might need to inject HTML into a container if the static structure is too rigid.
    // Let's check the HTML structure of the modal first.
    // Based on previous code: modalFlowIncome, modalFlowReturns, modalFlowReinvest, modalFlowWithdraw

    // We will update the text content and color classes for existing elements to match new style

    // 1. Income (Combined or Separated?)
    // The current modal has separate fields. Let's try to use them or inject a list.
    // Given the request for consistency, let's replace the static list with a dynamic one generated here, similar to timeline.
    // We need to find the container in index.html first.
    // Wait, let's look at index.html content for 'dayModal'.

    this.renderDayModalContent(data, dateStr)
    this.openModal('dayModal')
  }

  renderDayModalContent(data, dateStr) {
    // Re-using the logic from renderTimeline to ensure consistency
    const items = []

    // Manual/Start
    // Usually startBal is just the balance, but if it's the first day and has manual value?
    // For day details, we show Start Balance as a header.
    // We focus on flows (Entradas/Saidas)

    if (data.inIncomeTeam > 0) {
      items.push({
        label: 'Bônus de Equipe',
        val: data.inIncomeTeam,
        type: 'team',
        icon: 'fa-users'
      })
    }
    if (data.inIncomeTask > 0) {
      items.push({
        label: 'Entradas (Tarefas)',
        val: data.inIncomeTask,
        type: 'task',
        icon: 'fa-check-circle'
      })
    }
    if (data.inIncomeRecurring > 0) {
      items.push({
        label: 'Entradas (Recorrentes)',
        val: data.inIncomeRecurring,
        type: 'recurring',
        icon: 'fa-calendar-check'
      })
    }
    if (data.inReturn > 0) {
      items.push({
        label: 'Retorno de Contrato',
        val: data.inReturn,
        type: 'return',
        icon: 'fa-undo'
      })
    }
    if (data.isCycleEnd) {
      items.push({
        label: 'Reinvestimento Simulado',
        val: data.outReinvest || 0,
        type: 'balance',
        icon: 'fa-sync-alt'
      })
    }

    if (data.inIncomePromotion > 0) {
      items.push({
        label: 'Benefícios de Promoção',
        val: data.inIncomePromotion,
        type: 'promotion', // styling needs to be handled
        icon: 'fa-award'
      })
    }

    // Withdrawals
    if (data.status !== 'none') {
      const isRealized = data.status === 'realized'
      const netVal = isRealized
        ? data.outWithdraw
        : data.recommendedWallet === 'personal'
          ? data.tier
          : Math.floor(data.tier * 0.9)

      items.push({
        label: isRealized ? 'Saque Realizado' : 'Saque Planejado',
        val: netVal,
        type: isRealized ? 'withdraw-realized' : 'withdraw-planned',
        icon: isRealized ? 'fa-wallet' : 'fa-clock',
        isExpense: true
      })
    }

    // Generate HTML for flows
    let flowsHtml = ''
    if (items.length === 0) {
      flowsHtml =
        '<p class="text-xs text-slate-500 italic text-center py-2">Sem movimentações neste dia.</p>'
    } else {
      items.forEach(item => {
        const colorClass = `timeline-value ${item.type}` // reusing css classes
        // Map types to text colors for the label/icon if needed, or just use white/slate
        let iconColor = 'text-slate-400'
        if (item.type === 'team') iconColor = 'text-cyan-400'
        if (item.type === 'task') iconColor = 'text-emerald-400'
        if (item.type === 'recurring') iconColor = 'text-sky-400'
        if (item.type === 'return') iconColor = 'text-purple-400'
        if (item.type === 'withdraw-planned') iconColor = 'text-yellow-400'
        if (item.type === 'withdraw-realized') iconColor = 'text-blue-400'

        const valDisplay = item.text || Formatter.currency(item.val)
        const sign =
          item.val > 0 && !item.text ? (item.isExpense ? '-' : '+') : ''

        flowsHtml += `
                <div class="flex justify-between items-center text-xs bg-slate-900/30 p-2 rounded mb-1 border border-slate-700/30">
                    <div class="flex items-center gap-2">
                        <i class="fas ${item.icon} ${iconColor}"></i>
                        <span class="text-slate-300">${item.label}</span>
                    </div>
                    <span class="font-bold ${colorClass.replace('timeline-value', '') === ' balance' ? 'text-purple-400' : ''}" style="${this.getColorStyle(item.type)}">${sign}${valDisplay}</span>
                </div>`
      })
    }

    // Inject into the modal structure.
    // We need to modify index.html to have a container for this, OR we overwrite the existing static grid.
    // Let's assume we can overwrite the 'modalFlowsGrid' div if we find it, or the specific IDs.
    // Actually, let's replace the content of the "Resumo do Dia" section.

    // Since I cannot easily change index.html and main.js in one go without potential mismatches,
    // I will target the specific IDs currently used: modalFlowIncome, modalFlowReturns, etc.
    // BUT, the user wants DIFFERENTIATION. The current HTML has:
    // - Entradas (combines all)
    // - Retornos
    // - Reinvestimentos
    // - Saques

    // To support the new detailed view, I should hide the old static grid and inject the new list.
    // I'll check if there is a container I can use.
    // If not, I'll use JS to rewrite the innerHTML of the parent container of those static elements.

    const grid = document.getElementById('modalFlowsGrid')
    if (grid) {
      grid.innerHTML = flowsHtml
      grid.classList.remove('grid', 'grid-cols-2') // Remove grid layout if we want a list
      grid.classList.add('flex', 'flex-col', 'gap-1')
    }

    // Maturing List (Keep existing logic but update style)
    const matList = document.getElementById('modalMaturingList')
    const matSec = document.getElementById('modalMaturingSection')
    if (data.maturing && data.maturing.length > 0) {
      matSec.classList.remove('hidden')
      matList.innerHTML = data.maturing
        .map(
          m => `
                  <div class="flex justify-between items-center text-[10px] border-b border-slate-700/50 py-1 last:border-0">
                      <span class="text-slate-300 truncate w-1/2">${m.name}</span>
                      <div class="text-right">
                          <span class="block text-purple-400 font-bold">+${Formatter.currency(m.total)}</span>
                          <span class="text-slate-500 text-[9px]">(Lucro: ${Formatter.currency(m.profit)})</span>
                      </div>
                  </div>`
        )
        .join('')
    } else {
      matSec.classList.add('hidden')
    }

    // Withdraw Action & Balance Info Section
    const wSec = document.getElementById('modalWithdrawSection')
    const targetDay = parseInt(store.state.inputs.withdrawalDaySelect)
    const isWithdrawalDay = Formatter.getDayOfWeek(dateStr) === targetDay
    const isRealized = data.status === 'realized'
    const hasBalance = (data.endPersonal || 0) > 0 || (data.endRevenue || 0) > 0

    if (isRealized || isWithdrawalDay || hasBalance) {
      wSec.classList.remove('hidden')

      const amountToDisplay = isRealized
        ? data.outWithdraw
        : data.recommendedWallet === 'personal'
          ? data.tier
          : Math.floor(data.tier * 0.9)

      // Only show the big withdrawal value if it's a withdrawal day or already realized
      const valEl = document.getElementById('modalWithdrawVal')
      if (isRealized || (isWithdrawalDay && data.tier > 0)) {
        valEl.innerText = Formatter.currency(amountToDisplay)
        valEl.classList.remove('hidden')
      } else {
        valEl.classList.add('hidden')
      }

      const status = document.getElementById('modalWithdrawStatus')
      if (isRealized) {
        const withdrawalIdx = (store.state.realizedWithdrawals || []).findIndex(
          w => w.date === dateStr
        )
        const withdrawal = store.state.realizedWithdrawals[withdrawalIdx]
        const walletLabel =
          withdrawal?.wallet === 'personal'
            ? 'Carteira Pessoal'
            : 'Carteira de Receita'
        status.innerHTML = `
            <div class="text-blue-400 font-bold uppercase mt-1">SAQUE CONFIRMADO</div>
            <div class="text-[9px] text-slate-500 uppercase mt-1 mb-2">Saca de: ${walletLabel}</div>
            <button onclick="app.deleteWithdrawal(${withdrawalIdx})" class="w-full bg-slate-800 hover:bg-red-900/40 text-red-400 text-[10px] font-bold py-2 rounded border border-red-900/30 transition-colors">
                <i class="fas fa-trash-alt mr-1"></i> Cancelar Saque
            </button>
        `
        status.className = ''
      } else {
        const isPlanned = data.status === 'planned'
        const isOptional =
          data.status === 'none' && isWithdrawalDay && data.tier > 0
        const isActionDay = isPlanned || isOptional

        let label = 'SALDOS EM CARTEIRA'
        let labelColor = 'text-slate-400'
        if (isPlanned) {
          label = 'SAQUE PLANEJADO'
          labelColor = 'text-emerald-500'
        } else if (isOptional) {
          label = 'SAQUE DISPONÍVEL'
          labelColor = 'text-sky-400'
        }

        const rec = data.recommendedWallet
        const walletName =
          rec === 'personal' ? 'Carteira Pessoal' : 'Carteira de Receita'
        const note = data.withdrawalNote || ''
        const isPartial = data.isPartial
        const showMetaWarning =
          isOptional && store.state.inputs.withdrawStrategy === 'fixed'

        // Reconstrução do Saldo Anterior (Exibir disponível antes do saque)
        const displayPersonal =
          data.endPersonal + (data.outWithdrawPersonal || 0)
        const displayRevenue = data.endRevenue + (data.outWithdrawRevenue || 0)

        status.innerHTML = `
                      <div class="flex flex-col items-center justify-center gap-1 mt-1">
                        <div class="flex items-center gap-2">
                          <div class="${labelColor} font-bold uppercase">${label}</div>
                          ${isPartial ? '<span class="bg-amber-500/20 text-amber-500 text-[8px] px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 font-bold animate-pulse"><i class="fas fa-exclamation-triangle"></i> META PARCIAL</span>' : ''}
                          ${showMetaWarning ? '<span class="bg-slate-700 text-slate-300 text-[8px] px-1.5 py-0.5 rounded border border-slate-600 flex items-center gap-1 font-bold"><i class="fas fa-info-circle"></i> META NÃO ATINGIDA</span>' : ''}
                        </div>
                        ${isActionDay ? `<div class="text-[9px] text-slate-500 uppercase">Fonte Projetada: ${walletName} ${isOptional ? '(Opcional)' : ''}</div>` : ''}
                        ${note && isActionDay ? `<div class="text-[8px] text-slate-400 italic mt-1">"${note}"</div>` : ''}
                      </div>

                      <div class="grid grid-cols-2 gap-2 mt-3 mb-3">
                        <div class="bg-slate-900/80 p-2 rounded border ${isActionDay && rec === 'personal' ? 'border-indigo-500' : 'border-slate-700'} relative">
                            <span class="text-[8px] text-slate-500 block">PESSOAL</span>
                            <span class="text-[10px] font-bold text-white">${Formatter.currency(displayPersonal)}</span>
                            ${isActionDay && rec === 'personal' ? `<span class="absolute -top-2 -right-1 ${isPlanned ? 'bg-indigo-600' : 'bg-slate-600'} text-[7px] px-1 rounded text-white font-bold">${isPlanned ? 'SUGERIDO' : 'MELHOR OPÇÃO'}</span>` : ''}
                        </div>
                        <div class="bg-slate-900/80 p-2 rounded border ${isActionDay && rec === 'revenue' ? 'border-emerald-500' : 'border-slate-700'} relative">
                            <span class="text-[8px] text-slate-500 block">RECEITA</span>
                            <span class="text-[10px] font-bold text-white">${Formatter.currency(displayRevenue)}</span>
                            ${isActionDay && rec === 'revenue' ? `<span class="absolute -top-2 -right-1 ${isPlanned ? 'bg-emerald-600' : 'bg-slate-600'} text-[7px] px-1 rounded text-white font-bold">${isPlanned ? 'SUGERIDO' : 'MELHOR OPÇÃO'}</span>` : ''}
                        </div>
                      </div>

                      ${
                        isActionDay
                          ? `
                      <div class="flex flex-col gap-2">
                        <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)}, 'revenue', ${isPlanned})" class="w-full ${isPlanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'} text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
                            <i class="fas fa-hand-holding-usd mr-1"></i> Sacar da Receita
                        </button>
                        <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)}, 'personal', ${isPlanned})" class="w-full ${isPlanned ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'} text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
                            <i class="fas fa-wallet mr-1"></i> Sacar da Pessoal
                        </button>
                      </div>
                      `
                          : `
                      <div class="text-[9px] text-slate-500 italic text-center">Saques disponíveis apenas no dia configurado.</div>
                      `
                      }
                  `
        status.className = ''
      }
    } else {
      wSec.classList.add('hidden')
    }
  }

  getColorStyle(type) {
    // Helper to match styles if classes aren't enough (since timeline classes are in style.css, they should work if valid HTML)
    // timeline-value.income { color: #10b981; }
    // timeline-value.task { color: #22c55e; }
    switch (type) {
      case 'team':
        return 'color: #22d3ee;' // cyan-400
      case 'task':
        return 'color: #22c55e;'
      case 'recurring':
        return 'color: #0ea5e9;'
      case 'return':
        return 'color: #a855f7;'
      case 'withdraw-planned':
        return 'color: #eab308;'
      case 'withdraw-realized':
        return 'color: #3b82f6;'
      case 'promotion':
        return 'color: #f472b6;' // pink-400
      default:
        return ''
    }
  }

  openTimelineModal() {
    let viewDays = parseInt(store.state.inputs.viewPeriodSelect)
    let viewStartDate = Formatter.getTodayDate()
    const sel = store.state.inputs.viewPeriodSelect

    if (sel === 'custom') {
      viewStartDate = store.state.inputs.customViewStartDate
      const viewEndDate = store.state.inputs.customViewEndDate
      if (viewStartDate && viewEndDate) {
        viewDays = Formatter.daysBetween(viewStartDate, viewEndDate)
        if (viewDays < 1) viewDays = 1
      } else {
        viewDays = 30
      }
    } else if (sel === 'month') {
      const today = Formatter.getTodayDate()
      const [y, m] = today.split('-').map(Number)
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      viewStartDate = start
      viewDays = Formatter.daysBetween(start, end)
      if (viewDays < 1) viewDays = 1
    } else if (isNaN(viewDays)) {
      viewDays = 30
    }

    Renderer.renderTimeline(store.state.dailyData, viewDays, viewStartDate)
    this.openModal('timelineModal')

    // Auto-scroll to current day
    setTimeout(() => {
      const todayEl = document.getElementById('timeline-today')
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)
  }

  openCardDetails(type) {
    const content = document.getElementById('cardModalContent')
    const results = store.state.results
    let html = ''

    if (type === 'profit') {
      html = `
                <h3 class="text-lg font-bold text-emerald-400 mb-4"><i class="fas fa-chart-line mr-2"></i>Detalhamento de Lucros</h3>
                <div class="space-y-3">
                    <div class="bg-slate-900 p-3 rounded-lg border border-emerald-900/30 text-center mt-2">
                        <span class="block text-xs text-slate-500 uppercase">Lucro Líquido Total</span>
                        <span class="block text-2xl font-black text-emerald-400">${Formatter.currency(results.netProfit)}</span>
                        <span class="text-[10px] text-emerald-600 font-bold">ROI: ${results.roi.toFixed(1)}%</span>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <div class="bg-slate-900 p-2 rounded border border-slate-700">
                             <span class="block text-[10px] text-slate-500 uppercase mb-1">Renda / Extras</span>
                             <span class="block text-sm font-bold text-white">${Formatter.currency(results.totalIncome)}</span>
                        </div>
                        <div class="bg-slate-900 p-2 rounded border border-slate-700">
                             <span class="block text-[10px] text-slate-500 uppercase mb-1">Lucro Invest.</span>
                             <span class="block text-sm font-bold text-emerald-400">${Formatter.currency(results.totalInvestmentProfit)}</span>
                        </div>
                    </div>
                </div>
            `
    } else if (type === 'history') {
      // Filter only Realized withdrawals (from manual or planned execution)
      const history = (store.state.realizedWithdrawals || []).map((w, i) => ({
        ...w,
        index: i,
        type: 'realized'
      }))

      // Sort by date descending (newest first)
      history.sort((a, b) => b.date.localeCompare(a.date))

      // Current Month Totals calculation (based on full history of the month)
      const currentMonthStr = Formatter.getTodayDate().substring(0, 7)
      const grossMonthTotal = history
        .filter(w => w.date.startsWith(currentMonthStr))
        .reduce((acc, w) => acc + Formatter.toCents(w.amount), 0)
      const netMonthTotal = history
        .filter(w => w.date.startsWith(currentMonthStr))
        .reduce(
          (acc, w) => acc + Math.floor(Formatter.toCents(w.amount) * 0.9),
          0
        )

      // Limit to last 8 for display
      const displayHistory = history.slice(0, 8)

      const renderList = isNet => {
        if (displayHistory.length === 0)
          return '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>'
        return displayHistory
          .map(w => {
            // Always realized in this view now
            const amount = isNet
              ? Math.floor(Formatter.toCents(w.amount) * 0.9)
              : Formatter.toCents(w.amount)

            const colorClass = 'text-blue-400'
            // Action is always delete for realized withdrawals
            const action = `app.deleteWithdrawal(${w.index})`

            const walletLabel = w.wallet === 'personal' ? 'Pessoal' : 'Receita'
            const isAutomatic = w.isAutomatic === true
            const typeBadge = isAutomatic
              ? '<span class="text-[8px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/30 font-bold">AUTO</span>'
              : '<span class="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 font-bold">MANUAL</span>'

            return `
                <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1 group border border-slate-700/30 hover:border-slate-500 transition-colors">
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-slate-300 font-bold">${Formatter.dateDisplay(w.date)}</span>
                            ${typeBadge}
                        </div>
                        <span class="text-[9px] text-slate-500 uppercase">${walletLabel}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="${colorClass} font-bold font-mono text-sm">${Formatter.currency(amount)}</span>
                        <button onclick="${action}" class="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-slate-800 rounded" title="Excluir Saque">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>`
          })
          .join('')
      }

      this._historyGrossListHtml = renderList(false)
      this._historyNetListHtml = renderList(true)
      this._historyGrossMonth = grossMonthTotal
      this._historyNetMonth = netMonthTotal
      html = `
                <h3 class="text-lg font-bold text-blue-400 mb-4"><i class="fas fa-history mr-2"></i>Últimos Saques</h3>
                <div class="flex gap-2 mb-3">
                  <button id="historyTabNet" class="px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-white bg-slate-700">Líquido</button>
                  <button id="historyTabGross" class="px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-slate-400 hover:text-white">Bruto</button>
                </div>
                <div class="text-center mb-4 bg-slate-900 mx-auto p-3 rounded-xl border border-slate-700 w-full">
                    <span class="text-3xl font-black text-white block" id="historyMonthTotal"></span>
                    <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Sacado Este Mês</span>
                </div>
                <div class="flex justify-between items-center mb-2 px-1">
                    <p class="text-[10px] font-bold text-slate-400 uppercase">Histórico Recente (Últimos 8)</p>
                </div>
                <div class="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1" id="historyList"></div>
            `
    } else if (type === 'balance_flow') {
      const currentMonthStr = Formatter.getTodayDate().substring(0, 7)
      const monthWithdrawals = (store.state.realizedWithdrawals || [])
        .filter(w => w.date.startsWith(currentMonthStr))
        .sort((a, b) => b.date.localeCompare(a.date))

      let withdrawHtml =
        monthWithdrawals.length === 0
          ? '<p class="text-xs text-slate-500 italic text-center">Nenhum saque neste mês.</p>'
          : ''
      monthWithdrawals.forEach(w => {
        const valCents = Formatter.toCents(w.amount)
        withdrawHtml += `
                    <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1">
                        <span class="text-slate-400">${Formatter.dateDisplay(w.date)}</span>
                        <span class="text-blue-400 font-bold">${Formatter.currency(valCents)}</span>
                    </div>`
      })

      html = `
                <h3 class="text-lg font-bold text-white mb-4"><i class="fas fa-piggy-bank mr-2"></i>Fluxo do Mês</h3>
                
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                        <span class="block text-[10px] text-slate-500 uppercase">Sacado Mês</span>
                        <span class="block text-lg font-bold text-blue-400">${Formatter.currency(results.currentMonthWithdrawn)}</span>
                    </div>
                    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                        <span class="block text-[10px] text-slate-500 uppercase">Projeção Final</span>
                        <span class="block text-lg font-bold text-emerald-400">${Formatter.currency(results.projectedEndOfMonthBalance)}</span>
                    </div>
                </div>

                <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Saques do Mês</p>
                <div class="max-h-[150px] overflow-y-auto custom-scrollbar mb-4">${withdrawHtml}</div>
            `
    } else if (type === 'next_withdrawals') {
      const nextList = results.nextWithdrawalsList || []
      let listHtml =
        nextList.length === 0
          ? '<p class="text-xs text-slate-500 italic text-center">Nenhuma previsão próxima.</p>'
          : ''

      nextList.forEach(w => {
        listHtml += `
                    <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1">
                        <span class="text-slate-400">${Formatter.dateDisplay(w.date)}</span>
                        <span class="text-yellow-400 font-bold">${Formatter.currency(w.val)}</span>
                    </div>`
      })

      html = `
                <h3 class="text-lg font-bold text-yellow-400 mb-4"><i class="fas fa-clock mr-2"></i>Previsão</h3>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4 text-center">
                    <span class="text-xs text-slate-400 block">Próxima Data Estimada</span>
                    <span class="text-xl font-bold text-white">${results.nextWithdrawDate !== '-' ? Formatter.dateDisplay(results.nextWithdrawDate) : '---'}</span>
                    <span class="text-sm font-bold text-yellow-400 block mt-1">${Formatter.currency(results.nextWithdraw)}</span>
                </div>
                
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Previsão</p>
                <div class="max-h-[150px] overflow-y-auto custom-scrollbar">${listHtml}</div>
            `
    } else if (type === 'breakeven') {
      const reached = results.breakEvenDate !== 'N/A'
      const statusIcon = reached
        ? 'fa-check-circle text-emerald-400'
        : 'fa-hourglass-half text-purple-400'
      const statusText = reached ? 'Meta Atingida' : 'Em Andamento'

      html = `
                <h3 class="text-lg font-bold text-purple-400 mb-4"><i class="fas fa-chart-line mr-2"></i>Análise de Retorno</h3>
                
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4">
                    <div class="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                        <span class="text-xs text-slate-400 uppercase font-bold tracking-wider">Status do Payback</span>
                        <div class="flex items-center gap-1.5">
                            <i class="fas ${statusIcon} text-xs"></i>
                            <span class="text-[10px] font-black uppercase ${reached ? 'text-emerald-400' : 'text-purple-400'}">${statusText}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 gap-3">
                        <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                            <div>
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Data Estimada</span>
                                <span class="text-lg font-bold text-white">${reached ? Formatter.dateDisplay(results.breakEvenDate) : '---'}</span>
                            </div>
                            <i class="fas fa-calendar-alt text-slate-600 text-xl"></i>
                        </div>
                        
                        <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                            <div>
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">Tempo de Retorno</span>
                                <span class="text-lg font-bold text-white">${results.paybackDays !== '---' ? `${results.paybackDays} dias` : 'Calculando...'}</span>
                            </div>
                            <i class="fas fa-clock text-slate-600 text-xl"></i>
                        </div>

                        <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                            <div>
                                <span class="text-[10px] text-slate-500 block uppercase font-bold">ROI Estimado</span>
                                <span class="text-lg font-bold ${results.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}">${results.roi.toFixed(1)}%</span>
                            </div>
                            <i class="fas fa-percentage text-slate-600 text-xl"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-indigo-900/10 border border-indigo-500/20 p-3 rounded-lg mb-2">
                    <p class="text-[10px] text-indigo-300 leading-relaxed italic">
                        <i class="fas fa-info-circle mr-1"></i> 
                        O **Break-Even** representa o momento em que o total sacado somado ao saldo atual iguala ou supera o capital total investido.
                    </p>
                </div>
            `
    } else if (type === 'active_capital') {
      const activeInvestments = (store.state.portfolio || [])
        .map(p => {
          const endStr = Formatter.addDays(p.date, p.days)
          const valCents = Formatter.toCents(p.val)
          const profitCents = Math.floor(valCents * (p.rate / 100) * p.days)
          return {
            ...p,
            endStr,
            valCents,
            profitCents,
            totalCents: valCents + profitCents
          }
        })
        .filter(p => p.endStr >= Formatter.getTodayDate())
        .sort((a, b) => a.endStr.localeCompare(b.endStr))

      const totalActive = activeInvestments.reduce(
        (acc, p) => acc + p.valCents,
        0
      )
      const personalActive = activeInvestments
        .filter(p => p.wallet === 'personal')
        .reduce((acc, p) => acc + p.valCents, 0)
      const revenueActive = activeInvestments
        .filter(p => p.wallet === 'revenue')
        .reduce((acc, p) => acc + p.valCents, 0)

      const persPerc =
        totalActive > 0 ? (personalActive / totalActive) * 100 : 0
      const revPerc = totalActive > 0 ? (revenueActive / totalActive) * 100 : 0

      // Groups by day
      const daysMap = {}
      activeInvestments.forEach(p => {
        if (!daysMap[p.endStr]) daysMap[p.endStr] = { total: 0, count: 0 }
        daysMap[p.endStr].total += p.totalCents
        daysMap[p.endStr].count++
      })
      const next3Days = Object.keys(daysMap)
        .sort()
        .slice(0, 3)
        .map(d => ({
          date: d,
          ...daysMap[d]
        }))

      let nextDaysHtml = next3Days
        .map(
          d => `
            <div class="flex justify-between items-center bg-slate-900/40 p-3 rounded border border-slate-700/50 mb-2">
                <div>
                    <span class="text-[10px] text-slate-500 block uppercase font-bold">Data de Retorno</span>
                    <span class="text-xs font-bold text-white">${Formatter.dateDisplay(d.date)}</span>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-slate-500 block uppercase font-bold">${d.count} Contrato(s)</span>
                    <span class="text-sm font-bold text-purple-400">${Formatter.currency(d.total)}</span>
                </div>
            </div>
        `
        )
        .join('')

      html = `
          <h3 class="text-lg font-bold text-purple-400 mb-4"><i class="fas fa-coins mr-2"></i>Carteira de Investimentos</h3>
          
          <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4">
              <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-3">Distribuição por Origem</span>
              <div class="h-2 w-full bg-slate-800 rounded-full flex overflow-hidden mb-2">
                  <div class="bg-indigo-500 h-full" style="width: ${persPerc}%" title="Pessoal"></div>
                  <div class="bg-emerald-500 h-full" style="width: ${revPerc}%" title="Receita"></div>
              </div>
              <div class="flex justify-between text-[10px] font-bold">
                  <div class="flex items-center gap-1.5 text-indigo-400">
                      <span class="w-2 h-2 rounded-full bg-indigo-500"></span> Pessoal: ${persPerc.toFixed(0)}%
                  </div>
                  <div class="flex items-center gap-1.5 text-emerald-400">
                      <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Receita: ${revPerc.toFixed(0)}%
                  </div>
              </div>
          </div>

          <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Próximos 3 Vencimentos</p>
          <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
              ${nextDaysHtml || '<p class="text-xs text-slate-500 italic text-center py-4">Nenhum investimento ativo no momento.</p>'}
          </div>
        `
    }

    content.innerHTML = html
    const tabNet = document.getElementById('historyTabNet')
    const tabGross = document.getElementById('historyTabGross')
    if (tabNet && tabGross) {
      tabNet.onclick = () => this.setHistoryView('net')
      tabGross.onclick = () => this.setHistoryView('gross')
      this.setHistoryView('net')
    }
    this.openModal('cardModal')
  }

  setHistoryView(mode) {
    const monthEl = document.getElementById('historyMonthTotal')
    const listEl = document.getElementById('historyList')
    const tabNet = document.getElementById('historyTabNet')
    const tabGross = document.getElementById('historyTabGross')
    if (!monthEl || !listEl || !tabNet || !tabGross) return
    if (mode === 'net') {
      monthEl.innerText = Formatter.currency(this._historyNetMonth || 0)
      listEl.innerHTML =
        this._historyNetListHtml ||
        '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>'
      tabNet.className =
        'px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-white bg-slate-700'
      tabGross.className =
        'px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-slate-400 hover:text-white'
    } else {
      monthEl.innerText = Formatter.currency(this._historyGrossMonth || 0)
      listEl.innerHTML =
        this._historyGrossListHtml ||
        '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>'
      tabGross.className =
        'px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-white bg-slate-700'
      tabNet.className =
        'px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-slate-400 hover:text-white'
    }
  }
  // --- Profile Actions ---
  openProfileModal() {
    const current = store.state.profiles[store.state.currentProfileId]
    document.getElementById('editCurrentProfileName').value = current.name
    this.openModal('profileModal')
  }

  saveProfileName() {
    const name = document.getElementById('editCurrentProfileName').value
    if (!name) return Renderer.toast('Nome inválido', 'error')

    const profiles = { ...store.state.profiles }
    profiles[store.state.currentProfileId].name = name
    store.setState({ profiles })
    Renderer.toast('Nome do perfil atualizado')
  }

  createProfile() {
    const name = document.getElementById('newProfileName').value
    if (!name) return Renderer.toast('Digite um nome', 'error')
    store.addProfile(name)
    document.getElementById('newProfileName').value = ''
    Renderer.toast('Perfil criado com sucesso')
    this.applyStoreToUI()
    this.runCalculation()
  }

  switchProfile(id) {
    store.switchProfile(id)
    this.applyStoreToUI()
    this.runCalculation()
    this.closeModal('profileModal')
  }

  deleteProfile(id) {
    if (confirm('Tem certeza que deseja excluir este perfil?')) {
      if (store.deleteProfile(id)) {
        this.applyStoreToUI()
        this.runCalculation()
        Renderer.toast('Perfil removido')
      } else {
        Renderer.toast('Não é possível remover o único perfil', 'error')
      }
    }
  }

  // --- Weekly Strategy ---
  toggleWeek(week, btn) {
    let weeks = [...store.state.selectedWeeks]
    if (weeks.includes(week)) {
      weeks = weeks.filter(w => w !== week)
      btn.classList.remove('active')
    } else {
      weeks.push(week)
      btn.classList.add('active')
    }
    store.setState({ selectedWeeks: weeks })
    this.runCalculation()
  }

  restoreWeeksUI() {
    const weeks = store.state.selectedWeeks
    document.querySelectorAll('.week-btn').forEach((btn, idx) => {
      const week = idx + 1
      btn.classList.toggle('active', weeks.includes(week))
      // Ensure onclick is bound
      btn.onclick = () => this.toggleWeek(week, btn)
    })
  }

  // --- Simulation Commit ---
  openCommitModal() {
    this.openModal('commitModal')
  }

  confirmCommit() {
    const baseName = document.getElementById('commitBaseName').value
    if (!baseName) return Renderer.toast('Informe um nome base', 'error')

    const inputs = store.state.inputs
    const capIni = parseFloat(inputs.capitalInicial)
    const days = parseInt(inputs.diasCiclo)
    const rate = parseFloat(inputs.taxaDiaria)
    const reps = parseInt(inputs.repeticoesCiclo)
    const wallet = document.getElementById('commitWallet').value

    let portfolio = [...store.state.portfolio]
    let currentVal = capIni
    let currentDateStr = Formatter.getTodayDate()

    for (let i = 0; i < reps; i++) {
      portfolio.push({
        id: Date.now() + i,
        name: `${baseName} (${i + 1}/${reps})`,
        val: parseFloat(currentVal.toFixed(2)),
        date: currentDateStr,
        days: days,
        rate: rate,
        wallet: wallet
      })
      const profit = currentVal * (rate / 100) * days
      currentVal += profit
      currentDateStr = Formatter.addDays(currentDateStr, days)
    }

    store.setState({ portfolio })
    this.closeModal('commitModal')
    document.getElementById('commitBaseName').value = ''

    // Desabilitar modo simulação automaticamente
    if (store.state.inputs.futureToggle === 'true') {
      this.toggleFuturePlanning()
    }

    this.switchTab('resources')
    Renderer.toast('Simulação efetivada com sucesso!', 'success')
    this.runCalculation()
  }

  // --- Goals Actions ---
  addGoal() {
    const name = document.getElementById('goalName').value
    const val = parseFloat(document.getElementById('goalValue').value)
    if (!name || isNaN(val))
      return Renderer.toast('Preencha os dados da meta', 'error')

    const goals = [...(store.state.goals || []), { name, value: val }]
    store.setState({ goals })
    document.getElementById('goalName').value = ''
    document.getElementById('goalValue').value = ''
    Renderer.toast('Meta adicionada!')
    this.runCalculation()
  }

  removeGoal(index) {
    const goals = store.state.goals.filter((_, i) => i !== index)
    store.setState({ goals })
    this.runCalculation()
  }

  // --- Alerts Action ---
  openAlertsModal() {
    this.openModal('alertsModal')
  }

  // --- Backup Actions ---
  exportBackup() {
    this.renderExportList()
    this.openModal('exportModal')
  }

  renderExportList() {
    const container = document.getElementById('exportProfileList')
    if (!container) return

    const profiles = store.state.profiles || {}
    const currentId = store.state.currentProfileId

    let html = ''
    Object.entries(profiles).forEach(([id, profile]) => {
      const isCurrent = id === currentId
      html += `
        <label class="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer hover:border-blue-500 transition-colors group">
            <div class="flex items-center gap-3">
                <input type="checkbox" name="exportProfile" value="${id}" checked 
                    class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-white">${profile.name}</span>
                    ${isCurrent ? '<span class="text-[8px] text-blue-400 font-bold uppercase">Perfil Ativo</span>' : ''}
                </div>
            </div>
            <i class="fas fa-user text-slate-600 group-hover:text-blue-400 transition-colors text-xs"></i>
        </label>
      `
    })
    container.innerHTML = html
  }

  confirmExport() {
    const checkboxes = document.querySelectorAll(
      'input[name="exportProfile"]:checked'
    )
    const ids = Array.from(checkboxes).map(cb => cb.value)

    if (ids.length === 0) {
      return Renderer.toast(
        'Selecione pelo menos um perfil para exportar',
        'error'
      )
    }

    const data = store.exportSelectedData(ids)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup_gestor_sp_${new Date().toISOString().split('T')[0]}.json`
    a.click()

    this.closeModal('exportModal')
    Renderer.toast(
      `${ids.length} perfil(is) exportado(s) com sucesso!`,
      'success'
    )
  }

  importBackup(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      if (store.importAllData(e.target.result)) {
        Renderer.toast('Backup restaurado com sucesso!', 'success')
        this.applyStoreToUI()
        this.runCalculation()

        // Se o Onboarding estiver aberto, re-renderiza a etapa atual para mostrar os dados importados
        const modal = document.getElementById('onboardingModal')
        if (modal && !modal.classList.contains('hidden')) {
          this.renderOnboardingStep()
        }
      } else {
        Renderer.toast('Erro ao importar backup. Formato inválido.', 'error')
      }
    }
    reader.readAsText(file)
  }

  executeWithdrawal(date, amount, walletType = 'revenue', isAutomatic = false) {
    const dayData = store.state.dailyData[date]
    if (!dayData) return

    let finalAmount = amount
    const availableCents =
      walletType === 'revenue' ? dayData.endRevenue : dayData.endPersonal
    const amountCents = Formatter.toCents(amount)

    if (amountCents > availableCents) {
      // Find highest tier covered by the wallet
      const tiers = Calculator.WITHDRAWAL_TIERS || [
        4000, 13000, 40000, 130000, 420000, 850000, 1900000, 3800000
      ]
      const bestTierCents = tiers.filter(t => t <= availableCents).pop() || 0

      if (bestTierCents === 0) {
        return Renderer.toast(
          `Saldo insuficiente na ${walletType === 'revenue' ? 'Carteira de Receita' : 'Carteira Pessoal'} para qualquer nível de saque.`,
          'error'
        )
      }

      finalAmount = Formatter.fromCents(bestTierCents)
      const walletName =
        walletType === 'revenue' ? 'Carteira de Receita' : 'Carteira Pessoal'
      Renderer.toast(
        `Saldo insuficiente para R$ ${amount.toFixed(2)}. Ajustado para o maior nível possível na ${walletName}: R$ ${finalAmount.toFixed(2)}`,
        'warning'
      )
    }

    if (
      !confirm(
        `Confirma o saque de R$ ${finalAmount.toFixed(2)} da ${walletType === 'revenue' ? 'Carteira de Receita' : 'Carteira Pessoal'}?`
      )
    )
      return

    const realizedWithdrawals = [
      ...(store.state.realizedWithdrawals || []),
      { date, amount: finalAmount.toFixed(2), wallet: walletType, isAutomatic }
    ]
    store.setState({ realizedWithdrawals })

    Renderer.toast('Saque realizado com sucesso!', 'success')
    this.runCalculation()
    this.openDayDetails(date) // Refresh modal
  }

  reconcileWallet(walletType, newTotalStr) {
    const newTotal = parseFloat(newTotalStr)
    if (isNaN(newTotal)) return Renderer.toast('Valor inválido', 'error')

    const currentTotalCents =
      walletType === 'personal'
        ? store.state.results.todayPersonalBalance || 0
        : store.state.results.todayRevenueBalance || 0

    const currentTotal = Formatter.fromCents(currentTotalCents)

    const delta = parseFloat((newTotal - currentTotal).toFixed(2))

    if (Math.abs(delta) < 0.01)
      return Renderer.toast('Saldo já está atualizado', 'info')

    this.adjustWallet(walletType, delta)
  }

  deleteWithdrawal(index) {
    if (!confirm('Tem certeza que deseja apagar este saque realizado?')) return

    const list = [...(store.state.realizedWithdrawals || [])]
    if (index >= 0 && index < list.length) {
      list.splice(index, 1)
      store.setState({ realizedWithdrawals: list })
      Renderer.toast('Saque removido com sucesso!', 'success')
      this.runCalculation()
      // Refresh the card if it's open
      const card = document.getElementById('cardModal')
      if (card && !card.classList.contains('hidden')) {
        this.openCardDetails('history')
      }
    }
  }

  adjustWallet(walletType, delta) {
    if (isNaN(delta) || delta === 0) return
    const today = Formatter.getTodayDate()
    const list = [...(store.state.manualAdjustments || [])]
    list.push({ date: today, amount: delta.toFixed(2), wallet: walletType })
    store.setState({ manualAdjustments: list })
    this.runCalculation()
    this.openBalanceAdjustmentModal()
    Renderer.toast(
      `Carteira atualizada: ${delta > 0 ? '+' : ''}R$ ${delta.toFixed(2)}`,
      'success'
    )
  }

  openBalanceAdjustmentModal() {
    const todayPersonal = Formatter.fromCents(
      store.state.results.todayPersonalBalance || 0
    )
    const todayRevenue = Formatter.fromCents(
      store.state.results.todayRevenueBalance || 0
    )

    const html = `
      <div class="space-y-6">
        <div class="flex items-center gap-3 border-b border-slate-700 pb-3">
          <div class="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center">
            <i class="fas fa-sliders-h text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Ajustes Manuais</h3>
            <p class="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Lançamentos ou correções de saldo</p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex bg-slate-900 rounded-xl p-1 border border-slate-700">
          <button onclick="app.switchAdjustmentTab('quick')" id="adj-tab-quick"
            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all bg-slate-700 text-white">
            Ajuste Rápido
          </button>
          <button onclick="app.switchAdjustmentTab('new')" id="adj-tab-new"
            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all text-slate-500 hover:text-slate-300">
            Novo Lançamento
          </button>
        </div>

        <div id="quickAdjustmentView" class="space-y-4">
          <!-- Pessoal -->
          <div class="bg-slate-900/50 p-4 rounded-xl border border-indigo-500/30">
            <div class="flex justify-between items-center mb-2">
              <label class="text-[10px] text-indigo-300 font-bold uppercase">Carteira Pessoal (Hoje)</label>
            </div>
            
            <div class="flex gap-2 items-center">
               <div class="relative flex-1">
                 <span class="absolute left-3 top-3 text-sm text-slate-500 font-bold">R$</span>
                 <input type="number" id="editPersonal" step="0.01" value="${todayPersonal.toFixed(2)}"
                   class="custom-input w-full rounded-lg py-3 pl-10 text-lg font-bold text-white bg-slate-800 border-slate-700 outline-none focus:border-indigo-500 transition-colors">
               </div>
               <button onclick="app.reconcileWallet('personal', document.getElementById('editPersonal').value)" 
                 class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg text-sm font-bold transition-colors uppercase tracking-wide">
                 Salvar
               </button>
            </div>
          </div>

          <!-- Receita -->
          <div class="bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30">
            <div class="flex justify-between items-center mb-2">
              <label class="text-[10px] text-emerald-300 font-bold uppercase">Carteira de Receita (Hoje)</label>
            </div>

            <div class="flex gap-2 items-center">
               <div class="relative flex-1">
                 <span class="absolute left-3 top-3 text-sm text-slate-500 font-bold">R$</span>
                 <input type="number" id="editRevenue" step="0.01" value="${todayRevenue.toFixed(2)}"
                   class="custom-input w-full rounded-lg py-3 pl-10 text-lg font-bold text-white bg-slate-800 border-slate-700 outline-none focus:border-emerald-500 transition-colors">
               </div>
               <button onclick="app.reconcileWallet('revenue', document.getElementById('editRevenue').value)" 
                 class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg text-sm font-bold transition-colors uppercase tracking-wide">
                 Salvar
               </button>
            </div>
          </div>
          <p class="text-[10px] text-slate-500 italic text-center">O sistema calculará a diferença necessária para atingir o valor final informado.</p>
        </div>

        <div id="newAdjustmentView" class="space-y-4 hidden animate-fade-in">
          <div class="bg-slate-900/50 p-5 rounded-xl border border-slate-700 space-y-4">
            <div>
              <label class="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Descrição</label>
              <input type="text" id="manualDesc" placeholder="Ex: Bônus, Benefícios, Estorno, Correção..."
                class="custom-input w-full rounded-lg py-2 px-3 text-xs">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Valor (R$)</label>
                <input type="number" id="manualValue" step="0.01" placeholder="0.00"
                  class="custom-input w-full rounded-lg py-2 px-3 text-sm font-bold">
              </div>
              <div>
                <label class="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Carteira</label>
                <select id="manualWallet" class="custom-input w-full rounded-lg py-2 px-3 text-xs">
                  <option value="personal">Pessoal</option>
                  <option value="revenue">Receita</option>
                </select>
              </div>
            </div>

            <div>
              <label class="text-[10px] text-slate-400 font-bold uppercase mb-2 block">Tipo de Lançamento</label>
              <div id="manualTypeSelector" class="flex gap-2" data-type="in">
                <button onclick="this.parentElement.dataset.type='in'; this.nextElementSibling.classList.remove('bg-red-600','text-white'); this.classList.add('bg-emerald-600','text-white')"
                  class="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border border-slate-700 transition-all bg-emerald-600 text-white">
                  Entrada (+)
                </button>
                <button onclick="this.parentElement.dataset.type='out'; this.previousElementSibling.classList.remove('bg-emerald-600','text-white'); this.classList.add('bg-red-600','text-white')"
                  class="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border border-slate-700 transition-all">
                  Saída (-)
                </button>
              </div>
            </div>

            <button onclick="app.addManualTransaction()"
              class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 text-xs uppercase tracking-widest mt-2">
              <i class="fas fa-plus mr-2"></i> Adicionar Lançamento
            </button>
          </div>
        </div>

        <div class="border-t border-slate-700/50 pt-4 mt-2">
           <button onclick="app.closeModal('cardModal')" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors text-xs uppercase tracking-widest">
             Cancelar
           </button>
        </div>
      </div>
    `
    document.getElementById('cardModalContent').innerHTML = html
    this.openModal('cardModal')
  }

  switchAdjustmentTab(tab) {
    const quickTab = document.getElementById('adj-tab-quick')
    const newTab = document.getElementById('adj-tab-new')
    const quickView = document.getElementById('quickAdjustmentView')
    const newView = document.getElementById('newAdjustmentView')

    if (tab === 'quick') {
      quickTab.classList.add('bg-slate-700', 'text-white')
      quickTab.classList.remove('text-slate-500')
      newTab.classList.remove('bg-slate-700', 'text-white')
      newTab.classList.add('text-slate-500')
      quickView.classList.remove('hidden')
      newView.classList.add('hidden')
    } else {
      newTab.classList.add('bg-slate-700', 'text-white')
      newTab.classList.remove('text-slate-500')
      quickTab.classList.remove('bg-slate-700', 'text-white')
      quickTab.classList.add('text-slate-500')
      newView.classList.remove('hidden')
      quickView.classList.add('hidden')
    }
  }

  addManualTransaction() {
    const desc = document.getElementById('manualDesc').value || 'Ajuste'
    const valInput = document.getElementById('manualValue').value
    const wallet = document.getElementById('manualWallet').value
    const type = document.getElementById('manualTypeSelector').dataset.type

    const amount = parseFloat(valInput)
    if (isNaN(amount) || amount <= 0) {
      Renderer.toast('Por favor, informe um valor válido', 'error')
      return
    }

    const finalAmount = type === 'in' ? amount : -amount

    store.addManualAdjustment({
      id: Date.now(),
      date: Formatter.getTodayDate(),
      amount: finalAmount,
      wallet: wallet,
      description: desc
    })

    this.runCalculation()
    this.closeModal('cardModal')
    Renderer.toast('Lançamento adicionado com sucesso', 'success')
  }

  deleteManualAdjustment(id) {
    if (!confirm('Excluir este lançamento manual?')) return
    const list = store.state.manualAdjustments.filter(a => a.id !== id)
    store.setState({ manualAdjustments: list })
    this.runCalculation()
    Renderer.toast('Lançamento excluído')
  }

  deleteWithdrawal(index) {
    if (!confirm('Deseja excluir este registro de saque?')) return
    const list = [...(store.state.realizedWithdrawals || [])]
    const date = list[index] ? list[index].date : null
    list.splice(index, 1)
    store.setState({ realizedWithdrawals: list })
    Renderer.toast('Saque removido')
    this.runCalculation()
    // Refresh the view that called it
    if (
      document.getElementById('dayDetailsModal') &&
      !document.getElementById('dayDetailsModal').classList.contains('hidden')
    ) {
      if (date) this.openDayDetails(date)
    } else {
      this.openCardDetails('history')
    }
  }

  skipPlannedWithdrawal(date) {
    if (
      !confirm(
        `Deseja pular o saque planejado para ${Formatter.dateDisplay(date)}?`
      )
    )
      return
    const skipped = [...(store.state.inputs.skippedWithdrawals || [])]
    if (!skipped.includes(date)) {
      skipped.push(date)
      store.updateInput('skippedWithdrawals', skipped)
      Renderer.toast('Saque planejado ignorado', 'success')
      this.runCalculation()
      this.openCardDetails('history') // Refresh history view
    }
  }

  // --- Utils ---
  openModal(id) {
    const el = document.getElementById(id)
    if (!el) return

    if (id === 'dayModal') {
      const fin = document.getElementById('financialDetailSection')
      const finZ = fin ? parseInt(getComputedStyle(fin).zIndex || '0') : 0
      const curZ = parseInt(getComputedStyle(el).zIndex || '0')
      const nextZ = Math.max(1100, finZ + 10, curZ)
      el.style.zIndex = String(nextZ)
    }

    el.classList.remove('hidden')
  }
  closeModal(id) {
    document.getElementById(id).classList.add('hidden')
  }

  resetData() {
    if (confirm('Deseja limpar todos os dados do perfil atual?')) {
      const initial = store.getInitialData()
      store.setState({
        inputs: initial.inputs,
        portfolio: initial.portfolio,
        selectedWeeks: initial.selectedWeeks
      })
      this.applyStoreToUI()
      this.runCalculation()
      Renderer.toast('Dados limpos')
    }
  }

  setWithdrawTarget(val) {
    store.updateInput('withdrawTarget', val)
    this.runCalculation()
    Renderer.toast(
      `Meta de saque definida: ${Formatter.currency(Formatter.toCents(val))}`
    )
  }

  toggleExpandSection() {
    const section = document.getElementById('financialDetailSection')
    const icon = document.getElementById('expandIcon')

    if (section.classList.contains('expanded-view')) {
      section.classList.remove('expanded-view')
      icon.classList.remove('fa-compress-alt')
      icon.classList.add('fa-expand-alt')
      document.body.style.overflow = '' // Restore scroll
    } else {
      section.classList.add('expanded-view')
      icon.classList.remove('fa-expand-alt')
      icon.classList.add('fa-compress-alt')
      document.body.style.overflow = 'hidden' // Lock scroll
    }
  }

  exportToPDF() {
    const results = store.state.results
    const dailyData = store.state.dailyData

    if (!results || !dailyData) {
      return Renderer.toast('Nenhum dado disponível para exportação', 'error')
    }

    // Determine Date Range
    let startDate = Formatter.getTodayDate()
    let endDate = null

    if (store.state.inputs.viewPeriodSelect === 'custom') {
      startDate = store.state.inputs.customViewStartDate
      endDate = store.state.inputs.customViewEndDate
    } else {
      const days = parseInt(store.state.inputs.viewPeriodSelect) || 30
      endDate = Formatter.addDays(startDate, days)
    }

    const success = Exporter.generatePDF(results, dailyData, startDate, endDate)
    if (success) {
      Renderer.toast('Relatório PDF gerado com sucesso!', 'success')
    } else {
      Renderer.toast('Erro ao gerar PDF. Verifique o console.', 'error')
    }
  }

  exportToExcel() {
    const dailyData = store.state.dailyData

    if (!dailyData || Object.keys(dailyData).length === 0) {
      return Renderer.toast('Nenhum dado disponível para exportação', 'error')
    }

    // Determine Date Range
    let startDate = Formatter.getTodayDate()
    let endDate = null

    if (store.state.inputs.viewPeriodSelect === 'custom') {
      startDate = store.state.inputs.customViewStartDate
      endDate = store.state.inputs.customViewEndDate
    } else {
      const days = parseInt(store.state.inputs.viewPeriodSelect) || 30
      endDate = Formatter.addDays(startDate, days)
    }

    const success = Exporter.generateExcel(dailyData, startDate, endDate)
    if (success) {
      Renderer.toast('Planilha Excel gerada com sucesso!', 'success')
    } else {
      Renderer.toast('Erro ao gerar Excel. Verifique o console.', 'error')
    }
  }

  // --- AI Assistant Methods ---
  updateAiButtonVisibility() {
    const btn = document.getElementById('aiAssistantBtn')
    if (!btn) return

    const { inputs } = store.state
    const isToggleOn =
      inputs.aiAssistantToggle === true || inputs.aiAssistantToggle === 'true'
    const isConfigured = aiService.isConfigured()

    if (isToggleOn && isConfigured) {
      btn.classList.remove('hidden')
      btn.classList.add('flex')
    } else {
      btn.classList.add('hidden')
      btn.classList.remove('flex')
    }

    // Update status labels in sidebar if they exist
    const statusGemini = document.getElementById('aiKeyStatusGemini')
    if (statusGemini) {
      const hasKey = !!store.state.inputs.geminiApiKey?.trim()
      statusGemini.textContent = hasKey ? '✅ Ativo' : '❌ Pendente'
      statusGemini.className = `text-[9px] font-bold ${hasKey ? 'text-emerald-500' : 'text-slate-500'}`
    }

    const statusOpenai = document.getElementById('aiKeyStatusOpenai')
    if (statusOpenai) {
      const hasKey = !!store.state.inputs.openaiApiKey?.trim()
      statusOpenai.textContent = hasKey ? '✅ Ativo' : '❌ Pendente'
      statusOpenai.className = `text-[9px] font-bold ${hasKey ? 'text-emerald-500' : 'text-slate-500'}`
    }

    const statusGroq = document.getElementById('aiKeyStatusGroq')
    if (statusGroq) {
      const hasKey = !!store.state.inputs.groqApiKey?.trim()
      statusGroq.textContent = hasKey ? '✅ Ativo' : '❌ Pendente'
      statusGroq.className = `text-[9px] font-bold ${hasKey ? 'text-emerald-500' : 'text-slate-500'}`
    }
  }

  openAiChat() {
    if (!aiService.isConfigured()) {
      const providerName =
        aiService.getProvider() === 'openai' ? 'ChatGPT' : 'Gemini'
      Renderer.toast(
        `Configure sua API Key do ${providerName} nas configurações`,
        'error'
      )
      this.toggleSidebar()
      return
    }
    this.openModal('aiChatModal')
    document.getElementById('aiChatInput')?.focus()
  }

  async testAiConnection() {
    const btn = document.getElementById('testAiBtn')
    if (!btn) return

    if (!aiService.isConfigured()) {
      Renderer.toast('Configure a API Key antes de testar.', 'warning')
      return
    }

    const originalContent = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...'

    try {
      // Teste rápido sem poluir o histórico principal
      const response = await aiService.sendMessage(
        'Responda apenas com a palavra OK se estiver me ouvindo.'
      )
      if (response) {
        Renderer.toast('Conexão com a IA bem sucedida! ✅', 'success')
      } else {
        throw new Error('Sem resposta da IA')
      }
    } catch (error) {
      console.error('Teste de IA falhou:', error)
      Renderer.toast(`Falha na conexão: ${error.message}`, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = originalContent
    }
  }

  async sendAiMessage(event) {
    event?.preventDefault()

    const input = document.getElementById('aiChatInput')
    const sendBtn = document.getElementById('aiSendBtn')
    const messagesContainer = document.getElementById('aiChatMessages')
    const message = input?.value?.trim()

    if (!message) return

    // Clear input and disable button
    input.value = ''
    sendBtn.disabled = true
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

    // Add user message to chat
    this.appendAiMessage(message, 'user')

    // Add typing indicator
    const typingId = 'ai-typing-' + Date.now()
    messagesContainer.insertAdjacentHTML(
      'beforeend',
      `
      <div id="${typingId}" class="ai-message">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex-shrink-0 flex items-center justify-center">
            <i class="fas fa-robot text-white text-xs"></i>
          </div>
          <div class="bg-slate-800 rounded-2xl rounded-tl-sm p-3 border border-slate-700">
            <div class="ai-typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    `
    )
    messagesContainer.scrollTop = messagesContainer.scrollHeight

    try {
      const response = await aiService.sendMessage(message)

      // Remove typing indicator
      document.getElementById(typingId)?.remove()

      // Add AI response
      this.appendAiMessage(response, 'assistant')
    } catch (error) {
      // Remove typing indicator
      document.getElementById(typingId)?.remove()

      // Add error message
      this.appendAiMessage(`⚠️ ${error.message}`, 'error')
    }

    // Re-enable button
    sendBtn.disabled = false
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'
    input?.focus()
  }

  sendQuickAiMessage(message) {
    const input = document.getElementById('aiChatInput')
    if (input) {
      input.value = message
      this.sendAiMessage(new Event('submit'))
    }
  }

  appendAiMessage(content, type) {
    const container = document.getElementById('aiChatMessages')
    if (!container) return

    const isUser = type === 'user'
    const isError = type === 'error'

    // Simple markdown-like formatting for AI responses
    let formattedContent = content
    if (!isUser && !isError) {
      formattedContent = this.formatAiResponse(content)
    }

    if (isUser) {
      container.insertAdjacentHTML(
        'beforeend',
        `
        <div class="ai-message flex justify-end">
          <div class="max-w-[80%] bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl rounded-tr-sm p-3 shadow-lg">
            <p class="text-sm text-white">${this.escapeHtml(content)}</p>
          </div>
        </div>
      `
      )
    } else {
      const bgClass = isError
        ? 'bg-red-900/30 border-red-700/50'
        : 'bg-slate-800 border-slate-700'
      container.insertAdjacentHTML(
        'beforeend',
        `
        <div class="ai-message">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 bg-gradient-to-br ${isError ? 'from-red-500 to-orange-600' : 'from-purple-500 to-indigo-600'} rounded-full flex-shrink-0 flex items-center justify-center">
              <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-robot'} text-white text-xs"></i>
            </div>
            <div class="flex-1 ${bgClass} rounded-2xl rounded-tl-sm p-3 border">
              <div class="text-sm text-slate-200 markdown-content">${formattedContent}</div>
            </div>
          </div>
        </div>
      `
      )
    }

    container.scrollTop = container.scrollHeight
  }

  formatAiResponse(text) {
    // Basic markdown formatting
    return (
      text
        // Escape HTML first
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`(.+?)`/g, '<code>$1</code>')
        // Line breaks
        .replace(/\n/g, '<br>')
        // Lists (simple)
        .replace(/^- (.+)/gm, '• $1')
    )
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  clearAiChat() {
    aiService.clearHistory()
    const container = document.getElementById('aiChatMessages')
    if (container) {
      container.innerHTML = `
        <div class="ai-message">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex-shrink-0 flex items-center justify-center">
              <i class="fas fa-robot text-white text-xs"></i>
            </div>
            <div class="flex-1 bg-slate-800 rounded-2xl rounded-tl-sm p-3 border border-slate-700">
              <p class="text-sm text-slate-200">Conversa limpa! 🧹 Como posso ajudar?</p>
            </div>
          </div>
        </div>
      `
    }
    Renderer.toast('Histórico de conversa limpo', 'success')
  }

  // --- Proactive Insights Methods ---
  async loadInsights() {
    // Agora os insights são determinísticos e instantâneos via NotificationManager
    const notifications = NotificationManager.getNotifications()
    this.renderInsights(notifications)
  }

  renderInsights(insights) {
    const alertsList = document.getElementById('alertsList')
    const alertsBadge = document.getElementById('alertsBadge')
    const alertsContainer = document.getElementById('alertsContainer')

    if (!alertsList) return

    // O contador (Badge) do sino baseia-se no total de insights gerados
    const total = insights?.length || 0

    if (alertsBadge) {
      alertsBadge.textContent = total
      alertsBadge.classList.toggle('hidden', total === 0)
    }

    if (alertsContainer) {
      alertsContainer.classList.toggle('hidden', total === 0)
    }

    // Limpeza para evitar duplicidade
    alertsList.innerHTML = ''

    if (total === 0) {
      alertsList.innerHTML =
        '<p class="text-xs text-slate-500 text-center italic">Nenhum alerta pendente</p>'
      return
    }

    // Renderizar HTML dos cards dentro do #alertsList
    alertsList.innerHTML = insights
      .map((n, idx) => Renderer.renderNotificationCard(n, idx))
      .join('')
  }

  async refreshInsights() {
    const icon = document.getElementById('refreshInsightsIcon')
    if (icon) {
      icon.classList.add('spin-animation')
    }

    // Reload local notifications
    await this.loadInsights()

    if (icon) {
      icon.classList.remove('spin-animation')
    }

    Renderer.toast('Insights atualizados', 'success')
  }

  handleInsightAction(action, marcoKey) {
    switch (action) {
      case 'Ver detalhes':
        this.openCardDetails('next_withdrawals')
        break
      case 'Ir para Investimentos':
        document
          .getElementById('investmentsSection')
          ?.scrollIntoView({ behavior: 'smooth' })
        break
      case 'Abrir Simulador':
        const futureEnabled = store.state.inputs.futureToggle === 'true'
        if (!futureEnabled) this.toggleFuturePlanning()
        document
          .getElementById('futureSection')
          ?.scrollIntoView({ behavior: 'smooth' })
        break
      default:
        // Open AI chat for more details
        if (aiService.isConfigured()) {
          this.openAiChat()
        }
    }
  }

  dismissNotification(id) {
    const card = document.getElementById(`notif-${id}`)
    if (card) {
      card.style.opacity = '0'
      card.style.transform = 'translateX(20px)'
      setTimeout(() => {
        const current = store.state.dismissedNotifications || []
        if (!current.includes(id)) {
          store.setState({ dismissedNotifications: [...current, id] })
        }
        // Force refresh insights (which now handles alerts)
        this.loadInsights()
      }, 300)
    }
  }

  dismissInsight(element, marcoKey) {
    if (marcoKey) {
      aiService.markMilestoneAchieved(marcoKey)
    }

    // Animate out
    const card = element.closest('.insight-card')
    if (card) {
      card.style.opacity = '0'
      card.style.transform = 'translateX(20px)'
      setTimeout(() => {
        card.remove()
        // Reload to update badge and list
        this.loadInsights()
      }, 300)
    }
  }
  // --- Onboarding (Wizard) Methods ---
  openOnboarding() {
    this.onboardingStep = 0
    this.openModal('onboardingModal')
    this.renderOnboardingStep()
  }

  dismissOnboarding() {
    store.updateInput('setupCompleted', true)
    store.saveToStorage()
    this.closeModal('onboardingModal')
    this.applyStoreToUI()
    this.runCalculation()
    Renderer.toast(
      'Configuração ignorada. Você pode alterar tudo nas Configurações.',
      'info'
    )
  }

  renderOnboardingStep() {
    const body = document.getElementById('onboardingBody')
    const title = document.getElementById('onboardingTitle')
    const progress = document.getElementById('onboardingProgress')
    const backBtn = document.getElementById('onboardingBackBtn')
    const nextBtn = document.getElementById('onboardingNextBtn')
    const finishBtn = document.getElementById('onboardingFinishBtn')

    if (!body || !title || !progress) return

    const totalSteps = 8

    // Progress Dots
    progress.innerHTML = Array.from({ length: totalSteps })
      .map(
        (_, i) => `
      <div class="w-2 h-2 rounded-full transition-all duration-300 ${i === this.onboardingStep ? 'bg-blue-500 w-6' : i < this.onboardingStep ? 'bg-emerald-500' : 'bg-slate-700'}"></div>
    `
      )
      .join('')

    // Navigation Buttons Logic
    if (this.onboardingStep === 0) {
      backBtn.classList.remove('hidden')
      backBtn.innerHTML =
        '<i class="fas fa-file-import mr-2"></i> Restaurar Backup'
      backBtn.className =
        'text-slate-400 hover:text-white text-xs font-bold flex items-center gap-2 transition-colors'
      backBtn.onclick = () => document.getElementById('importFile').click()
    } else {
      const isLastStep = this.onboardingStep === totalSteps - 1
      backBtn.classList.toggle('hidden', isLastStep)
      backBtn.innerHTML = '<i class="fas fa-chevron-left mr-2"></i> Voltar'
      backBtn.className =
        'px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all border border-slate-600'
      backBtn.onclick = () => this.prevOnboardingStep()
    }

    nextBtn.classList.toggle('hidden', this.onboardingStep === totalSteps - 1)
    finishBtn.classList.toggle('hidden', this.onboardingStep !== totalSteps - 1)

    // Current State for Inputs
    const state = store.state.inputs

    let html = ''
    switch (this.onboardingStep) {
      case 0:
        title.innerText = 'Vamos configurar seu caixa inicial'
        html = `
          <div class="space-y-6 animate-fade-in">
            <p class="text-sm text-slate-400">Informe quanto você possui hoje em cada uma das suas carteiras.</p>
            <div class="space-y-4">
              <div class="bg-slate-800/50 p-4 rounded-2xl border border-indigo-500/30">
                <label class="text-[10px] text-indigo-300 font-bold uppercase mb-2 block tracking-widest">Carteira Pessoal</label>
                <div class="flex items-center gap-3">
                  <span class="text-2xl font-bold text-slate-500">R$</span>
                  <input type="number" id="onb_personalWalletStart" step="0.01" value="${state.personalWalletStart}"
                    class="bg-transparent w-full text-3xl font-bold text-white outline-none placeholder-slate-700" placeholder="0.00">
                </div>
              </div>
              <div class="bg-slate-800/50 p-4 rounded-2xl border border-emerald-500/30">
                <label class="text-[10px] text-emerald-300 font-bold uppercase mb-2 block tracking-widest">Carteira de Receita</label>
                <div class="flex items-center gap-3">
                  <span class="text-2xl font-bold text-slate-500">R$</span>
                  <input type="number" id="onb_revenueWalletStart" step="0.01" value="${state.revenueWalletStart}"
                    class="bg-transparent w-full text-3xl font-bold text-white outline-none placeholder-slate-700" placeholder="0.00">
                </div>
              </div>
            </div>
            <p class="text-[10px] text-slate-500 italic">Dica: A carteira de receita é onde você recebe ganhos diários. A pessoal é seu capital protegido.</p>
          </div>
        `
        break

      case 1:
        title.innerText = 'Qual seu nível atual de tarefas?'
        html = `
          <div class="space-y-6 animate-fade-in">
            <p class="text-sm text-slate-400">Selecione o nível que define seus ganhos diários por tarefas realizadas.</p>
            <div class="space-y-4">
              <select id="onb_taskLevel" onchange="document.getElementById('onb_customTaskInput').classList.toggle('hidden', this.value !== 'custom')"
                class="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 transition-all cursor-pointer">
                <option value="0" ${state.taskLevel === '0' ? 'selected' : ''}>Nível 0 (Sem renda)</option>
                <option value="9.00" ${state.taskLevel === '9.00' ? 'selected' : ''}>S1 - R$ 9,00/dia</option>
                <option value="28.00" ${state.taskLevel === '28.00' ? 'selected' : ''}>S2 - R$ 28,00/dia</option>
                <option value="90.00" ${state.taskLevel === '90.00' ? 'selected' : ''}>M1 - R$ 90,00/dia</option>
                <option value="279.00" ${state.taskLevel === '279.00' ? 'selected' : ''}>M2 - R$ 279,00/dia</option>
                <option value="custom" ${state.taskLevel === 'custom' ? 'selected' : ''}>Valor Personalizado</option>
              </select>
              <div id="onb_customTaskInput" class="${state.taskLevel === 'custom' ? '' : 'hidden'} relative">
                <input type="number" id="onb_taskDailyValue" step="0.01" value="${state.taskDailyValue}"
                  class="bg-slate-800 border-2 border-slate-700 w-full rounded-2xl p-4 pl-10 text-white font-bold outline-none focus:border-blue-500" placeholder="Valor Diário">
                <span class="absolute left-4 top-4 text-slate-500 font-bold">R$</span>
              </div>
            </div>
          </div>
        `
        break

      case 2:
        title.innerText = 'Você possui equipe formada?'
        html = `
          <div class="space-y-6 animate-fade-in">
             <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                    <i class="fas fa-users text-lg"></i>
                  </div>
                  <div>
                    <span class="text-sm font-bold text-white block">Ativar Bônus de Equipe</span>
                    <span class="text-[10px] text-slate-500">Renda passiva baseada em subordinados</span>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="onb_teamBonusToggle" class="sr-only peer" ${state.teamBonusToggle ? 'checked' : ''} 
                    onchange="document.getElementById('onb_teamBonusGridContainer').classList.toggle('hidden', !this.checked)">
                  <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             <div id="onb_teamBonusGridContainer" class="${state.teamBonusToggle ? '' : 'hidden'} space-y-4">
                <p class="text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center">Quantidade de pessoas por nível</p>
                <div class="grid grid-cols-4 gap-2 text-center text-[9px] font-bold text-slate-500 uppercase mb-1">
                  <span>Nível</span><span>Equipe A</span><span>Equipe B</span><span>Equipe C</span>
                </div>
                <div class="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                  ${Object.keys(state.teamCounts)
                    .map(
                      level => `
                    <div class="grid grid-cols-4 gap-2 items-center">
                      <span class="text-[11px] font-bold text-slate-300">${level}</span>
                      <input type="number" min="0" id="onb_team_${level}_A" value="${state.teamCounts[level].A}" class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-xs text-white">
                      <input type="number" min="0" id="onb_team_${level}_B" value="${state.teamCounts[level].B}" class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-xs text-white">
                      <input type="number" min="0" id="onb_team_${level}_C" value="${state.teamCounts[level].C}" class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-xs text-white">
                    </div>
                  `
                    )
                    .join('')}
                </div>
             </div>
          </div>
        `
        break

      case 3:
        title.innerText = 'Você recebe salário por cargo?'
        html = `
          <div class="space-y-6 animate-fade-in">
             <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center">
                    <i class="fas fa-id-badge text-lg"></i>
                  </div>
                  <div>
                    <span class="text-sm font-bold text-white block">Ativar Benefícios de Promoção</span>
                    <span class="text-[10px] text-slate-500">Salário mensal automático do cargo atual</span>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="onb_promotionToggle" class="sr-only peer" ${state.promotionToggle ? 'checked' : ''} 
                    onchange="document.getElementById('onb_promotionFields').classList.toggle('hidden', !this.checked)">
                  <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             <div id="onb_promotionFields" class="${state.promotionToggle ? '' : 'hidden'} space-y-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div>
                  <label class="text-[10px] text-slate-500 font-bold uppercase mb-2 block tracking-widest">Nível do Cargo</label>
                  <select id="onb_promotionLevel" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none">
                    <option value="assistente_estagio" ${state.promotionLevel === 'assistente_estagio' ? 'selected' : ''}>Assistente de Estágio (R$ 600)</option>
                    <option value="assistente_oficial" ${state.promotionLevel === 'assistente_oficial' ? 'selected' : ''}>Assistente Oficial (R$ 1.200)</option>
                    <option value="supervisor_junior" ${state.promotionLevel === 'supervisor_junior' ? 'selected' : ''}>Supervisor Júnior (R$ 3.600)</option>
                    <option value="chefe_marketing" ${state.promotionLevel === 'chefe_marketing' ? 'selected' : ''}>Chefe de Marketing (R$ 9.000)</option>
                    <option value="gerente_junior" ${state.promotionLevel === 'gerente_junior' ? 'selected' : ''}>Gerente Júnior (R$ 15.000)</option>
                    <option value="diretor_marketing" ${state.promotionLevel === 'diretor_marketing' ? 'selected' : ''}>Diretor de Marketing (R$ 38.000)</option>
                    <option value="socio_assalariado" ${state.promotionLevel === 'socio_assalariado' ? 'selected' : ''}>Sócio Assalariado (R$ 80.000)</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] text-slate-500 font-bold uppercase mb-2 block tracking-widest">Dia de Pagamento</label>
                  <input type="number" id="onb_promotionDay" min="1" max="31" value="${state.promotionDay}"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none" placeholder="Dia (1-31)">
                </div>
             </div>
          </div>
        `
        break

      case 4:
        title.innerText = 'Possui outra renda fixa mensal?'
        html = `
          <div class="space-y-6 animate-fade-in">
             <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                    <i class="fas fa-hand-holding-usd text-lg"></i>
                  </div>
                  <div>
                    <span class="text-sm font-bold text-white block">Rendas Extras Mensais</span>
                    <span class="text-[10px] text-slate-500">Ex: Salários externos, pensões, etc.</span>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="onb_monthlyIncomeToggle" class="sr-only peer" ${state.monthlyIncomeToggle ? 'checked' : ''} 
                    onchange="document.getElementById('onb_fixedIncomeContainer').classList.toggle('hidden', !this.checked)">
                  <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
             </div>

             <div id="onb_fixedIncomeContainer" class="${state.monthlyIncomeToggle ? '' : 'hidden'} space-y-4">
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-2.5 text-slate-500 text-[10px] font-bold">R$</span>
                    <input type="number" id="onb_addIncomeAmount" placeholder="Valor" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 pl-7 text-xs text-white">
                  </div>
                  <input type="number" id="onb_addIncomeDay" placeholder="Dia" min="1" max="31" class="w-16 bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-xs text-white">
                  <button onclick="app.addOnbFixedIncome()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg"><i class="fas fa-plus"></i></button>
                </div>
                <div id="onb_fixedIncomeList" class="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                   <!-- List will be rendered -->
                </div>
             </div>
          </div>
        `
        setTimeout(() => this.renderOnbFixedIncomeList(), 0)
        break

      case 5:
        title.innerText = 'Como você planeja seus saques?'
        html = `
          <div class="space-y-6 animate-fade-in">
             <div class="space-y-4">
               <div>
                 <label class="text-[10px] text-slate-500 font-bold uppercase mb-2 block tracking-widest">Estratégia de Saque</label>
                 <select id="onb_withdrawStrategy" onchange="document.getElementById('onb_targetContainer').classList.toggle('hidden', this.value !== 'fixed')"
                   class="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-blue-500 transition-all cursor-pointer">
                   <option value="none" ${state.withdrawStrategy === 'none' ? 'selected' : ''}>Sem Saque Automático</option>
                   <option value="max" ${state.withdrawStrategy === 'max' ? 'selected' : ''}>Sacar Teto Máximo (Sempre)</option>
                   <option value="fixed" ${state.withdrawStrategy === 'fixed' ? 'selected' : ''}>Meta Fixa (Selecionar Alvo)</option>
                   <option value="weekly" ${state.withdrawStrategy === 'weekly' ? 'selected' : ''}>Semanas Específicas</option>
                 </select>
               </div>

               <div id="onb_targetContainer" class="${state.withdrawStrategy === 'fixed' ? '' : 'hidden'} animate-fade-in">
                  <p class="text-[9px] text-slate-500 mb-2 uppercase font-bold tracking-widest">Selecione o valor teto dos saques:</p>
                  <div class="grid grid-cols-4 gap-2">
                    ${Calculator.WITHDRAWAL_TIERS.map(t => {
                      const v = Formatter.fromCents(t)
                      const isSelected = state.withdrawTarget == v
                      return `<button class="onb-tier-btn ${isSelected ? 'selected' : ''}" onclick="app.setOnbWithdrawTarget(${v}, this)">${v.toLocaleString('pt-BR')}</button>`
                    }).join('')}
                  </div>
                  <input type="hidden" id="onb_withdrawTarget" value="${state.withdrawTarget}">
               </div>

               <div>
                 <label class="text-[10px] text-slate-500 font-bold uppercase mb-2 block tracking-widest">Dia Preferencial de Saque</label>
                 <select id="onb_withdrawalDaySelect" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none">
                    <option value="0" ${state.withdrawalDaySelect == '0' ? 'selected' : ''}>Domingo</option>
                    <option value="1" ${state.withdrawalDaySelect == '1' ? 'selected' : ''}>Segunda</option>
                    <option value="2" ${state.withdrawalDaySelect == '2' ? 'selected' : ''}>Terça</option>
                    <option value="3" ${state.withdrawalDaySelect == '3' ? 'selected' : ''}>Quarta</option>
                    <option value="4" ${state.withdrawalDaySelect == '4' ? 'selected' : ''}>Quinta</option>
                    <option value="5" ${state.withdrawalDaySelect == '5' ? 'selected' : ''}>Sexta</option>
                    <option value="6" ${state.withdrawalDaySelect == '6' ? 'selected' : ''}>Sábado</option>
                 </select>
               </div>
             </div>
          </div>
        `
        break

      case 6:
        title.innerText = 'Investimentos em Andamento'
        html = `
          <div class="space-y-6 animate-fade-in">
             <p class="text-sm text-slate-400 leading-relaxed">Se você já possui aportes ativos, adicione-os agora. O sistema usará esses dados para calcular seus lucros e retorno de capital.</p>
             
             <div class="bg-slate-800/80 p-5 rounded-2xl border border-blue-500/30 space-y-3">
                <div class="grid grid-cols-2 gap-2">
                   <input type="text" id="onb_newInvName" placeholder="Nome do aporte" class="col-span-2 bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white">
                   <div class="relative">
                      <span class="absolute left-3 top-3 text-slate-500 text-[10px] uppercase font-bold">R$</span>
                      <input type="number" id="onb_newInvVal" placeholder="Valor" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pl-8 text-xs text-white">
                   </div>
                   <input type="date" id="onb_newInvDate" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white">
                   <input type="number" id="onb_newInvDays" placeholder="Dias" class="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white">
                   <div class="relative">
                      <span class="absolute right-3 top-3 text-slate-500 text-[10px] font-bold">%</span>
                      <input type="number" id="onb_newInvRate" placeholder="Taxa" value="1.2" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white">
                   </div>
                </div>
                <button onclick="app.addOnbInvestment()" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-900/50">
                  <i class="fas fa-plus mr-2"></i> Adicionar à Lista
                </button>
             </div>

             <div id="onb_portfolioList" class="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                <!-- Porfolio items -->
             </div>
          </div>
        `
        setTimeout(() => this.renderOnbPortfolioList(), 0)
        break

      case 7:
        title.innerText = 'Tudo pronto!'
        html = `
          <div class="flex flex-col items-center justify-center text-center space-y-6 py-6 animate-fade-in">
            <div class="w-24 h-24 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-2 animate-bounce">
              <i class="fas fa-check-circle text-6xl"></i>
            </div>
            <div>
              <h4 class="text-xl font-bold text-white mb-2">Configuração Finalizada</h4>
              <p class="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">Seu painel estratégico foi configurado e está pronto para uso. O algoritmo já processou suas diretrizes.</p>
            </div>
            <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-loose">
              Você pode ajustar qualquer detalhe a qualquer momento clicando no menu <span class="text-blue-400">Configurações</span>.
            </div>
          </div>
        `
        break
    }

    body.innerHTML = html
  }

  nextOnboardingStep() {
    this.saveOnboardingStepData()
    this.onboardingStep++
    this.renderOnboardingStep()
  }

  prevOnboardingStep() {
    this.onboardingStep--
    this.renderOnboardingStep()
  }

  saveOnboardingStepData() {
    const step = this.onboardingStep
    const state = { ...store.state.inputs }

    if (step === 0) {
      state.personalWalletStart =
        document.getElementById('onb_personalWalletStart').value || '0'
      state.revenueWalletStart =
        document.getElementById('onb_revenueWalletStart').value || '0'
    } else if (step === 1) {
      state.taskLevel = document.getElementById('onb_taskLevel').value
      state.taskDailyValue =
        document.getElementById('onb_taskDailyValue').value || '0'
    } else if (step === 2) {
      state.teamBonusToggle = document.getElementById(
        'onb_teamBonusToggle'
      ).checked
      const teamCounts = { ...state.teamCounts }
      Object.keys(teamCounts).forEach(level => {
        teamCounts[level].A =
          parseInt(document.getElementById(`onb_team_${level}_A`).value) || 0
        teamCounts[level].B =
          parseInt(document.getElementById(`onb_team_${level}_B`).value) || 0
        teamCounts[level].C =
          parseInt(document.getElementById(`onb_team_${level}_C`).value) || 0
      })
      state.teamCounts = teamCounts
    } else if (step === 3) {
      state.promotionToggle = document.getElementById(
        'onb_promotionToggle'
      ).checked
      state.promotionLevel = document.getElementById('onb_promotionLevel').value
      state.promotionDay =
        document.getElementById('onb_promotionDay').value || '1'
    } else if (step === 4) {
      state.monthlyIncomeToggle = document.getElementById(
        'onb_monthlyIncomeToggle'
      ).checked
      // Fixed incomes are saved in internal state already via helper
    } else if (step === 5) {
      state.withdrawStrategy = document.getElementById(
        'onb_withdrawStrategy'
      ).value
      state.withdrawTarget =
        document.getElementById('onb_withdrawTarget').value || '0'
      state.withdrawalDaySelect = document.getElementById(
        'onb_withdrawalDaySelect'
      ).value
    }

    store.setState({ inputs: state })
  }

  finishOnboarding() {
    store.updateInput('setupCompleted', true)
    store.saveToStorage() // Force immediate save
    this.closeModal('onboardingModal')
    this.applyStoreToUI()
    this.runCalculation()
    Renderer.toast('Configuração concluída! Aproveite o Gestor SP.', 'success')
  }

  // --- Onboarding Helpers ---
  addOnbFixedIncome() {
    const amount = parseFloat(
      document.getElementById('onb_addIncomeAmount').value
    )
    const day = parseInt(document.getElementById('onb_addIncomeDay').value)
    if (isNaN(amount) || isNaN(day)) return

    const incomes = [...(store.state.inputs.fixedIncomes || [])]
    incomes.push({ amount, day })
    store.updateInput('fixedIncomes', incomes)

    document.getElementById('onb_addIncomeAmount').value = ''
    document.getElementById('onb_addIncomeDay').value = ''
    this.renderOnbFixedIncomeList()
  }

  removeOnbFixedIncome(idx) {
    const incomes = store.state.inputs.fixedIncomes.filter((_, i) => i !== idx)
    store.updateInput('fixedIncomes', incomes)
    this.renderOnbFixedIncomeList()
  }

  renderOnbFixedIncomeList() {
    const container = document.getElementById('onb_fixedIncomeList')
    if (!container) return
    const incomes = store.state.inputs.fixedIncomes || []
    container.innerHTML = incomes
      .map(
        (it, i) => `
      <div class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
        <span class="text-xs text-slate-300 font-bold">R$ ${it.amount.toFixed(2)} <span class="text-slate-500 ml-1">• Dia ${it.day}</span></span>
        <button onclick="app.removeOnbFixedIncome(${i})" class="text-red-500 hover:text-red-400 p-1"><i class="fas fa-trash-alt text-[10px]"></i></button>
      </div>
    `
      )
      .join('')
  }

  setOnbWithdrawTarget(val, btn) {
    document.getElementById('onb_withdrawTarget').value = val
    document
      .querySelectorAll('.onb-tier-btn')
      .forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  }

  addOnbInvestment() {
    const name = document.getElementById('onb_newInvName').value
    const val = parseFloat(document.getElementById('onb_newInvVal').value)
    const date = document.getElementById('onb_newInvDate').value
    const days = parseInt(document.getElementById('onb_newInvDays').value)
    const rate = parseFloat(document.getElementById('onb_newInvRate').value)

    if (!name || isNaN(val) || !date || isNaN(days))
      return Renderer.toast('Dados incompletos', 'error')

    const newInv = {
      id: Date.now(),
      name,
      val,
      date,
      days,
      rate,
      wallet: 'none'
    }
    store.setState({ portfolio: [...store.state.portfolio, newInv] })

    // Reset inputs
    document.getElementById('onb_newInvName').value = ''
    document.getElementById('onb_newInvVal').value = ''
    document.getElementById('onb_newInvDays').value = ''
    this.renderOnbPortfolioList()
  }

  removeOnbInvestment(id) {
    const portfolio = store.state.portfolio.filter(p => p.id !== id)
    store.setState({ portfolio })
    this.renderOnbPortfolioList()
  }

  renderOnbPortfolioList() {
    const container = document.getElementById('onb_portfolioList')
    if (!container) return
    const portfolio = store.state.portfolio || []
    container.innerHTML = portfolio
      .map(
        p => `
      <div class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
        <div>
          <span class="text-xs font-bold text-white block">${p.name}</span>
          <span class="text-[10px] text-slate-500">R$ ${p.val.toFixed(2)} • ${p.days}d</span>
        </div>
        <button onclick="app.removeOnbInvestment(${p.id})" class="text-red-500 hover:text-red-400 p-2"><i class="fas fa-trash-alt"></i></button>
      </div>
    `
      )
      .join('')
  }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
  new App()
})
