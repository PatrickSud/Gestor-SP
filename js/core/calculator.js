import { Formatter } from '../utils/formatter.js';

/**
 * Pure functions for financial calculations
 * Everything here works with CENTS (integers)
 */

export const Calculator = {
    WITHDRAWAL_TIERS: [4000, 13000, 40000, 130000, 420000, 850000, 1900000, 3800000], // Values in cents

    calculate(inputs, portfolio, selectedWeeks, realizedWithdrawals = []) {
        const {
            dataInicio: startDateStr,
            withdrawalDaySelect,
            viewPeriodSelect,
            monthlyExtraIncome,
            monthlyIncomeToggle,
            taskDailyValue,
            currentWalletBalance,
            futureToggle,
            capitalInicial,
            diasCiclo,
            taxaDiaria,
            repeticoesCiclo,
            mergeSimToggle,
            withdrawStrategy,
            withdrawTarget
        } = inputs;

        if (!startDateStr) return null;

        const targetDay = parseInt(withdrawalDaySelect);
        const viewDays = parseInt(viewPeriodSelect);
        const todayStr = new Date().toISOString().split('T')[0];

        // Convert to cents
        const walletStart = Formatter.toCents(currentWalletBalance);
        const taskValCents = Formatter.toCents(taskDailyValue);
        const monthlyIncomeCents = monthlyIncomeToggle ? Formatter.toCents(monthlyExtraIncome) : 0;
        const initialSimCapital = (futureToggle === 'true') ? Formatter.toCents(capitalInicial) : 0;
        const withdrawTargetCents = Formatter.toCents(withdrawTarget);

        // Simulation Params
        const cycleDays = parseInt(diasCiclo) || 1;
        const dailyRate = (parseFloat(taxaDiaria) || 0) / 100;
        const totalReps = (futureToggle === 'true') ? (parseInt(repeticoesCiclo) || 1) : 0;
        
        // Bonus Config
        const bT1 = (parseFloat(inputs.bonusTier1) || 0) / 100;
        const mT1 = Formatter.toCents(inputs.minTier1);
        const lT1 = Formatter.toCents(inputs.limitTier1);
        const bT2 = (parseFloat(inputs.bonusTier2) || 0) / 100;

        // Portfolio Mapping
        const portReleases = {};
        const portMaturingDetails = {};
        let totalPortfolioVal = 0;

        portfolio.forEach(p => {
            const endStr = Formatter.addDays(p.date, p.days);
            const valCents = Formatter.toCents(p.val);
            const profitCents = Math.floor(valCents * (p.rate / 100) * p.days);
            const totalCents = valCents + profitCents;

            if (!portReleases[endStr]) {
                portReleases[endStr] = 0;
                portMaturingDetails[endStr] = [];
            }
            portReleases[endStr] += totalCents;
            portMaturingDetails[endStr].push({ 
                name: p.name, 
                val: valCents, 
                profit: profitCents, 
                total: totalCents 
            });
            totalPortfolioVal += valCents;
        });

        const totalCentsInvested = walletStart + initialSimCapital + totalPortfolioVal;

        // Initialize Loop
        let currentInv = initialSimCapital;
        let currentWallet = walletStart;
        let totalWithdrawnCents = 0;
        let dailyData = {};
        let graphData = [];

        const simulationDays = Math.max(viewDays, totalReps * cycleDays + 30);
        
        let cycleEnds = [];
        let nextWithdrawCents = 0;
        let nextWithdrawDate = '-';
        let withdrawalHistory = [];
        
        let simCycleTimer = cycleDays;
        let completedReps = 0;

        for (let d = 0; d <= simulationDays; d++) {
            const currentDayStr = Formatter.addDays(startDateStr, d);
            const startBalCents = currentInv + currentWallet;
            
            let stepIncome = 0;
            let stepReturns = 0;
            let stepWithdraw = 0;
            let stepMaturingList = [];
            let isCycleEnd = false;

            // 1. Task Income (Mon-Sat)
            if (d > 0 && Formatter.getDayOfWeek(currentDayStr) !== 0) {
                stepIncome += taskValCents;
            }
            
            // 2. Monthly Income
            if (d > 0 && d % 30 === 0) {
                stepIncome += monthlyIncomeCents;
            }

            // 3. Portfolio Maturities
            if (portReleases[currentDayStr]) {
                stepReturns += portReleases[currentDayStr];
                stepMaturingList = portMaturingDetails[currentDayStr];
            }

            currentWallet += stepIncome;

            // 4. Simulated Cycle Logic
            if (futureToggle === 'true' && completedReps < totalReps && d > 0) {
                simCycleTimer--;
                if (simCycleTimer === 0) {
                    let bonusPerc = 0;
                    if (currentInv >= mT1 && currentInv <= lT1) bonusPerc = bT1;
                    else if (currentInv > lT1) bonusPerc = bT2;

                    const activeCap = Math.floor(currentInv * (1 + bonusPerc));
                    const profit = Math.floor(activeCap * dailyRate * cycleDays);
                    currentInv = activeCap + profit;
                    
                    isCycleEnd = true;
                    cycleEnds.push(currentDayStr);
                    completedReps++;
                    simCycleTimer = cycleDays;
                }
            }

            // Merge Logic
            if (mergeSimToggle && futureToggle === 'true' && stepReturns > 0) {
                currentInv += stepReturns;
            } else {
                currentWallet += stepReturns;
            }

            let totalPool = currentInv + currentWallet;

            // 5. Withdrawal Logic
            const isWithdrawalDay = Formatter.getDayOfWeek(currentDayStr) === targetDay;
            const availableTier = this.WITHDRAWAL_TIERS.filter(t => t <= totalPool).pop() || 0;
            
            let isRealized = false;
            let isPlanned = false;
            let amountToWithdrawCents = 0;

            // Strategy Planning
            if (isWithdrawalDay && d > 0) {
                if (withdrawStrategy === 'max' && availableTier > 0) isPlanned = true;
                else if (withdrawStrategy === 'fixed' && availableTier >= withdrawTargetCents) isPlanned = true;
                else if (withdrawStrategy === 'weekly' && availableTier > 0) {
                    const dayOfMonth = parseInt(currentDayStr.split('-')[2]);
                    const weekNum = Math.ceil(dayOfMonth / 7);
                    if (selectedWeeks.includes(weekNum)) isPlanned = true;
                }
            }

            // Check Manual Realized (Overrides planning)
            const realizedOnDay = (realizedWithdrawals || []).find(w => w.date === currentDayStr);
            if (realizedOnDay) {
                isRealized = true;
                amountToWithdrawCents = Formatter.toCents(realizedOnDay.amount);
            } else if (isPlanned) {
                // If not manual, use planned strategy
                amountToWithdrawCents = availableTier;
            }

            // Subtract from balance
            if (amountToWithdrawCents > 0) {
                const net = Math.floor(amountToWithdrawCents * 0.90);
                stepWithdraw = net;
                totalWithdrawnCents += net;

                if (currentWallet >= amountToWithdrawCents) currentWallet -= amountToWithdrawCents;
                else {
                    const remaining = amountToWithdrawCents - currentWallet;
                    currentWallet = 0; currentInv -= remaining;
                    if (currentInv < 0) currentInv = 0;
                }
                totalPool -= amountToWithdrawCents;
                withdrawalHistory.push({ date: currentDayStr, val: net, status: isRealized ? 'realized' : 'planned' });

                // Update Next Withdraw Info for dashboard
                const netAvailable = Math.floor(availableTier * 0.90);
                if (nextWithdrawCents === 0 && netAvailable > 0 && currentDayStr >= todayStr) {
                    nextWithdrawCents = netAvailable;
                    nextWithdrawDate = currentDayStr;
                }
            }

            dailyData[currentDayStr] = {
                startBal: startBalCents,
                endBal: totalPool,
                inIncome: stepIncome,
                inReturn: stepReturns,
                outReinvest: currentInv,
                outWithdraw: stepWithdraw,
                maturing: stepMaturingList,
                tier: availableTier,
                isCycleEnd,
                status: isRealized ? 'realized' : (isPlanned ? 'planned' : 'none')
            };

            if (d <= viewDays || d % 5 === 0) {
                graphData.push({ x: currentDayStr, y: Formatter.fromCents(totalPool) });
            }
        }

        // Advanced KPI Calculation
        const totalMonths = Math.max(1, simulationDays / 30);
        const avgMonthlyYield = ((currentInv + currentWallet + totalWithdrawnCents) - totalCentsInvested) / totalMonths;
        
        let breakEvenDate = 'N/A';
        let paybackDays = '---';
        
        const sortedDailyKeys = Object.keys(dailyData).sort();
        for (let i = 0; i < sortedDailyKeys.length; i++) {
            const dayKey = sortedDailyKeys[i];
            const dayData = dailyData[dayKey];
            
            const cumulativeWithdrawn = withdrawalHistory
                .filter(w => w.date <= dayKey)
                .reduce((acc, curr) => acc + curr.val, 0);

            if (dayData.endBal + cumulativeWithdrawn >= totalCentsInvested) {
                breakEvenDate = dayKey;
                paybackDays = i;
                break;
            }
        }

        return {
            results: {
                netProfit: (currentInv + currentWallet + totalWithdrawnCents) - totalCentsInvested,
                totalWithdrawn: totalWithdrawnCents,
                finalBalance: currentInv + currentWallet,
                nextWithdraw: nextWithdrawCents,
                nextWithdrawDate: nextWithdrawDate,
                roi: totalCentsInvested > 0 ? (((currentInv + currentWallet + totalWithdrawnCents) - totalCentsInvested) / totalCentsInvested) * 100 : 0,
                graphData,
                withdrawalHistory,
                avgMonthlyYield,
                paybackDays,
                breakEvenDate
            },
            dailyData,
            cycleEnds
        };
    }
};
