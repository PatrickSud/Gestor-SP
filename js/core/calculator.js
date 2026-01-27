import { Formatter } from '../utils/formatter.js'

/**
 * Pure functions for financial calculations
 * Everything here works with CENTS (integers)
 */

export const Calculator = {
  WITHDRAWAL_TIERS: [
    4000, 13000, 40000, 130000, 420000, 850000, 1900000, 3800000
  ], // Values in cents

  calculate(inputs, portfolio, selectedWeeks, realizedWithdrawals = []) {
    const {
      dataInicio: startDateStr,
      withdrawalDaySelect,
      viewPeriodSelect,
      monthlyIncomeToggle,
      fixedIncomes,
      taskDailyValue,
      currentWalletBalance,
      futureToggle,
      capitalInicial,
      simStartDate,
      diasCiclo,
      taxaDiaria,
      repeticoesCiclo,
      withdrawStrategy,
      withdrawTarget
    } = inputs

    if (!startDateStr) return null

    const targetDay = parseInt(withdrawalDaySelect)
    const viewDays = parseInt(viewPeriodSelect)
    const todayStr = new Date().toISOString().split('T')[0]

    // Convert to cents
    const walletStart = Formatter.toCents(currentWalletBalance)
    const taskValCents = Formatter.toCents(taskDailyValue)
    const incomesList = monthlyIncomeToggle ? fixedIncomes || [] : []
    const initialSimCapital =
      futureToggle === 'true' ? Formatter.toCents(capitalInicial) : 0
    const withdrawTargetCents = Formatter.toCents(withdrawTarget)

    // Simulation Params
    const cycleDays = parseInt(diasCiclo) || 1
    const dailyRate = (parseFloat(taxaDiaria) || 0) / 100
    const totalReps =
      futureToggle === 'true' ? parseInt(repeticoesCiclo) || 1 : 0

    // Bonus Config
    const bT1 = (parseFloat(inputs.bonusTier1) || 0) / 100
    const mT1 = Formatter.toCents(inputs.minTier1)
    const lT1 = Formatter.toCents(inputs.limitTier1)
    const bT2 = (parseFloat(inputs.bonusTier2) || 0) / 100

    // Portfolio Mapping
    const portReleases = {}
    const portMaturingDetails = {}
    let totalPortfolioVal = 0

    portfolio.forEach(p => {
      const endStr = Formatter.addDays(p.date, p.days)
      const valCents = Formatter.toCents(p.val)
      const profitCents = Math.floor(valCents * (p.rate / 100) * p.days)
      const totalCents = valCents + profitCents

      if (!portReleases[endStr]) {
        portReleases[endStr] = 0
        portMaturingDetails[endStr] = []
      }
      portReleases[endStr] += totalCents
      portMaturingDetails[endStr].push({
        name: p.name,
        val: valCents,
        profit: profitCents,
        total: totalCents
      })
      totalPortfolioVal += valCents
    })

    const totalCentsInvested =
      walletStart + initialSimCapital + totalPortfolioVal

    let totalIncomeCents = 0
    let totalInvProfitCents = 0

    // Initialize Loop
    let currentInv = 0
    let currentWallet = walletStart
    let totalWithdrawnCents = 0
    let dailyData = {}
    let graphData = []
    let simCapitalPure = 0

    const simulationDays = Math.max(viewDays, totalReps * cycleDays + 30)
    const simStartStr =
      futureToggle === 'true'
        ? simStartDate || new Date().toISOString().split('T')[0]
        : null
    const simStartIndex =
      simStartStr != null
        ? Math.max(
            0,
            Math.floor(
              (new Date(simStartStr) - new Date(startDateStr)) / 86400000
            )
          )
        : 0

    let cycleEnds = []
    let nextWithdrawCents = 0
    let nextWithdrawDate = '-'
    let withdrawalHistory = []

    let simCycleTimer = cycleDays
    let completedReps = 0

    for (let d = 0; d <= simulationDays; d++) {
      const currentDayStr = Formatter.addDays(startDateStr, d)
      const startBalCents = currentInv + currentWallet

      let stepIncome = 0
      let stepReturns = 0
      let stepWithdraw = 0
      let stepMaturingList = []
      let isCycleEnd = false
      let stepTaskIncome = 0
      let stepRecurringIncome = 0
      let stepSimReinvest = 0
      if (
        futureToggle === 'true' &&
        d === simStartIndex &&
        initialSimCapital > 0
      ) {
        currentInv += initialSimCapital
        simCapitalPure += initialSimCapital
      }

      // 1. Task Income (Mon-Sat)
      if (d > 0 && Formatter.getDayOfWeek(currentDayStr) !== 0) {
        stepIncome += taskValCents
        stepTaskIncome += taskValCents
      }

      // 2. Monthly Fixed Incomes (multiple entries by day-of-month)
      if (d > 0 && incomesList.length > 0) {
        const dayOfMonth = parseInt(currentDayStr.split('-')[2])
        incomesList.forEach(item => {
          const valCents = Formatter.toCents(item.amount || 0)
          const incomeDay = parseInt(item.day || 0)
          if (valCents > 0 && incomeDay === dayOfMonth) {
            stepIncome += valCents
            stepRecurringIncome += valCents
          }
        })
      }

      // 3. Portfolio Maturities
      if (portReleases[currentDayStr]) {
        stepReturns += portReleases[currentDayStr]
        stepMaturingList = portMaturingDetails[currentDayStr]
      }

      currentWallet += stepIncome
      totalIncomeCents += stepIncome

      const dayProfit =
        stepMaturingList && stepMaturingList.length > 0
          ? stepMaturingList.reduce((acc, m) => acc + (m.profit || 0), 0)
          : 0
      totalInvProfitCents += dayProfit

      // 4. Simulated Cycle Logic
      if (
        futureToggle === 'true' &&
        completedReps < totalReps &&
        d > 0 &&
        d >= simStartIndex
      ) {
        simCycleTimer--
        if (simCycleTimer === 0) {
          let bonusPercCur = 0
          if (currentInv >= mT1 && currentInv <= lT1) bonusPercCur = bT1
          else if (currentInv > lT1) bonusPercCur = bT2
          let bonusPercPure = 0
          if (simCapitalPure >= mT1 && simCapitalPure <= lT1)
            bonusPercPure = bT1
          else if (simCapitalPure > lT1) bonusPercPure = bT2

          const prevInv = currentInv
          const activeCapCur = Math.floor(prevInv * (1 + bonusPercCur))
          const profitCur = Math.floor(activeCapCur * dailyRate * cycleDays)
          currentInv = activeCapCur + profitCur
          stepSimReinvest = currentInv - prevInv

          const activeCapPure = Math.floor(simCapitalPure * (1 + bonusPercPure))
          const profitPure = Math.floor(activeCapPure * dailyRate * cycleDays)
          simCapitalPure = activeCapPure + profitPure

          isCycleEnd = true
          cycleEnds.push(currentDayStr)
          completedReps++
          simCycleTimer = cycleDays
        }
      }

      // Merge Logic (Removed - Always to Wallet)
      currentWallet += stepReturns

      let totalPool = currentInv + currentWallet

      // 5. Withdrawal Logic
      const isWithdrawalDay =
        Formatter.getDayOfWeek(currentDayStr) === targetDay
      const availableTier =
        this.WITHDRAWAL_TIERS.filter(t => t <= totalPool).pop() || 0

      let isRealized = false
      let isPlanned = false
      let amountToWithdrawCents = 0

      // Strategy Planning
      if (isWithdrawalDay && d > 0) {
        if (withdrawStrategy === 'max' && availableTier > 0) isPlanned = true
        else if (
          withdrawStrategy === 'fixed' &&
          availableTier >= withdrawTargetCents
        )
          isPlanned = true
        else if (withdrawStrategy === 'weekly' && availableTier > 0) {
          const dayOfMonth = parseInt(currentDayStr.split('-')[2])
          const weekNum = Math.ceil(dayOfMonth / 7)
          if (selectedWeeks.includes(weekNum)) isPlanned = true
        }
      }

      // Check Manual Realized (Overrides planning)
      const realizedOnDay = (realizedWithdrawals || []).find(
        w => w.date === currentDayStr
      )
      if (realizedOnDay) {
        isRealized = true
        amountToWithdrawCents = Formatter.toCents(realizedOnDay.amount)
      } else if (isPlanned) {
        // If not manual, use planned strategy
        amountToWithdrawCents = availableTier
      }

      // Subtract from balance
      if (amountToWithdrawCents > 0) {
        const net = Math.floor(amountToWithdrawCents * 0.9)
        stepWithdraw = net
        totalWithdrawnCents += net

        if (currentWallet >= amountToWithdrawCents)
          currentWallet -= amountToWithdrawCents
        else {
          const remaining = amountToWithdrawCents - currentWallet
          currentWallet = 0
          currentInv -= remaining
          if (currentInv < 0) currentInv = 0
        }
        totalPool -= amountToWithdrawCents
        withdrawalHistory.push({
          date: currentDayStr,
          val: net,
          status: isRealized ? 'realized' : 'planned'
        })

        // Update Next Withdraw Info for dashboard
        const netAvailable = Math.floor(availableTier * 0.9)
        if (
          nextWithdrawCents === 0 &&
          netAvailable > 0 &&
          currentDayStr >= todayStr
        ) {
          nextWithdrawCents = netAvailable
          nextWithdrawDate = currentDayStr
        }
      }

      dailyData[currentDayStr] = {
        startBal: startBalCents,
        endBal: totalPool,
        inIncome: stepIncome,
        inIncomeTask: stepTaskIncome,
        inIncomeRecurring: stepRecurringIncome,
        inReturn: stepReturns,
        outReinvest: stepSimReinvest,
        outWithdraw: stepWithdraw,
        maturing: stepMaturingList,
        tier: availableTier,
        isCycleEnd,
        status: isRealized ? 'realized' : isPlanned ? 'planned' : 'none'
      }

      if (d <= viewDays || d % 5 === 0) {
        graphData.push({
          x: currentDayStr,
          y: Formatter.fromCents(totalPool),
          meta: {
            incomeTask: stepTaskIncome,
            incomeRecurring: stepRecurringIncome,
            returns: stepReturns,
            withdrawNet: stepWithdraw,
            withdrawStatus: isRealized
              ? 'realized'
              : isPlanned
                ? 'planned'
                : 'none',
            isCycleEnd,
            isStart: d === 0
          }
        })
      }
    }

    // Advanced KPI Calculation
    const totalMonths = Math.max(1, simulationDays / 30)
    const avgMonthlyYield =
      (currentInv + currentWallet + totalWithdrawnCents - totalCentsInvested) /
      totalMonths

    let breakEvenDate = 'N/A'
    let paybackDays = '---'

    // --- Specific Data for New Cards ---
    const currentMonthStr = todayStr.substring(0, 7)

    // 1. Current Month Withdrawn
    const currentMonthWithdrawn = withdrawalHistory
      .filter(w => w.date.startsWith(currentMonthStr))
      .reduce((acc, w) => acc + w.val, 0)

    // 2. Projected End of Month Balance
    const currentYear = parseInt(currentMonthStr.split('-')[0])
    const currentMonth = parseInt(currentMonthStr.split('-')[1])
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate()
    const endOfMonthDateStr = `${currentMonthStr}-${String(lastDayOfMonth).padStart(2, '0')}`
    const endOfMonthData =
      dailyData[endOfMonthDateStr] ||
      dailyData[Object.keys(dailyData).sort().pop()]
    const projectedEndOfMonthBalance = endOfMonthData
      ? endOfMonthData.endBal
      : 0

    // 3. Next 8 Weeks Withdrawals
    const nextWithdrawalsList = withdrawalHistory
      .filter(w => w.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8)

    // 4. Current Balance (Today)
    const todayData =
      dailyData[todayStr] || dailyData[Object.keys(dailyData)[0]]
    const currentBalanceToday = todayData ? todayData.endBal : 0

    const sortedDailyKeys = Object.keys(dailyData).sort()
    for (let i = 0; i < sortedDailyKeys.length; i++) {
      const dayKey = sortedDailyKeys[i]
      const dayData = dailyData[dayKey]

      const cumulativeWithdrawn = withdrawalHistory
        .filter(w => w.date <= dayKey)
        .reduce((acc, curr) => acc + curr.val, 0)

      if (dayData.endBal + cumulativeWithdrawn >= totalCentsInvested) {
        breakEvenDate = dayKey
        paybackDays = i
        break
      }
    }

    return {
      results: {
        netProfit: totalIncomeCents + totalInvProfitCents,
        totalIncomeCents,
        totalInvProfitCents,
        totalWithdrawn: totalWithdrawnCents,
        currentMonthWithdrawn,
        finalBalance: currentInv + currentWallet,
        currentWalletNow: currentWallet,
        currentBalanceToday,
        projectedEndOfMonthBalance,
        nextWithdraw: nextWithdrawCents,
        nextWithdrawDate: nextWithdrawDate,
        nextWithdrawalsList,
        roi:
          totalCentsInvested > 0
            ? ((currentInv +
                currentWallet +
                totalWithdrawnCents -
                totalCentsInvested) /
                totalCentsInvested) *
              100
            : 0,
        graphData,
        withdrawalHistory,
        avgMonthlyYield,
        paybackDays,
        breakEvenDate,
        simInitial: initialSimCapital,
        simFinal: simCapitalPure,
        simProfit: simCapitalPure - initialSimCapital,
        simCycles: totalReps,
        simCycleDays: cycleDays,
        simTotalDays: totalReps * cycleDays
      },
      dailyData,
      cycleEnds
    }
  }
}
