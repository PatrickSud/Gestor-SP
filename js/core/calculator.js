import { Formatter } from '../utils/formatter.js';

/**
 * Pure functions for financial calculations
 * Everything here works with CENTS (integers)
 */

export const Calculator = {
    WITHDRAWAL_TIERS: [4000, 13000, 40000, 130000, 420000, 850000, 1900000, 3800000], // Values in cents

    calculate(inputs, portfolio, selectedWeeks) {
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
            withdrawTarget,
            bonusTier1,
            minTier1,
            limitTier1,
            bonusTier2
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
        
        const bT1 = (parseFloat(bonusTier1) || 0) / 100;
        const mT1 = Formatter.toCents(minTier1);
        const lT1 = Formatter.toCents(limitTier1);
        const bT2 = (parseFloat(bonusTier2) || 0) / 100;

        // Portfolio Mapping
        const portReleases = {};
        const portMaturingDetails = {};
        let totalCentsInvested = walletStart + initialSimCapital;

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
        });

        // Initialize Loop
        let currentInv = initialSimCapital;
        let currentWallet = walletStart;
        let totalWithdrawnCents = 0;
        let dailyData = {};
        let graphData = [];

        // Determine Simulation Length
        const simulationDays = Math.max(viewDays, totalReps * cycleDays + 30); // At least 30 safety days
        
        let cycleEnds = [];
        let nextWithdrawCents = 0;
        let nextWithdrawDate = '-';
        let withdrawalHistory = [];
        
        let simCycleTimer = cycleDays;
        let completedReps = 0;

        for (let d = 0; d <= simulationDays; d++) {
            const currentDayStr = Formatter.addDays(startDateStr, d);
            
            let stepIncome = 0;
            let stepReturns = 0;
            let stepWithdraw = 0;
            let stepMaturingList = [];
            let isCycleEnd = false;
            let startBalCents = currentInv + currentWallet;

            // 1. Task Income (Mon-Sat, exclude Sun)
            if (d > 0 && Formatter.getDayOfWeek(currentDayStr) !== 0) {
                stepIncome += taskValCents;
            }
            
            // 2. Monthly Income (every 30 days)
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
            if (futureToggle === 'true' && completedReps < totalReps) {
                simCycleTimer--;
                if (simCycleTimer === 0) {
                    let bonusPerc = 0;
                    if (currentInv >= mT1 && currentInv <= lT1) bonusPerc = bT1;
                    else if (currentInv > lT1) bonusPerc = bT2;

                    const activeCap = Math.floor(currentInv * (1 + bonusPerc));
                    const profit = Math.floor(activeCap * dailyRate * cycleDays);
                    
                    const totalFromCycle = activeCap + profit;
                    
                    if (mergeSimToggle) {
                        currentInv = totalFromCycle;
                    } else {
                        currentWallet += profit;
                        // currentInv stays same as principal for next rep
                    }
                    
                    isCycleEnd = true;
                    cycleEnds.push(currentDayStr);
                    completedReps++;
                    simCycleTimer = cycleDays; // Reset for next rep
                }
            }

            // Add portfolio returns to balance
            if (mergeSimToggle && futureToggle === 'true' && stepReturns > 0) {
                currentInv += stepReturns;
            } else {
                currentWallet += stepReturns;
            }

            let totalPool = currentInv + currentWallet;

            // 5. Withdrawal Logic (Only on designated day)
            const isWithdrawalDay = Formatter.getDayOfWeek(currentDayStr) === targetDay;
            let availableTier = 0, netAvailable = 0, wasExecuted = false;

            if (isWithdrawalDay && d > 0) {
                availableTier = this.WITHDRAWAL_TIERS.filter(t => t <= totalPool).pop() || 0;
                netAvailable = Math.floor(availableTier * 0.90);

                if (nextWithdrawCents === 0 && netAvailable > 0 && currentDayStr >= todayStr) {
                    nextWithdrawCents = netAvailable;
                    nextWithdrawDate = currentDayStr;
                }

                let shouldWithdraw = false;
                if (withdrawStrategy === 'max' && availableTier > 0) shouldWithdraw = true;
                else if (withdrawStrategy === 'fixed' && availableTier >= withdrawTargetCents) shouldWithdraw = true;
                else if (withdrawStrategy === 'weekly' && availableTier > 0) {
                    const dayOfMonth = parseInt(currentDayStr.split('-')[2]);
                    const weekNum = Math.ceil(dayOfMonth / 7);
                    if (selectedWeeks.includes(weekNum)) shouldWithdraw = true;
                }

                if (shouldWithdraw) {
                    const amountToWithdraw = availableTier;
                    const net = Math.floor(amountToWithdraw * 0.90);
                    stepWithdraw = net;
                    totalWithdrawnCents += net;
                    wasExecuted = true;
                    withdrawalHistory.push({ date: currentDayStr, val: net });

                    if (currentWallet >= amountToWithdraw) {
                        currentWallet -= amountToWithdraw;
                    } else {
                        const remaining = amountToWithdraw - currentWallet;
                        currentWallet = 0;
                        currentInv -= remaining;
                        if (currentInv < 0) currentInv = 0;
                    }
                    totalPool -= amountToWithdraw;
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
                net: netAvailable,
                executed: wasExecuted
            };

            if (d <= viewDays || d % 5 === 0) { // Optimize graph points for performance
                graphData.push({ x: currentDayStr, y: Formatter.fromCents(totalPool) });
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
                finalWallet: currentWallet,
                finalActiveInv: currentInv,
                withdrawalHistory
            },
            dailyData,
            cycleEnds
        };
    }
};
