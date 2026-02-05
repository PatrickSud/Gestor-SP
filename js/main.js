import { store } from './store.js'
import { Formatter } from './utils/formatter.js'
import { Calculator } from './core/calculator.js'
import { Renderer } from './ui/render.js'
import { ChartManager } from './ui/chart.js'
import { authService } from './auth-service.js'
import { Exporter } from './utils/exporter.js'
import { aiService } from './ai-service.js'

/**
 * Main Application Controller
 */

class App {
  constructor() {
    this.insightsTimer = null
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
        const start = store.state.inputs.customViewStartDate || Formatter.getTodayDate()
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

      // Goals & Alerts
      Renderer.renderGoals(store.state.goals, results.dailyData, idx =>
        this.removeGoal(idx)
      )
      Renderer.renderAlerts(store.state.portfolio)

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

        if (el.id === 'monthlyIncomeToggle') {
          document
            .getElementById('monthlyIncomeContainer')
            .classList.toggle('hidden', !val)
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
        this.updateAiButtonVisibility()
        if (e.target.value.trim()) Renderer.toast('API Key do Gemini salva', 'success')
      })
    }

    if (openaiKeyInp) {
      openaiKeyInp.addEventListener('change', e => {
        store.updateInput('openaiApiKey', e.target.value)
        this.updateAiButtonVisibility()
        if (e.target.value.trim()) Renderer.toast('API Key da OpenAI salva', 'success')
      })
    }

    if (groqKeyInp) {
      groqKeyInp.addEventListener('change', e => {
        store.updateInput('groqApiKey', e.target.value)
        this.updateAiButtonVisibility()
        if (e.target.value.trim()) Renderer.toast('API Key da Groq salva', 'success')
      })
    }

    if (groqModelInp) {
      groqModelInp.addEventListener('change', e => {
        store.updateInput('groqModel', e.target.value)
        Renderer.toast(`Modelo alterado para ${e.target.options[e.target.selectedIndex].text}`, 'info')
      })
    }

    if (providerSelect) {
      providerSelect.addEventListener('change', e => {
        const val = e.target.value
        store.updateInput('aiProvider', val)
        
        // Limpar histórico ao trocar de provedor para evitar conflitos de formato
        aiService.clearHistory()
        
        // Toggle visibility of config sections
        document.getElementById('geminiConfig')?.classList.toggle('hidden', val !== 'gemini')
        document.getElementById('openaiConfig')?.classList.toggle('hidden', val !== 'openai')
        document.getElementById('groqConfig')?.classList.toggle('hidden', val !== 'groq')
        
        this.updateAiButtonVisibility()
      })
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
  }

  // --- Orientation Mode ---
  setupOrientationMode() {
    const mq = window.matchMedia('(orientation: landscape)')
    const apply = () => {
      const isLandscape =
        typeof mq.matches === 'boolean'
          ? mq.matches
          : window.innerWidth > window.innerHeight
      document.body.classList.toggle('landscape-mode', isLandscape)
    }
    apply()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply)
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(apply)
    }
    window.addEventListener('resize', apply)
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

    // Restore Toggles
    document
      .getElementById('monthlyIncomeContainer')
      .classList.toggle('hidden', !inputs.monthlyIncomeToggle)
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
    document.getElementById('geminiConfig')?.classList.toggle('hidden', provider !== 'gemini')
    document.getElementById('openaiConfig')?.classList.toggle('hidden', provider !== 'openai')
    document.getElementById('groqConfig')?.classList.toggle('hidden', provider !== 'groq')

    // Restore Future Toggle Visuals
    const futureOn = inputs.futureToggle === 'true'
    document
      .getElementById('futureConfigPanel')
      .classList.toggle('hidden', !futureOn)
    this.updateFutureToggleVisual(futureOn)

    // Render Initial Pieces
    Renderer.renderFixedIncomes(inputs)
    Renderer.renderWithdrawButtons(val => {
      store.updateInput('withdrawTarget', val)
      this.runCalculation()
      Renderer.renderWithdrawButtons(null, val) // Refresh selection
    }, inputs.withdrawTarget)

    this.restoreWeeksUI()
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
  }

  toggleFuturePlanning() {
    const current = store.state.inputs.futureToggle === 'true'
    const newVal = !current
    store.updateInput('futureToggle', String(newVal))

    document
      .getElementById('futureConfigPanel')
      .classList.toggle('hidden', !newVal)
    this.updateFutureToggleVisual(newVal)
    this.runCalculation()
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
                        <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)}, 'revenue')" class="w-full ${isPlanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'} text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
                            <i class="fas fa-hand-holding-usd mr-1"></i> Sacar da Receita
                        </button>
                        <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)}, 'personal')" class="w-full ${isPlanned ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'} text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
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
      const todayEl = document.querySelector('.timeline-day-header.today')
      if (todayEl) {
        todayEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 100)
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
      const history = (store.state.realizedWithdrawals || []).map((w, i) => ({
        ...w,
        index: i
      }))
      history.sort((a, b) => b.date.localeCompare(a.date))
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
      const grossList =
        history.length === 0
          ? '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>'
          : history
              .map(
                w => `
                    <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1 group">
                        <span class="text-slate-400">${Formatter.dateDisplay(w.date)}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-blue-400 font-bold">${Formatter.currency(Formatter.toCents(w.amount))}</span>
                            <button onclick="app.deleteWithdrawal(${w.index})" class="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>`
              )
              .join('')
      const netList =
        history.length === 0
          ? '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>'
          : history
              .map(
                w => `
                    <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1 group">
                        <span class="text-slate-400">${Formatter.dateDisplay(w.date)}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-blue-400 font-bold">${Formatter.currency(Math.floor(Formatter.toCents(w.amount) * 0.9))}</span>
                            <button onclick="app.deleteWithdrawal(${w.index})" class="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>`
              )
              .join('')
      this._historyGrossListHtml = grossList
      this._historyNetListHtml = netList
      this._historyGrossMonth = grossMonthTotal
      this._historyNetMonth = netMonthTotal
      html = `
                <h3 class="text-lg font-bold text-blue-400 mb-4"><i class="fas fa-history mr-2"></i>Histórico de Saques</h3>
                <div class="flex gap-2 mb-3">
                  <button id="historyTabNet" class="px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-white bg-slate-700">Líquido</button>
                  <button id="historyTabGross" class="px-2 py-1 text-[10px] font-bold rounded border border-slate-700 text-slate-400 hover:text-white">Bruto</button>
                </div>
                <div class="text-center mb-4">
                    <span class="text-3xl font-black text-white" id="historyMonthTotal"></span>
                    <p class="text-[10px] text-slate-500">Sacado no Mês Corrente</p>
                </div>
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Histórico Completo</p>
                <div class="max-h-[200px] overflow-y-auto custom-scrollbar" id="historyList"></div>
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
                <h3 class="text-lg font-bold text-yellow-400 mb-4"><i class="fas fa-clock mr-2"></i>Próximos Saques</h3>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4 text-center">
                    <span class="text-xs text-slate-400 block">Próxima Data Estimada</span>
                    <span class="text-xl font-bold text-white">${results.nextWithdrawDate !== '-' ? Formatter.dateDisplay(results.nextWithdrawDate) : '---'}</span>
                    <span class="text-sm font-bold text-yellow-400 block mt-1">${Formatter.currency(results.nextWithdraw)}</span>
                </div>
                
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Previsão (Próx. 8 Semanas)</p>
                <div class="max-h-[150px] overflow-y-auto custom-scrollbar">${listHtml}</div>
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
    const data = store.exportAllData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup_gestor_sp_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    Renderer.toast('Backup gerado com sucesso!', 'success')
  }

  importBackup(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      if (store.importAllData(e.target.result)) {
        Renderer.toast('Backup restaurado com sucesso!', 'success')
        this.applyStoreToUI()
        this.runCalculation()
      } else {
        Renderer.toast('Erro ao importar backup. Formato inválido.', 'error')
      }
    }
    reader.readAsText(file)
  }

  executeWithdrawal(date, amount, walletType = 'revenue') {
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
      { date, amount: finalAmount.toFixed(2), wallet: walletType }
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
    const todayPersonal = Formatter.fromCents(store.state.results.todayPersonalBalance || 0)
    const todayRevenue = Formatter.fromCents(store.state.results.todayRevenueBalance || 0)

    const html = `
      <div class="space-y-6">
        <div class="flex items-center gap-3 border-b border-slate-700 pb-3">
          <div class="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center">
            <i class="fas fa-adjust text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Ajuste de Saldo (Hoje)</h3>
            <p class="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Edite o valor final para corrigir</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Pessoal -->
          <div class="bg-slate-900/50 p-4 rounded-xl border border-indigo-500/30">
            <div class="flex justify-between items-center mb-2">
              <label class="text-[10px] text-indigo-300 font-bold uppercase">Carteira Pessoal</label>
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
            <p class="text-[10px] text-slate-500 mt-2">O sistema calculará a diferença automaticamente.</p>
          </div>

          <!-- Receita -->
          <div class="bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30">
            <div class="flex justify-between items-center mb-2">
              <label class="text-[10px] text-emerald-300 font-bold uppercase">Carteira de Receita</label>
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
            <p class="text-[10px] text-slate-500 mt-2">O sistema calculará a diferença automaticamente.</p>
          </div>
        </div>
        
        <div class="border-t border-slate-700/50 pt-4 mt-2">
           <button onclick="app.closeModal('cardModal')" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors text-xs uppercase tracking-widest">
             Fechar
           </button>
        </div>
      </div>
    `
    document.getElementById('cardModalContent').innerHTML = html
    this.openModal('cardModal')
  }

  deleteWithdrawal(index) {
    if (!confirm('Deseja excluir este registro de saque?')) return
    const list = [...(store.state.realizedWithdrawals || [])]
    const date = list[index] ? list[index].date : null
    list.splice(index, 1)
    store.setState({ realizedWithdrawals: list })
    Renderer.toast('Saque removido')
    this.runCalculation()
    if (date) this.openDayDetails(date)
    else this.openCardDetails('history')
  }

  // --- Utils ---
  openModal(id) {
    document.getElementById(id).classList.remove('hidden')
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

    const provider = aiService.getProvider()
    const isConfigured = aiService.isConfigured()

    if (isConfigured) {
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
      const providerName = aiService.getProvider() === 'openai' ? 'ChatGPT' : 'Gemini'
      Renderer.toast(`Configure sua API Key do ${providerName} nas configurações`, 'error')
      this.toggleSidebar()
      return
    }
    this.openModal('aiChatModal')
    document.getElementById('aiChatInput')?.focus()
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
    messagesContainer.insertAdjacentHTML('beforeend', `
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
    `)
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
      container.insertAdjacentHTML('beforeend', `
        <div class="ai-message flex justify-end">
          <div class="max-w-[80%] bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl rounded-tr-sm p-3 shadow-lg">
            <p class="text-sm text-white">${this.escapeHtml(content)}</p>
          </div>
        </div>
      `)
    } else {
      const bgClass = isError ? 'bg-red-900/30 border-red-700/50' : 'bg-slate-800 border-slate-700'
      container.insertAdjacentHTML('beforeend', `
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
      `)
    }

    container.scrollTop = container.scrollHeight
  }

  formatAiResponse(text) {
    // Basic markdown formatting
    return text
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
    if (!aiService.isConfigured()) {
      // Hide panel if AI not configured, but still show local insights
      this.renderInsights(aiService.analyzeData())
      return
    }

    try {
      const insights = await aiService.generateAiInsights()
      this.renderInsights(insights)
    } catch (error) {
      console.warn('Erro ao carregar insights:', error)
      // Fallback to local insights
      this.renderInsights(aiService.analyzeData())
    }
  }

  renderInsights(insights) {
    const panel = document.getElementById('insightsPanel')
    const container = document.getElementById('insightsContainer')
    const badge = document.getElementById('insightsBadge')

    if (!panel || !container) return

    if (!insights || insights.length === 0) {
      panel.classList.add('hidden')
      return
    }

    // Show panel
    panel.classList.remove('hidden')

    // Update badge
    if (badge) {
      badge.textContent = insights.length
      badge.classList.remove('hidden')
    }

    // Update floating button badge
    const aiBtnBadge = document.getElementById('aiBtnBadge')
    if (aiBtnBadge) {
      aiBtnBadge.textContent = insights.length
      aiBtnBadge.classList.toggle('hidden', insights.length === 0)
    }

    // Render insight cards
    container.innerHTML = insights.slice(0, 6).map((insight, idx) => `
      <div class="insight-card ${insight.type}" style="animation-delay: ${idx * 0.1}s" data-marco-key="${insight.marcoKey || ''}">
        <div class="flex items-start gap-3">
          <span class="insight-icon">${insight.icon}</span>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold text-white mb-1">${insight.title}</h4>
            <p class="text-[10px] text-slate-400 leading-relaxed">${insight.message}</p>
            ${insight.action ? `
              <button onclick="app.handleInsightAction('${insight.action}', '${insight.marcoKey || ''}')" 
                class="insight-action mt-2">
                ${insight.action}
              </button>
            ` : ''}
          </div>
          ${insight.type === 'achievement' ? `
            <button onclick="app.dismissInsight(this, '${insight.marcoKey}')" 
              class="text-slate-500 hover:text-white text-xs p-1" title="Marcar como visto">
              <i class="fas fa-check"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('')
  }

  async refreshInsights() {
    const icon = document.getElementById('refreshInsightsIcon')
    if (icon) {
      icon.classList.add('spin-animation')
    }

    // Invalidate cache and reload
    aiService.invalidateInsightsCache()
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
        document.getElementById('investmentsSection')?.scrollIntoView({ behavior: 'smooth' })
        break
      case 'Abrir Simulador':
        const futureToggle = document.getElementById('futureToggle')
        if (futureToggle && !futureToggle.checked) {
          futureToggle.click()
        }
        document.getElementById('futureSection')?.scrollIntoView({ behavior: 'smooth' })
        break
      default:
        // Open AI chat for more details
        if (aiService.isConfigured()) {
          this.openAiChat()
        }
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
        // Check if any insights left
        const container = document.getElementById('insightsContainer')
        if (container && container.children.length === 0) {
          document.getElementById('insightsPanel')?.classList.add('hidden')
        }
      }, 300)
    }
  }
}


// Start the app
window.addEventListener('DOMContentLoaded', () => {
  new App()
})
