import { Formatter } from '../utils/formatter.js'
import { Calculator } from '../core/calculator.js'
import { NotificationManager } from '../utils/notification-manager.js'

/**
 * UI Renderer for the Gestor SP application
 */

export const Renderer = {
  // --- Elements Cache ---
  els: {
    tabelaBody: () => document.getElementById('tabelaBody'),
    calendarContainer: () => document.getElementById('calendarContainer'),
    portfolioList: () => document.getElementById('portfolioList'),
    profileList: () => document.getElementById('profileList'),
    tiersGrid: () => document.getElementById('tiersGrid'),

    // KPIs
    resLucroLiquido: () => document.getElementById('resLucroLiquido'),
    resRoi: () => document.getElementById('resRoi'),
    resFinal: () => document.getElementById('resFinal'),
    resTotalWithdrawn: () => document.getElementById('resTotalWithdrawn'),
    resMelhorSaque: () => document.getElementById('resMelhorSaque'),
    navTotalBalance: () => document.getElementById('navTotalBalance'),
    currentProfileName: () => document.getElementById('currentProfileName'),
    resCardIncome: () => document.getElementById('resCardIncome'),
    resCardInvestProfit: () => document.getElementById('resCardInvestProfit'),

    // Summaries
    summaryInvCount: () => document.getElementById('summaryInvCount'),
    summaryInvProfit: () => document.getElementById('summaryInvProfit'),
    summaryRealizedProfit: () => document.getElementById('summaryRealizedProfit'),
    summaryInvTotal: () => document.getElementById('summaryInvTotal'),
    
    // Today's Closing
    todayBalanceDisplay: () => document.getElementById('todayBalanceDisplay'),
    todayChangesDisplay: () => document.getElementById('todayChangesDisplay'),
    todayInDisplay: () => document.getElementById('todayInDisplay'),
    todayOutDisplay: () => document.getElementById('todayOutDisplay'),
    todayTransactionsList: () => document.getElementById('todayTransactionsList')
  },

  // --- Render Methods ---
  renderPortfolio(portfolio, onRemove) {
    const list = this.els.portfolioList()
    if (!list) return

    list.innerHTML = ''
    let totalVal = 0
    let totalProfit = 0

    if (portfolio.length === 0) {
      list.innerHTML =
        '<p class="text-center text-[10px] text-slate-500 py-4 italic">Nenhum investimento ativo</p>'
    }

    const todayStr = Formatter.getTodayDate()

    // Sort: Active first (by date), then Expired (by date)
    const sorted = [...portfolio].sort((a, b) => {
      const aEndStr = Formatter.addDays(a.date, a.days)
      const bEndStr = Formatter.addDays(b.date, b.days)
      const aExpired = aEndStr < todayStr
      const bExpired = bEndStr < todayStr

      if (aExpired && !bExpired) return 1
      if (!aExpired && bExpired) return -1
      
      const aEnd = new Date(aEndStr)
      const bEnd = new Date(bEndStr)
      
       // For active: closest end date first
      if (!aExpired) return aEnd - bEnd

       // For expired: most recent end date first (top of the expired list)
      return bEnd - aEnd
    })

    sorted.forEach(p => {
      const valCents = Formatter.toCents(p.val)
      const profitCents = Math.floor(valCents * (p.rate / 100) * p.days)
      totalVal += valCents
      totalProfit += profitCents

      const endDateStr = Formatter.addDays(p.date, p.days)
      const isExpired = endDateStr < todayStr
      
      const retornoStr = Formatter.dateDisplay(endDateStr)

      const walletLabel =
        p.wallet === 'personal'
          ? ' • <span class="text-indigo-400">Pess.</span>'
          : p.wallet === 'revenue'
            ? ' • <span class="text-emerald-400">Rec.</span>'
            : ''

      const containerClass = isExpired 
        ? 'bg-slate-800/50 p-2.5 rounded-lg flex justify-between items-center text-xs border border-slate-700/30 hover:bg-slate-700/50 transition-colors group relative overflow-hidden opacity-60' 
        : 'bg-slate-800 p-2.5 rounded-lg flex justify-between items-center text-xs border border-slate-700/50 hover:bg-slate-700 transition-colors group relative overflow-hidden'

      const nameClass = isExpired
        ? 'text-slate-500 font-bold block line-through decoration-slate-600'
        : 'text-slate-300 font-bold block'

      const li = document.createElement('li')
      li.className = containerClass
      li.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 ${isExpired ? 'bg-slate-600' : 'bg-blue-500'} opacity-50"></div>
                <div class="flex items-center gap-3 pl-2">
                     <div>
                        <span class="${nameClass}">${p.name || 'Ativo'}</span>
                        <span class="text-[10px] text-slate-500">${Formatter.dateDisplay(p.date)} • ${p.rate}% (${p.days}d)${walletLabel}</span>
                        <span class="text-[10px] ${isExpired ? 'text-slate-500' : 'text-yellow-400'}">Retorno: ${retornoStr}</span>
                     </div>
                </div>
                <div class="text-right">
                     <span class="block font-bold ${isExpired ? 'text-slate-500 line-through' : 'text-white'} text-[10px]">Ini: ${Formatter.currency(valCents)}</span>
                     <span class="block font-bold ${isExpired ? 'text-slate-500' : 'text-emerald-400'} text-[11px]">${isExpired ? 'Finalizado' : 'Final: ' + Formatter.currency(valCents + profitCents)}</span>
                     <button class="text-[9px] text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 remove-btn" data-id="${p.id}">
                        <i class="fas fa-times"></i>
                     </button>
                </div>
            `
      li.querySelector('.remove-btn').onclick = e => {
        e.stopPropagation()
        onRemove(p.id)
      }
      list.appendChild(li)
    })

    // Calculate Active vs Realized
    let activeVal = 0
    let activeProfit = 0
    let realizedProfit = 0
    let activeCount = 0

    portfolio.forEach(p => {
        const valCents = Formatter.toCents(p.val)
        const profitCents = Math.floor(valCents * (p.rate / 100) * p.days)
        const endStr = Formatter.addDays(p.date, p.days)
        const isExpired = endStr < todayStr

        if (isExpired) {
            realizedProfit += profitCents
        } else {
            activeVal += valCents
            activeProfit += profitCents
            activeCount++
        }
    })

    this.els.summaryInvCount().innerText = `${activeCount} ativos`
    this.els.summaryInvTotal().innerText = `Total Ativo: ${Formatter.currency(activeVal)}`
    this.els.summaryInvProfit().innerText = `Lucro Est: ${Formatter.currency(activeProfit)}`
    
    if(this.els.summaryRealizedProfit()) {
        this.els.summaryRealizedProfit().innerText = `Realizado: ${Formatter.currency(realizedProfit)}`
    }
  },

  renderResults(results) {
    // Card 1: Lucro Líquido
    this.els.resLucroLiquido().innerText = Formatter.currency(results.netProfit)
    
    // Updates for requested detail view
    // Updates for requested detail view
    if (this.els.resCardIncome()) {
        this.els.resCardIncome().innerText = `Renda: ${Formatter.currency(results.totalIncome || 0)}`
    }
    if (this.els.resCardInvestProfit()) {
        const profit = results.totalInvestmentProfit !== undefined ? results.totalInvestmentProfit : 0
        this.els.resCardInvestProfit().innerText = `Lucro: ${Formatter.currency(profit)}`
    }

    // Card 2: Histórico de Saques
    const resMonthWithdraw = document.getElementById('resMonthWithdraw')
    if (resMonthWithdraw)
      resMonthWithdraw.innerText = Formatter.currency(
        results.currentMonthWithdrawn
      )

    // Card 3: Saldo Atual/Final
    const resCurrentBalance = document.getElementById('resCurrentBalance')
    if (resCurrentBalance)
      resCurrentBalance.innerText = Formatter.currency(
        results.currentBalanceToday
      )

    const resProjectedMonthEnd = document.getElementById('resProjectedMonthEnd')
    if (resProjectedMonthEnd)
      resProjectedMonthEnd.innerText = `Final Mês: ${Formatter.currency(results.projectedEndOfMonthBalance)}`

    const projectedBalanceDisplay = document.getElementById(
      'projectedBalanceDisplay'
    )
    if (projectedBalanceDisplay)
      projectedBalanceDisplay.innerText = Formatter.currency(
        results.finalBalance
      )

    // Card 4: Próximo Saque
    const resNextDate = document.getElementById('resNextDate')
    if (resNextDate)
      resNextDate.innerText =
        results.nextWithdrawDate !== '-'
          ? Formatter.dateDisplay(results.nextWithdrawDate)
          : '---'

    const resNextValue = document.getElementById('resNextValue')
    if (resNextValue)
      resNextValue.innerText = `Est: ${Formatter.currency(results.nextWithdraw)}`

    const headerPersonal = document.getElementById('headerPersonalBalance')
    const headerRevenue = document.getElementById('headerRevenueBalance')
    if (headerPersonal)
      headerPersonal.innerText = Formatter.currency(
        results.todayPersonalBalance
      )
    if (headerRevenue)
      headerRevenue.innerText = Formatter.currency(results.todayRevenueBalance)

    // Remove references to deleted elements (Advanced Performance Row)
    // If elements don't exist, getElementById returns null, so we should check before accessing properties if we kept the cache.
    // Since we are rewriting renderResults, we just don't try to update them.

    const profitEl = this.els.resLucroLiquido()
    if (results.netProfit < 0) {
      profitEl.classList.replace('text-white', 'text-red-400')
    } else {
      profitEl.classList.replace('text-red-400', 'text-white')
    }
  },

  renderTodayClosing(dailyData) {
    const today = Formatter.getTodayDate()
    const data = dailyData[today]
    
    const balanceEl = this.els.todayBalanceDisplay()
    const changesEl = this.els.todayChangesDisplay()
    const inEl = this.els.todayInDisplay()
    const outEl = this.els.todayOutDisplay()

    if (!balanceEl || !data) {
        if(balanceEl) balanceEl.innerText = Formatter.currency(0)
        if(inEl) inEl.innerText = '+R$ 0,00'
        if(outEl) outEl.innerText = '-R$ 0,00'
        if(changesEl) changesEl.innerText = '0 movimentações'
        return
    }

    // Total Entradas = inIncome + inReturn + inAdjustmentPersonal (if > 0) + inAdjustmentRevenue (if > 0)
    const totalIn = (data.inIncome || 0) + 
                    (data.inReturn || 0) + 
                    (data.inAdjustmentPersonal > 0 ? data.inAdjustmentPersonal : 0) + 
                    (data.inAdjustmentRevenue > 0 ? data.inAdjustmentRevenue : 0)

    // Total Saídas = outWithdraw + outInvest + adjustments (if < 0)
    const totalOut = (data.outWithdraw || 0) + 
                     (data.outInvest || 0) + 
                     (data.inAdjustmentPersonal < 0 ? Math.abs(data.inAdjustmentPersonal) : 0) + 
                     (data.inAdjustmentRevenue < 0 ? Math.abs(data.inAdjustmentRevenue) : 0)

    // Count operations
    let ops = 0
    if (data.inIncomeTeam > 0) ops++
    if (data.inIncomeTask > 0) ops++
    if (data.inIncomeRecurring > 0) ops++
    if (data.inReturn > 0) ops++
    if (data.outInvest > 0) ops++
    if (data.outWithdraw > 0) ops++
    if (data.inAdjustmentPersonal !== 0 || data.inAdjustmentRevenue !== 0) ops++

    balanceEl.innerText = Formatter.currency(data.endBal)
    inEl.innerText = `+${Formatter.currency(totalIn)}`
    outEl.innerText = `-${Formatter.currency(totalOut)}`
    
    // Removido contador de movimentações conforme solicitado
    changesEl.innerText = ''

    // Build transactions list
    const listEl = this.els.todayTransactionsList()
    if (!listEl) return

    const transactionItems = []

    // Helper to add specialized items
    const addItem = (icon, label, val, type) => {
        const isPositive = type === 'in'
        const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400'
        const iconColor = isPositive ? 'text-emerald-500' : 'text-red-500'
        const sign = isPositive ? '+' : '-'
        
        transactionItems.push(`
            <div class="flex justify-between items-center text-[10px] text-slate-300 bg-slate-900/40 p-2 rounded-lg border border-slate-700/30 hover:bg-slate-700/40 transition-colors">
                <div class="flex items-center gap-2">
                    <i class="fas ${icon} ${iconColor} w-3 text-center"></i>
                    <span class="font-medium">${label}</span>
                </div>
                <span class="font-bold ${colorClass} font-mono">${sign}${Formatter.currency(Math.abs(val))}</span>
            </div>
        `)
    }

    if (data.inIncomeTeam > 0) addItem('fa-users', 'Bônus de Equipe', data.inIncomeTeam, 'in')
    if (data.inIncomeTask > 0) addItem('fa-check-circle', 'Renda de Tarefas', data.inIncomeTask, 'in')
    if (data.inIncomeRecurring > 0) addItem('fa-calendar-check', 'Renda Fixa', data.inIncomeRecurring, 'in')
    if (data.inIncomePromotion > 0) addItem('fa-award', 'Bônus de Promoção', data.inIncomePromotion, 'in')
    
    if (data.inReturn > 0) {
        const names = (data.maturing || []).map(m => m.name).join(', ')
        addItem('fa-undo', `Retorno de Contrato ${names ? '('+names+')' : ''}`, data.inReturn, 'in')
    }

    if (data.outInvest > 0) addItem('fa-arrow-up-right-from-square', 'Novo Aporte', data.outInvest, 'out')
    
    if (data.outWithdraw > 0) {
        const label = data.status === 'realized' ? 'Saque Realizado' : 'Saque Planejado'
        addItem('fa-hand-holding-usd', label, data.outWithdraw, 'out')
    }

    // Manual Adjustments List
    if (data.adjustments && data.adjustments.length > 0) {
        data.adjustments.forEach(adj => {
            const val = Math.abs(adj.amount || 0)
            const isPositive = adj.amount > 0
            const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400'
            const sign = isPositive ? '+' : '-'
            const walletLabel = adj.wallet === 'personal' ? 'Pessoal' : 'Receita'
            const desc = adj.description || `Ajuste (${walletLabel})`
            
            const deleteBtn = adj.id ? `
                <button onclick="app.deleteManualAdjustment(${adj.id})" class="text-slate-500 hover:text-red-400 p-1 ml-2 transition-colors">
                    <i class="fas fa-trash-alt text-[9px]"></i>
                </button>` : '';

            transactionItems.push(`
                <div class="flex justify-between items-center text-[10px] text-slate-300 bg-slate-900/40 p-2 rounded-lg border border-slate-700/30 hover:bg-slate-700/40 transition-colors">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-pen text-orange-400 w-3 text-center"></i>
                        <span class="font-medium">${desc}</span>
                    </div>
                    <div class="flex items-center">
                        <span class="font-bold ${colorClass} font-mono">${sign}${Formatter.currency(Formatter.toCents(val))}</span>
                        ${deleteBtn}
                    </div>
                </div>
            `)
        })
    }

    if (transactionItems.length > 0) {
        listEl.innerHTML = transactionItems.join('')
    } else {
        listEl.innerHTML = '<p class="text-[10px] text-slate-500 italic text-center py-2">Nenhuma movimentação registrada hoje.</p>'
    }
  },

  renderSimulationSummary(results, inputs, cycleEnds = []) {
    const card = document.getElementById('simSummaryCard')
    if (!card) return
    const futureOn = inputs.futureToggle === 'true'
    const hasSim =
      results &&
      typeof results.simInitial === 'number' &&
      results.simInitial > 0 &&
      results.simCycles > 0
    if (!futureOn || !hasSim) {
      card.classList.add('hidden')
      return
    }
    card.classList.remove('hidden')

    const initialEl = document.getElementById('simSummaryInitial')
    const finalEl = document.getElementById('simSummaryFinal')
    const profitEl = document.getElementById('simSummaryProfit')
    const metaEl = document.getElementById('simSummaryMeta')

    const simInitial = results.simInitial
    const simFinal = results.simFinal
    const simProfit = results.simProfit

    if (initialEl) initialEl.innerText = Formatter.currency(simInitial)
    if (finalEl) finalEl.innerText = Formatter.currency(simFinal)
    if (profitEl) {
      const prefix = simProfit >= 0 ? '+' : ''
      profitEl.innerText = `${prefix}${Formatter.currency(simProfit)}`
    }

    if (metaEl) {
      const dias = inputs.diasCiclo || '0'
      const reps = inputs.repeticoesCiclo || '0'
      const taxa = inputs.taxaDiaria || '0'
      metaEl.innerText = `${dias}d • ${reps}x ciclos • ${taxa}% ao dia`
    }

    // Renderizar lista de retornos (Fim de Ciclo)
    const listEl = document.getElementById('simSummaryCycleEnds')
    if (listEl) {
      const ends = Array.isArray(cycleEnds) ? cycleEnds : []
      if (ends.length > 0) {
        const tags = ends
          .map(d => {
            const [y, m, day] = d.split('-')
            return `<span class="px-2 py-0.5 text-[10px] rounded bg-violet-900/50 text-violet-200 font-bold border border-violet-700/50 shadow-sm">${day}/${m}</span>`
          })
          .join('')

        listEl.innerHTML = `
          <div class="mt-3 pt-3 border-t border-slate-700/50">
            <div class="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider flex items-center gap-1.5">
              <i class="fas fa-calendar-alt text-violet-400"></i> Previsão de Retornos:
            </div>
            <div class="flex flex-wrap gap-1.5">${tags}</div>
          </div>
        `
      } else {
        listEl.innerHTML = `
          <div class="mt-3 pt-3 border-t border-slate-700/50">
            <span class="text-[9px] text-slate-500 italic uppercase font-bold tracking-wider">Sem ciclos concluídos no período.</span>
          </div>
        `
      }
    }
  },

  renderFixedIncomes(inputs) {
    const listEl = document.getElementById('fixedIncomeList')
    if (!listEl) return
    const incomes = (inputs.fixedIncomes || []).map((item, idx) => {
      const val = Formatter.currency(Formatter.toCents(item.amount || 0))
      const day = item.day
      return `
        <div class="flex items-center justify-between bg-slate-900/40 border border-slate-700 rounded px-2 py-1">
          <div class="text-[10px] text-slate-300"><span class="font-bold">${val}</span> • Dia ${day}</div>
          <button class="text-[10px] text-red-400 hover:text-red-300" onclick="app.removeFixedIncome(${idx})"><i class="fas fa-trash-alt"></i></button>
        </div>
      `
    })
    listEl.innerHTML =
      incomes.join('') ||
      '<p class="text-[10px] text-slate-500 italic">Nenhuma renda fixa mensal</p>'
  },

  renderTable(dailyData, viewDays, startDateStr) {
    const body = this.els.tabelaBody()
    if (!body) return

    let html = ''
    const limitDateStr = Formatter.addDays(startDateStr, viewDays)
    const includePast = startDateStr.endsWith('-01') && viewDays >= 28

    const isTeamActive = window.store?.state.inputs.teamBonusToggle === 'true' || window.store?.state.inputs.teamBonusToggle === true
    const thTeam = document.getElementById('thTeamBonus')
    if (thTeam) {
      thTeam.classList.toggle('hidden', !isTeamActive)
    }

    Object.keys(dailyData)
      .sort()
      .forEach(dateStr => {
        if ((!includePast && dateStr < startDateStr) || dateStr > limitDateStr) return
        const d = dailyData[dateStr]
        const isSignificant =
          d.status !== 'none' || d.inReturn > 0 || dateStr === limitDateStr

        if (isSignificant) {
          const teamCol = isTeamActive 
            ? `<td class="p-2 text-right text-cyan-400 font-bold col-money">${d.inIncomeTeam > 0 ? '+' + Formatter.currency(d.inIncomeTeam) : '-'}</td>`
            : ''
          const rendaVal = isTeamActive ? (d.inIncome - (d.inIncomeTeam || 0)) : d.inIncome

          html += `
                    <tr class="hover:bg-slate-700/50 border-b border-slate-700/50 transition-colors cursor-pointer" onclick="app.openDayDetails('${dateStr}')">
                        <td class="p-2 text-slate-200 font-bold border-r border-slate-700/50 whitespace-nowrap">${Formatter.dateDisplay(dateStr)}</td>
                        <td class="p-2 text-right text-slate-400 hidden md:table-cell col-money font-medium">${Formatter.currency(d.startBal)}</td>
                        <td class="p-2 text-right text-emerald-400 font-bold col-money">${d.inReturn > 0 ? '+' + Formatter.currency(d.inReturn) : '-'}</td>
                        ${teamCol}
                        <td class="p-2 text-right text-indigo-400 font-bold col-money">${rendaVal > 0 ? '+' + Formatter.currency(rendaVal) : '-'}</td>
                        <td class="p-2 text-right text-blue-400 font-bold col-money">${d.outInvest > 0 ? '-' + Formatter.currency(d.outInvest) : '-'}</td>
                        <td class="p-2 text-right text-yellow-500 font-bold col-money">${d.outWithdraw > 0 ? '-' + Formatter.currency(d.outWithdraw) : '-'}</td>
                        <td class="p-2 text-right text-white font-bold bg-slate-800/30 border-l border-slate-700/50 col-money text-[12px]">${Formatter.currency(d.endBal)}</td>
                    </tr>
                `
        }
      })
    body.innerHTML = html
  },

  renderCalendar(startDateStr, dailyData, cycleEnds) {
    const container = this.els.calendarContainer()
    if (!container) return

    container.innerHTML = ''
    const [y, m, dayOfMonth] = startDateStr.split('-').map(Number)
    const curDate = new Date(Date.UTC(y, m - 1, 1))
    const todayStr = Formatter.getTodayDate()

    for (let months = 0; months < 12; months++) {
      const monthName = curDate.toLocaleString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      })
      const monthDiv = document.createElement('div')
      monthDiv.className =
        'bg-slate-800 rounded-xl p-3 border border-slate-700/50 h-max'
      monthDiv.innerHTML = `<h4 class="text-center font-bold text-slate-400 capitalize mb-2 border-b border-slate-700/50 pb-1 text-xs">${monthName}</h4>`

      const grid = document.createElement('div')
      grid.className = 'grid grid-cols-7 gap-1'
      ;['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(
        h =>
          (grid.innerHTML += `<div class="text-center text-[8px] text-slate-600 font-bold">${h}</div>`)
      )

      const firstDay = curDate.getUTCDay()
      for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div></div>`

      const daysInMonth = new Date(
        Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth() + 1, 0)
      ).getUTCDate()
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${curDate.getUTCFullYear()}-${String(curDate.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const data = dailyData[dayStr]
        const isCycle = (cycleEnds || []).includes(dayStr)

        let classes = 'cal-day text-slate-400'
        const markers = []

        if (dayStr === todayStr) classes += ' today'
        if (data) {
          const recurringIncome = data.inIncomeRecurring ?? 0
          if (recurringIncome > 0)
            markers.push(
              '<div class="w-1.5 h-1.5 rounded-full bg-sky-400"></div>'
            )
          if (data.inReturn > 0)
            markers.push(
              '<div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div>'
            )
          if (data.status === 'realized') {
            classes += ' withdraw-executed'
            markers.push(
              '<div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>'
            )
          } else if (data.status === 'planned') {
            classes += ' withdraw-day'
            // Diferenciação Visual: Laranja para Pessoal, Amarelo para Receita
            const isPersonal = data.outWithdrawPersonal > 0
            const dotColor = isPersonal ? 'bg-orange-500' : 'bg-yellow-400'
            markers.push(
              `<div class="w-1.5 h-1.5 rounded-full ${dotColor}"></div>`
            )
          }
        }
        if (isCycle)
          markers.push('<div class="w-1.5 h-1.5 rounded-full bg-white"></div>')

        const cell = document.createElement('div')
        cell.className = classes
        const dotsHtml =
          markers.length > 0
            ? `<div class="flex gap-0.5 mb-0.5 absolute bottom-1">${markers.join(
                ''
              )}</div>`
            : ''
        cell.innerHTML = `<span class="z-10">${day}</span>${dotsHtml}`
        if (data && typeof data.endBal === 'number') {
          cell.title = `Saldo: ${Formatter.currency(data.endBal)}`
        }
        cell.onclick = () => app.openDayDetails(dayStr)
        grid.appendChild(cell)
      }

      monthDiv.appendChild(grid)
      container.appendChild(monthDiv)
      curDate.setUTCMonth(curDate.getUTCMonth() + 1)
    }
  },

  renderTimeline(dailyData, viewDays, startDateStr) {
    const container = document.getElementById('timelineContent')
    if (!container) return

    let html = ''
    let creditoPessoal = 0
    let creditoReceita = 0
    let debitoPessoal = 0
    let debitoReceita = 0

    const limitDateStr = Formatter.addDays(startDateStr, viewDays)
    const todayStr = Formatter.getTodayDate()
    const sortedDates = Object.keys(dailyData).sort()

    // Filter dates to view range
    const visibleDates = sortedDates.filter(d => d <= limitDateStr)
    
    // Calculate initial balances relative to the VIEW start date, not necessarily Data Inicio
    // If startDateStr == Data Inicio, it uses initial inputs.
    // If startDateStr > Data Inicio (e.g. Today), it uses the calculated startBal of that day.
    
    const startData = dailyData[startDateStr] || dailyData[sortedDates[0]]
    const isStartOfManagement = (dailyData[sortedDates[0]] ? sortedDates[0] : null) === startDateStr
    
    // We only show "Initial Setup" values if we are at the very beginning of the management history
    const initialPersonal = isStartOfManagement ? Formatter.toCents(window.store?.state.inputs.personalWalletStart || 0) : 0
    const initialRevenue = isStartOfManagement ? Formatter.toCents(window.store?.state.inputs.revenueWalletStart || 0) : 0

    visibleDates.forEach((dateStr, index) => {
      const d = dailyData[dateStr]
      const subItems = []

      if (index === 0) {
        // Show opening balance for the view period
        subItems.push({
          label: isStartOfManagement ? 'Saldo de Abertura' : 'Saldo do Dia',
          sub: isStartOfManagement ? 'Configuração inicial da gestão' : 'Saldo acumulado anterior',
          val: d.startBal, // showing total in the list
          type: 'manual',
          dot: '#f97316',
          tag: 'SALDO'
        })
        
        if (isStartOfManagement) {
             creditoPessoal += initialPersonal
             creditoReceita += initialRevenue
        }
      }

      const taskIncome = d.inIncomeTask ?? (d.inIncome - (d.inIncomeTeam || 0))
      const teamIncome = d.inIncomeTeam ?? 0
      const recurringIncome = d.inIncomeRecurring ?? 0

      if (teamIncome > 0) {
        subItems.push({
          label: 'Bônus de Equipe',
          sub: 'Renda passiva',
          val: teamIncome,
          type: 'team',
          dot: '#2dd4bf', // teal-400
          tag: 'RECEBIDO'
        })
        creditoReceita += teamIncome
      }

      if (taskIncome > 0) {
        subItems.push({
          label: 'Entradas (Tarefas)',
          sub: 'Renda diária',
          val: taskIncome,
          type: 'task',
          dot: '#22c55e',
          tag: 'RECEBIDO'
        })
        creditoReceita += taskIncome
      }

      if (recurringIncome > 0) {
        subItems.push({
          label: 'Entradas (Recorrentes)',
          sub: 'Renda fixa',
          val: recurringIncome,
          type: 'recurring',
          dot: '#0ea5e9',
          tag: 'RECEBIDO'
        })
        creditoReceita += recurringIncome
      }

      if (teamBonusToggle && (d.inIncomeTeam ?? 0) > 0) {
        subItems.push({
          label: 'Bônus de Equipe',
          sub: 'Rede',
          val: d.inIncomeTeam,
          type: 'team',
          dot: '#3b82f6',
          tag: 'RECEBIDO'
        })
        creditoReceita += d.inIncomeTeam
      }

      const promotionIncome = d.inIncomePromotion ?? 0
      if (promotionIncome > 0) {
        subItems.push({
          label: 'Benefícios de Promoção',
          sub: 'Bônus de carreira',
          val: promotionIncome,
          type: 'promotion', // using generic or new type
          dot: '#f472b6', // pink-400
          tag: 'RECEBIDO'
        })
        creditoReceita += promotionIncome
      }

      if (d.inReturn > 0) {
        const names = (d.maturing || []).map(m => m.name).filter(n => !!n) || []
        let subLabel = 'Capital reavido'
        if (names.length === 1) subLabel = names[0]
        else if (names.length > 1) subLabel = `${names[0]} +${names.length - 1}`

        subItems.push({
          label: 'Retorno de Contrato',
          sub: subLabel,
          val: d.inReturn,
          type: 'return',
          dot: '#a855f7',
          tag: 'RECEBIDO'
        })

        creditoPessoal += d.inReturnPrincipal || 0
        creditoReceita += d.inReturnProfit || 0
      }

      if (d.isCycleEnd) {
        subItems.push({
          label: 'Reinvestimento Simulado',
          sub: 'Juros compostos',
          val: d.outReinvest || 0,
          type: 'balance',
          dot: '#8b5cf6',
          tag: 'EFETIVADO'
        })
      }

      // Investment Deductions from Wallet
      if (d.outInvest > 0) {
        // If we have specific portfolio deductions this day
        const dayPort = (window.store?.state.portfolio || []).filter(
          p => p.date === dateStr && p.wallet && p.wallet !== 'none'
        )
        if (dayPort.length > 0) {
          dayPort.forEach(p => {
            const valCents = Formatter.toCents(p.val)
            subItems.push({
              label: `Novo Investimento: ${p.name}`,
              sub: `Dedução: ${p.wallet === 'personal' ? 'Carteira Pessoal' : 'Carteira de Receita'}`,
              val: valCents,
              type: 'withdraw-planned', // reuse styling
              dot: p.wallet === 'personal' ? '#6366f1' : '#10b981',
              tag: 'APORTE'
            })

            if (p.wallet === 'personal') debitoPessoal += valCents
            else debitoReceita += valCents
          })
        } else {
          // Probably a manual adjustment (positive outInvest in Calculator means money leaving?)
          // Wait, manual adjustments were handled below.
          // Actually, I should check how I implemented outInvest in Calculator.
        }
      }

      if (d.status !== 'none') {
        const realized = d.status === 'realized'
        const label = realized ? 'Saque Realizado' : 'Saque Planejado'
        const val = realized
          ? d.outWithdraw
          : d.recommendedWallet === 'personal'
            ? d.tier
            : Math.floor(d.tier * 0.9)
        const itemType = realized ? 'withdraw-realized' : 'withdraw-planned'
        const dotColor = realized ? '#3b82f6' : '#eab308'

        // Identificar Carteira
        let walletName = ''
        if (realized) {
          walletName =
            d.outWithdrawPersonal > 0
              ? 'Carteira Pessoal'
              : 'Carteira de Receita'
        } else {
          walletName =
            d.recommendedWallet === 'personal'
              ? 'Carteira Pessoal'
              : 'Carteira de Receita'
        }

        const subLabel = realized
          ? `Transferência concluída • ${walletName}`
          : `Projeção de saque • ${walletName}`

        subItems.push({
          label,
          sub: subLabel,
          val,
          type: itemType,
          dot: dotColor,
          tag: d.status.toUpperCase()
        })

        if (realized) {
          debitoPessoal += d.outWithdrawPersonal || 0
          debitoReceita += d.outWithdrawRevenue || 0
        }
      }

      const adjPersonal = d.inAdjustmentPersonal || 0
      const adjRevenue = d.inAdjustmentRevenue || 0
      const totalAdj = adjPersonal + adjRevenue

      if (totalAdj !== 0) {
        subItems.push({
          label: 'Ajuste Manual de Saldo',
          sub: totalAdj > 0 ? 'Correção positiva' : 'Correção negativa',
          val: Math.abs(totalAdj),
          type: 'manual',
          dot: '#f59e0b',
          tag: totalAdj > 0 ? 'CRÉDITO' : 'DÉBITO'
        })

        if (adjPersonal > 0) creditoPessoal += adjPersonal
        else debitoPessoal += Math.abs(adjPersonal)

        if (adjRevenue > 0) creditoReceita += adjRevenue
        else debitoReceita += Math.abs(adjRevenue)
      }

      // Always render if date is within view, regardless of subItems
      // if (subItems.length > 0) { // Removed check to show all days
        const dateObj = new Date(dateStr + 'T12:00:00Z')
        const dayNum = dateStr.split('-')[2]
        const weekday = dateObj
          .toLocaleDateString('pt-BR', { weekday: 'short' })
          .toUpperCase()
        const monthShort = dateObj
          .toLocaleDateString('pt-BR', { month: 'short' })
          .toUpperCase()
        const isMonthStart = dateStr.endsWith('-01')
        if (isMonthStart) {
          const monthLabel = dateObj
            .toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric'
            })
            .toUpperCase()
          html += `<div class="timeline-month-header">${monthLabel}</div>`
        }
        let headerClass = isMonthStart
          ? 'timeline-day-header month-separator'
          : 'timeline-day-header'
        
        // Highlight Today
        if (dateStr === todayStr) {
            headerClass += ' today text-yellow-400 border-l-4 border-yellow-400 pl-2 bg-yellow-400/5'
        }

        const dayLabel = `<span class="timeline-day-pill ${dateStr === todayStr ? 'bg-yellow-400 text-slate-900 border-yellow-500' : ''}">${dayNum}</span><span class="timeline-day-text">${weekday} • ${monthShort}</span>`

        html += `<div class="${headerClass}">${dayLabel}</div>`

        subItems.forEach((item, idx) => {
          const isWithdraw =
            item.type === 'withdraw-realized' ||
            item.type === 'withdraw-planned'
          const isManualDebit = item.type === 'manual' && item.tag === 'DÉBITO'
          const sign = isWithdraw || isManualDebit ? '-' : '+'
          const showValue = item.val > 0

          html += `
                        <div class="timeline-item">
                            <div class="timeline-marker">
                                <div class="timeline-dot" style="background: ${item.dot}"></div>
                                ${idx < subItems.length - 1 ? '<div class="timeline-line"></div>' : ''}
                            </div>
                            <div class="timeline-content">
                                <div><div class="timeline-label">${item.label}</div><div class="timeline-sublabel">${item.sub}</div></div>
                                <div class="text-right">
                                    <div class="timeline-value ${item.type}">${showValue ? sign + Formatter.currency(item.val) : item.tag}</div>
                                    <div class="efetivar-badge">${item.tag}</div>
                                </div>
                            </div>
                        </div>`
        })

        const dayCreditoPessoal =
          (d.inReturnPrincipal || 0) +
          (index === 0 ? initialPersonal : 0) +
          (adjPersonal > 0 ? adjPersonal : 0)
        const dayCreditoReceita =
          (taskIncome || 0) +
          (recurringIncome || 0) +
          (d.inReturnProfit || 0) +
          (index === 0 ? initialRevenue : 0) +
          (adjRevenue > 0 ? adjRevenue : 0)
        const dayDebitoPessoal =
          (d.outWithdrawPersonal || 0) +
          (adjPersonal < 0 ? Math.abs(adjPersonal) : 0)
        const dayDebitoReceita =
          (d.outWithdrawRevenue || 0) +
          (adjRevenue < 0 ? Math.abs(adjRevenue) : 0)

        const dayTotalCredito = dayCreditoPessoal + dayCreditoReceita
        const dayTotalDebito = dayDebitoPessoal + dayDebitoReceita

        html += `
          <div class="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2 mt-2 mb-4">
            <!-- Resumo Geral -->
            <div class="flex justify-between items-center text-[10px] pb-2 border-b border-slate-700/30 mb-2">
              <span class="text-slate-500 font-bold uppercase tracking-wider">Totais:</span>
              <div class="flex gap-3">
                <span class="text-emerald-400 font-bold font-mono">+${Formatter.currency(dayTotalCredito)}</span>
                <span class="text-red-400 font-bold font-mono">-${Formatter.currency(dayTotalDebito)}</span>
                <span class="text-white font-bold font-mono">${Formatter.currency(d.endBal)}</span>
              </div>
            </div>
            
            <!-- Detalhamento por Carteira -->
            <div class="grid grid-cols-3 gap-3 text-[9px]">
              <div class="space-y-1">
                <div class="text-slate-500 uppercase font-bold text-[8px] mb-1">Entradas</div>
                <div class="flex justify-between text-indigo-400"><span>Pes:</span><span class="font-mono">+${Formatter.currency(dayCreditoPessoal)}</span></div>
                <div class="flex justify-between text-emerald-400"><span>Rec:</span><span class="font-mono">+${Formatter.currency(dayCreditoReceita)}</span></div>
              </div>
              <div class="space-y-1">
                <div class="text-slate-500 uppercase font-bold text-[8px] mb-1">Saídas</div>
                <div class="flex justify-between text-indigo-400"><span>Pes:</span><span class="font-mono">-${Formatter.currency(dayDebitoPessoal)}</span></div>
                <div class="flex justify-between text-emerald-400"><span>Rec:</span><span class="font-mono">-${Formatter.currency(dayDebitoReceita)}</span></div>
              </div>
              <div class="space-y-1 border-l border-slate-700/30 pl-2">
                <div class="text-slate-500 uppercase font-bold text-[8px] mb-1">Saldo Final</div>
                <div class="flex justify-between text-indigo-400"><span>Pes:</span><span class="font-mono">${Formatter.currency(d.endPersonal)}</span></div>
                <div class="flex justify-between text-emerald-400"><span>Rec:</span><span class="font-mono">${Formatter.currency(d.endRevenue)}</span></div>
              </div>
            </div>
          </div>`
    })

    container.innerHTML =
      html ||
      '<p class="text-center text-slate-500 py-10">Sem eventos no período.</p>'

    const lastDateInPeriod = sortedDates.reverse().find(d => d <= limitDateStr)
    const lastDayData = dailyData[lastDateInPeriod] || {
      endPersonal: 0,
      endRevenue: 0
    }

    const footerHtml = `
      <div class="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700">
        <div class="space-y-1">
          <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Entradas (Período)</span>
          <div class="text-[10px] flex justify-between">
            <span class="text-indigo-400">Pessoal:</span>
            <span class="text-slate-200 font-bold font-mono">${Formatter.currency(creditoPessoal)}</span>
          </div>
          <div class="text-[10px] flex justify-between">
            <span class="text-emerald-400">Receita:</span>
            <span class="text-slate-200 font-bold font-mono">${Formatter.currency(creditoReceita)}</span>
          </div>
        </div>

        <div class="space-y-1">
          <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Saídas (Período)</span>
          <div class="text-[10px] flex justify-between">
            <span class="text-indigo-400">Pessoal:</span>
            <span class="text-slate-200 font-bold font-mono">${Formatter.currency(debitoPessoal)}</span>
          </div>
          <div class="text-[10px] flex justify-between">
            <span class="text-emerald-400">Receita:</span>
            <span class="text-slate-200 font-bold font-mono">${Formatter.currency(debitoReceita)}</span>
          </div>
        </div>

        <div class="space-y-1">
          <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Saldo Final (Período)</span>
          <div class="text-[10px] flex justify-between">
            <span class="text-indigo-400 font-bold uppercase text-[8px]">Pessoal:</span>
            <span class="text-indigo-400 font-bold font-mono">${Formatter.currency(lastDayData.endPersonal)}</span>
          </div>
          <div class="text-[10px] flex justify-between">
            <span class="text-emerald-400 font-bold uppercase text-[8px]">Receita:</span>
            <span class="text-emerald-400 font-bold font-mono">${Formatter.currency(lastDayData.endRevenue)}</span>
          </div>
        </div>
      </div>
    `
    const footerContainer = document.getElementById('timelineFooter')
    if (footerContainer) footerContainer.innerHTML = footerHtml
  },

  renderGoals(goals, dailyData, onRemove) {
    const container = document.getElementById('goalsList')
    if (!container) return
    const sortedDates = Object.keys(dailyData).sort()
    const finalBal = dailyData[sortedDates[sortedDates.length - 1]]?.endBal || 0

    container.innerHTML =
      (goals || [])
        .map((goal, idx) => {
          const target = Formatter.toCents(goal.value)
          const progress = Math.min(100, Math.floor((finalBal / target) * 100))
          let date = '---'
          for (let d of sortedDates)
            if (dailyData[d].endBal >= target) {
              date = Formatter.dateDisplay(d)
              break
            }

          return `
                <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700 relative group">
                    <div class="flex justify-between items-start mb-2">
                        <div><span class="text-xs font-bold text-white block">${goal.name}</span><span class="text-[9px] text-slate-500 uppercase">Alvo: ${Formatter.currency(target)}</span></div>
                        <div class="text-right"><span class="text-[10px] text-indigo-400 font-bold block">${date}</span><button onclick="app.removeGoal(${idx})" class="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt text-[9px]"></i></button></div>
                    </div>
                    <div class="h-1 w-full bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-indigo-500" style="width: ${progress}%"></div></div>
                </div>`
        })
        .join('') ||
      '<p class="text-center text-[10px] text-slate-500 italic">Nenhuma meta ativa</p>'
  },



  renderNotificationCard(n, idx = 0) {
    const iconHtml = n.icon.startsWith('fa-') 
      ? `<i class="fas ${n.icon}"></i>` 
      : n.icon

    return `
      <div class="insight-card ${n.type} relative group" style="animation-delay: ${idx * 0.1}s" id="notif-${n.id}">
        <button onclick="app.dismissNotification('${n.id}')" 
          class="absolute top-2 right-2 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity p-1"
          title="Fechar">
          <i class="fas fa-times text-[10px]"></i>
        </button>
        <div class="flex items-start gap-3">
          <span class="insight-icon flex-shrink-0">${iconHtml}</span>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold text-white mb-0.5">${n.title}</h4>
            <p class="text-[10px] text-slate-400 leading-relaxed">${n.message}</p>
            ${n.action ? `
              <button onclick="app.handleInsightAction('${n.action}', '${n.marcoKey || ''}')" 
                class="insight-action mt-2">
                ${n.action}
              </button>
            ` : ''}
          </div>
          ${n.type === 'achievement' ? `
            <button onclick="app.dismissInsight(this, '${n.marcoKey}')" 
              class="text-slate-500 hover:text-white text-xs p-1" title="Marcar como visto">
              <i class="fas fa-check"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `
  },

  renderWithdrawButtons(onSelect, selectedValue) {
    const grid = this.els.tiersGrid()
    if (!grid) return
    grid.innerHTML = Calculator.WITHDRAWAL_TIERS.map(t => {
      const v = Formatter.fromCents(t)
      return `<button class="tier-btn ${selectedValue == v ? 'selected' : ''}" onclick="app.setWithdrawTarget(${v})">${v.toLocaleString('pt-BR')}</button>`
    }).join('')
  },

  renderProfileList(profiles, currentId, onSwitch, onDelete) {
    const list = this.els.profileList()
    if (!list) return
    list.innerHTML = Object.entries(profiles)
      .map(([id, prof]) => {
        const isCurrent = id === currentId
        return `
                <div class="p-3 flex justify-between items-center ${isCurrent ? 'bg-slate-800' : 'hover:bg-slate-800 cursor-pointer'}" onclick="${!isCurrent ? `app.switchProfile('${id}')` : ''}">
                    <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : 'bg-slate-600'}"></div><span class="text-xs ${isCurrent ? 'text-white font-bold' : 'text-slate-400'}">${prof.name}</span></div>
                    ${!isCurrent ? `<button class="text-slate-500 hover:text-red-400 px-2" onclick="event.stopPropagation(); app.deleteProfile('${id}')"><i class="fas fa-trash-alt text-[10px]"></i></button>` : '<span class="text-[9px] text-blue-500 font-bold uppercase">Ativo</span>'}
                </div>`
      })
      .join('')
    this.els.currentProfileName().innerText = profiles[currentId].name
    const mobileNameEl = document.getElementById('mobileCurrentProfileName')
    if (mobileNameEl) mobileNameEl.innerText = profiles[currentId].name
  },

  toast(message, type = 'info') {
    let cont =
      document.querySelector('.toast-container') ||
      Object.assign(document.createElement('div'), {
        className: 'toast-container'
      })
    if (!cont.parentElement) document.body.appendChild(cont)
    const t = Object.assign(document.createElement('div'), {
      className: `toast toast-${type}`,
      innerHTML: `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> <span>${message}</span>`
    })
    cont.appendChild(t)
    setTimeout(() => {
      t.style.opacity = '0'
      t.style.transform = 'translateX(100%)'
      setTimeout(() => t.remove(), 300)
    }, 3000)
  }
}
