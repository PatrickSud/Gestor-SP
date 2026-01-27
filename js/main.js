import { store } from './store.js'
import { Formatter } from './utils/formatter.js'
import { Calculator } from './core/calculator.js'
import { Renderer } from './ui/render.js'
import { ChartManager } from './ui/chart.js'
import { authService } from './auth-service.js'

/**
 * Main Application Controller
 */

class App {
  constructor() {
    this.init()
  }

  init() {
    // Global access for onclick handlers in HTML (temporary until fully migrated)
    window.app = this

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

    Renderer.toast('Sistema inicializado com sucesso', 'success')
  }

  // --- Core Logic ---
  runCalculation(save = true) {
    const results = Calculator.calculate(
      store.state.inputs,
      store.state.portfolio,
      store.state.selectedWeeks,
      store.state.realizedWithdrawals
    )

    if (results) {
      store.setResults(results.results)
      store.setDailyData(results.dailyData)

      // Update UI components
      Renderer.renderResults(results.results)
      Renderer.renderTable(
        results.dailyData,
        parseInt(store.state.inputs.viewPeriodSelect),
        store.state.inputs.dataInicio
      )
      Renderer.renderCalendar(
        store.state.inputs.dataInicio,
        results.dailyData,
        results.cycleEnds
      )
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

      Renderer.renderSimulationSummary(results.results, store.state.inputs)

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
        'commitBase',
        'search'
      ]
      if (skip.some(s => el.id.startsWith(s))) return

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
  }

  applyStoreToUI() {
    const { inputs } = store.state
    for (const [id, value] of Object.entries(inputs)) {
      const el = document.getElementById(id)
      if (!el) continue

      if (el.type === 'checkbox') el.checked = value
      else el.value = value
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

    if (!name || isNaN(val) || !date || isNaN(days) || isNaN(rate)) {
      return Renderer.toast('Preencha todos os campos do investimento', 'error')
    }

    const newInv = { id: Date.now(), name, val, date, days, rate }
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
    chevron.classList.toggle('rotate-180', isHidden)
  }

  syncBalance() {
    const projected = Formatter.fromCents(store.state.results.finalBalance) // Simple sync for today would be better
    // Based on original logic: projectedTodayBalance
    // Need to extract today's balance from dailyData
    const todayStr = new Date().toISOString().split('T')[0]
    const todayData = store.state.dailyData[todayStr]

    if (!todayData)
      return Renderer.toast('Dados de hoje não disponíveis', 'error')

    const val = Formatter.fromCents(todayData.endBal)

    if (
      confirm(
        `Deseja atualizar o Saldo Inicial para R$ ${val.toFixed(2)}?\nIsso altera a base de cálculo.`
      )
    ) {
      store.updateInput('currentWalletBalance', val.toFixed(2))
      document.getElementById('currentWalletBalance').value = val.toFixed(2)
      this.runCalculation()
      Renderer.toast('Saldo sincronizado')
    }
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
      items.push({
        label: isRealized ? 'Saque Realizado' : 'Saque Planejado',
        val: isRealized ? data.outWithdraw : Math.floor(data.tier * 0.9),
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

    // Withdraw Action Section (Keep logic)
    const wSec = document.getElementById('modalWithdrawSection')
    const canWithdraw = data.tier > 0 || data.status !== 'none'
    if (canWithdraw) {
      wSec.classList.remove('hidden')
      const amountToDisplay =
        data.status === 'realized'
          ? data.outWithdraw
          : Math.floor(data.tier * 0.9)
      document.getElementById('modalWithdrawVal').innerText =
        Formatter.currency(amountToDisplay)

      const status = document.getElementById('modalWithdrawStatus')
      if (data.status === 'realized') {
        status.innerText = 'SAQUE CONFIRMADO'
        status.className = 'text-blue-400 font-bold uppercase mt-1'
      } else {
        const label =
          data.status === 'planned' ? 'SAQUE PLANEJADO' : 'DISPONÍVEL'
        status.innerHTML = `
                      <div class="text-emerald-500 font-bold uppercase mt-1 mb-2">${label}</div>
                      <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)})" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
                          <i class="fas fa-hand-holding-usd mr-1"></i> Realizar Saque Agora
                      </button>
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
    Renderer.renderTimeline(
      store.state.dailyData,
      parseInt(store.state.inputs.viewPeriodSelect),
      store.state.inputs.dataInicio
    )
    this.openModal('timelineModal')
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
                             <span class="block text-sm font-bold text-white">${Formatter.currency(results.totalIncomeCents)}</span>
                        </div>
                        <div class="bg-slate-900 p-2 rounded border border-slate-700">
                             <span class="block text-[10px] text-slate-500 uppercase mb-1">Lucro Invest.</span>
                             <span class="block text-sm font-bold text-emerald-400">${Formatter.currency(results.totalInvProfitCents)}</span>
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
      const currentMonthStr = new Date().toISOString().substring(0, 7)
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
      const currentMonthStr = new Date().toISOString().substring(0, 7)
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

    let portfolio = [...store.state.portfolio]
    let currentVal = capIni
    let currentDateStr = new Date().toISOString().split('T')[0]

    for (let i = 0; i < reps; i++) {
      portfolio.push({
        id: Date.now() + i,
        name: `${baseName} (${i + 1}/${reps})`,
        val: parseFloat(currentVal.toFixed(2)),
        date: currentDateStr,
        days: days,
        rate: rate
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

  executeWithdrawal(date, amount) {
    if (
      !confirm(
        `Confirma o saque de R$ ${amount}? \nIsso será registrado como um 'Saque Realizado' e influenciará sua projeção.`
      )
    )
      return

    const realizedWithdrawals = [
      ...(store.state.realizedWithdrawals || []),
      { date, amount }
    ]
    store.setState({ realizedWithdrawals })

    Renderer.toast('Saque realizado com sucesso!', 'success')
    this.runCalculation()
    this.openDayDetails(date) // Refresh modal
  }

  deleteWithdrawal(index) {
    if (!confirm('Deseja excluir este registro de saque?')) return
    const list = [...(store.state.realizedWithdrawals || [])]
    list.splice(index, 1)
    store.setState({ realizedWithdrawals: list })
    Renderer.toast('Saque removido')
    this.runCalculation()
    this.openCardDetails('history')
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

  exportToCSV() {
    const dailyData = store.state.dailyData
    let csv = 'Data,Saldo Inicial,Retorno,Renda,Aporte,Saque,Saldo Final\n'

    Object.keys(dailyData)
      .sort()
      .forEach(date => {
        const d = dailyData[date]
        csv += `${date},${Formatter.fromCents(d.startBal)},${Formatter.fromCents(d.inReturn)},${Formatter.fromCents(d.inIncome)},0,${Formatter.fromCents(d.outWithdraw)},${Formatter.fromCents(d.endBal)}\n`
      })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.setAttribute('hidden', '')
    a.setAttribute('href', url)
    a.setAttribute('download', `gestor_sp_${store.state.currentProfileId}.csv`)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
  new App()
})
