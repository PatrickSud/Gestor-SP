import { Formatter } from '../utils/formatter.js'
import { Calculator } from '../core/calculator.js'

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

    // Summaries
    summaryInvCount: () => document.getElementById('summaryInvCount'),
    summaryInvProfit: () => document.getElementById('summaryInvProfit'),
    summaryInvTotal: () => document.getElementById('summaryInvTotal')
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

    const sorted = [...portfolio].sort((a, b) => {
      const aEnd = new Date(Formatter.addDays(a.date, a.days))
      const bEnd = new Date(Formatter.addDays(b.date, b.days))
      return aEnd - bEnd
    })

    sorted.forEach(p => {
      const valCents = Formatter.toCents(p.val)
      const profitCents = Math.floor(valCents * (p.rate / 100) * p.days)
      totalVal += valCents
      totalProfit += profitCents

      const retornoStr = Formatter.dateDisplay(
        Formatter.addDays(p.date, p.days)
      )

      const li = document.createElement('li')
      li.className =
        'bg-slate-800 p-2.5 rounded-lg flex justify-between items-center text-xs border border-slate-700/50 hover:bg-slate-700 transition-colors group relative overflow-hidden'
      li.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-50"></div>
                <div class="flex items-center gap-3 pl-2">
                     <div>
                        <span class="text-slate-300 font-bold block">${p.name || 'Ativo'}</span>
                        <span class="text-[10px] text-slate-500">${Formatter.dateDisplay(p.date)} • ${p.rate}% (${p.days}d)</span>
                        <span class="text-[10px] text-yellow-400">Retorno: ${retornoStr}</span>
                     </div>
                </div>
                <div class="text-right">
                     <span class="block font-bold text-white text-[10px]">Ini: ${Formatter.currency(valCents)}</span>
                     <span class="block font-bold text-emerald-400 text-[11px]">Final: ${Formatter.currency(valCents + profitCents)}</span>
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

    this.els.summaryInvCount().innerText = `${portfolio.length} contratos`
    this.els.summaryInvTotal().innerText = `Total: ${Formatter.currency(totalVal)}`
    this.els.summaryInvProfit().innerText = `Lucro Est: ${Formatter.currency(totalProfit)}`
  },

  renderResults(results) {
    // Card 1: Lucro Líquido
    this.els.resLucroLiquido().innerText = Formatter.currency(results.netProfit)
    this.els.resRoi().innerText = `ROI Total: ${results.roi.toFixed(1)}%`

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

    this.els.navTotalBalance().innerText = Formatter.currency(
      results.currentBalanceToday
    )

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
    const listEl = document.getElementById('simSummaryCycleEnds')
    if (listEl) {
      const ends = Array.isArray(cycleEnds) ? cycleEnds : []
      if (ends.length > 0) {
        const tags = ends
          .map(d => {
            const [y, m, day] = d.split('-')
            return `<span class="px-2 py-0.5 text-[10px] rounded bg-violet-900 text-violet-100 font-bold border border-violet-700/50 shadow-sm">${day}/${m}</span>`
          })
          .join('')
        listEl.innerHTML = `
          <div class="mt-3 pt-3 border-t border-slate-700/50">
            <div class="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">Previsão de Retornos:</div>
            <div class="flex flex-wrap gap-1.5">${tags}</div>
          </div>
        `
      } else {
        listEl.innerHTML =
          '<span class="text-[10px] text-slate-500 italic">Sem ciclos concluídos</span>'
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

    Object.keys(dailyData)
      .sort()
      .forEach(dateStr => {
        if (dateStr > limitDateStr) return
        const d = dailyData[dateStr]
        const isSignificant =
          d.status !== 'none' || d.inReturn > 0 || dateStr === limitDateStr

        if (isSignificant) {
          html += `
                    <tr class="hover:bg-slate-700/50 border-b border-slate-700/50 transition-colors cursor-pointer" onclick="app.openDayDetails('${dateStr}')">
                        <td class="p-2 text-slate-300 border-r border-slate-700/50 whitespace-nowrap">${Formatter.dateDisplay(dateStr)}</td>
                        <td class="p-2 text-right text-slate-500 hidden md:table-cell col-money">${Formatter.currency(d.startBal)}</td>
                        <td class="p-2 text-right text-emerald-400 font-bold col-money">${d.inReturn > 0 ? '+' + Formatter.currency(d.inReturn) : '-'}</td>
                        <td class="p-2 text-right text-indigo-400 col-money">${d.inIncome > 0 ? '+' + Formatter.currency(d.inIncome) : '-'}</td>
                        <td class="p-2 text-right text-blue-400 col-money">${d.outReinvest > d.startBal ? '-' + Formatter.currency(d.outReinvest - d.startBal) : '-'}</td>
                        <td class="p-2 text-right text-yellow-500 col-money">${d.outWithdraw > 0 ? '-' + Formatter.currency(d.outWithdraw) : '-'}</td>
                        <td class="p-2 text-right text-white font-bold bg-slate-800/30 border-l border-slate-700/50 col-money">${Formatter.currency(d.endBal)}</td>
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
    const todayStr = new Date().toISOString().split('T')[0]

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
          const taskIncome = data.inIncomeTask ?? data.inIncome
          const recurringIncome = data.inIncomeRecurring ?? 0
          if (taskIncome > 0)
            markers.push(
              '<div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>'
            )
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
            markers.push(
              '<div class="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>'
            )
          }
        }
        if (isCycle)
          markers.push(
            '<div class="w-1.5 h-1.5 rounded-full bg-violet-500"></div>'
          )

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
    let totalIncome = 0
    let totalExpense = 0
    const limitDateStr = Formatter.addDays(startDateStr, viewDays)
    const todayStr = new Date().toISOString().split('T')[0]
    const sortedDates = Object.keys(dailyData).sort()

    sortedDates.forEach((dateStr, index) => {
      if (dateStr > limitDateStr) return
      const d = dailyData[dateStr]
      const subItems = []

      if (index === 0) {
        subItems.push({
          label: 'Saldo de Abertura',
          sub: 'Valor adicionado manualmente',
          val: d.startBal,
          type: 'manual',
          dot: '#f97316',
          tag: 'INÍCIO'
        })
      }

      const taskIncome = d.inIncomeTask ?? d.inIncome
      const recurringIncome = d.inIncomeRecurring ?? 0

      if (taskIncome > 0) {
        subItems.push({
          label: 'Entradas (Tarefas)',
          sub: 'Renda diária',
          val: taskIncome,
          type: 'task',
          dot: '#22c55e',
          tag: 'RECEBIDO'
        })
        totalIncome += taskIncome
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
        totalIncome += recurringIncome
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
        totalIncome += d.inReturn
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

      if (d.status !== 'none') {
        const realized = d.status === 'realized'
        const label = realized ? 'Saque Realizado' : 'Saque Planejado'
        const val = realized ? d.outWithdraw : Math.floor(d.tier * 0.9)
        const itemType = realized ? 'withdraw-realized' : 'withdraw-planned'
        const dotColor = realized ? '#3b82f6' : '#eab308'

        subItems.push({
          label,
          sub: realized ? 'Transferência concluída' : 'Projeção de saque',
          val,
          type: itemType,
          dot: dotColor,
          tag: d.status.toUpperCase()
        })

        if (realized) totalExpense += d.outWithdraw
      }

      if (subItems.length > 0) {
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
        if (dateStr === todayStr) headerClass += ' today'
        const dayLabel = `<span class="timeline-day-pill">${dayNum}</span><span class="timeline-day-text">${weekday} • ${monthShort}</span>`

        html += `<div class="${headerClass}">${dayLabel}</div>`

        subItems.forEach((item, idx) => {
          const isWithdraw =
            item.type === 'withdraw-realized' ||
            item.type === 'withdraw-planned'
          const sign = isWithdraw ? '-' : '+'
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

        const dayCredit =
          (taskIncome || 0) + (recurringIncome || 0) + (d.inReturn || 0)
        const dayDebit = d.outWithdraw || 0
        const creditText =
          dayCredit > 0 ? '+' + Formatter.currency(dayCredit) : '-'
        const debitText =
          dayDebit > 0 ? '-' + Formatter.currency(dayDebit) : '-'
        const balanceText = Formatter.currency(d.endBal)

        html += `
          <div class="flex justify-end gap-4 text-[10px] text-slate-400 mt-1 mb-4">
            <div class="text-right">
              <div class="uppercase tracking-wide text-[9px] text-emerald-400">Total Crédito</div>
              <div class="font-mono">${creditText}</div>
            </div>
            <div class="text-right">
              <div class="uppercase tracking-wide text-[9px] text-red-400">Total Débito</div>
              <div class="font-mono">${debitText}</div>
            </div>
            <div class="text-right">
              <div class="uppercase tracking-wide text-[9px] text-slate-400">Saldo</div>
              <div class="font-mono text-slate-100">${balanceText}</div>
            </div>
          </div>`
      }
    })

    container.innerHTML =
      html ||
      '<p class="text-center text-slate-500 py-10">Sem eventos no período.</p>'
    document.getElementById('timelineTotalEntries').innerText =
      Formatter.currency(totalIncome)
    document.getElementById('timelineTotalExits').innerText =
      Formatter.currency(totalExpense)
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

  renderAlerts(portfolio) {
    const badge = document.getElementById('alertsBadge')
    const list = document.getElementById('alertsList')
    const container = document.getElementById('alertsContainer')
    if (!badge || !list || !container) return

    const today = new Date()
    const alerts = []

    ;(portfolio || []).forEach(p => {
      const end = new Date(Formatter.addDays(p.date, p.days))
      const diff = Math.ceil((end - today) / 86400000)
      if (diff <= 2 && diff >= 0)
        alerts.push({
          type: 'warning',
          msg: `Vence em ${diff}d: ${p.name}`,
          icon: 'fa-exclamation-triangle'
        })
      else if (diff < 0 && diff > -5)
        alerts.push({
          type: 'danger',
          msg: `VENCIDO: ${p.name}`,
          icon: 'fa-clock'
        })
    })

    if (alerts.length > 0) {
      container.classList.remove('hidden')
      badge.classList.remove('hidden')
      badge.innerText = alerts.length
      list.innerHTML = alerts
        .map(
          a =>
            `<div class="p-2 bg-slate-900 border border-slate-700 rounded flex gap-2 items-center text-[10px]"><i class="fas ${a.icon} ${a.type === 'warning' ? 'text-yellow-500' : 'text-red-500'}"></i><span class="text-white">${a.msg}</span></div>`
        )
        .join('')
    } else {
      container.classList.add('hidden')
      badge.classList.add('hidden')
    }
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
