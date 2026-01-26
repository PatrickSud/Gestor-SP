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
        let totalCentsInvested = walletStart + initialSimCapital; // Initial "skin in the game"

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
        let lastCycleEnd = startDateStr;
        let dailyData = {};
        let exportData = []; // To be parsed by UI if needed
        let graphData = [];

        let simulationDuration = (futureToggle === 'true') ? (totalReps * cycleDays) : viewDays;
        const stepSize = (futureToggle === 'true' && cycleDays > 0) ? cycleDays : 1;
        const totalSteps = Math.ceil(simulationDuration / stepSize);
        const visualMaxDate = Formatter.addDays(startDateStr, Math.max(viewDays, simulationDuration));

        let activeInvCycles = 0;
        let cycleEnds = [];
        let nextWithdrawCents = 0;
        let nextWithdrawDate = '-';
        let withdrawalHistory = [];
        let totalIncomeCents = 0;
        let totalReturnsCents = 0;

        for (let i = 1; i <= totalSteps; i++) {
            const cycleEndStr = Formatter.addDays(startDateStr, i * stepSize);
            
            let stepIncome = 0;
            let stepReturns = 0;
            let stepReinvest = 0;
            let stepWithdraw = 0;
            let stepMaturingList = [];

            // Day-by-day sub-loop
            let dIterator = Formatter.addDays(lastCycleEnd, 1);
            while (dIterator <= cycleEndStr) {
                // Task Income (Mon-Sat)
                if (Formatter.getDayOfWeek(dIterator) !== 0) {
                    stepIncome += taskValCents;
                    totalIncomeCents += taskValCents;
                }
                
                // Monthly Income (every 30 days or day 1 logic)
                // Using 30 day simplicity from original code
                const daysTotal = Formatter.daysBetween(startDateStr, dIterator);
                if (daysTotal > 0 && daysTotal % 30 === 0) {
                    stepIncome += monthlyIncomeCents;
                    totalIncomeCents += monthlyIncomeCents;
                }

                // Portfolio Maturities
                if (portReleases[dIterator]) {
                    stepReturns += portReleases[dIterator];
                    if (portMaturingDetails[dIterator]) {
                        stepMaturingList.push(...portMaturingDetails[dIterator]);
                    }
                }
                dIterator = Formatter.addDays(dIterator, 1);
            }

            currentWallet += stepIncome;

            if (mergeSimToggle && stepReturns > 0 && futureToggle === 'true') {
                currentInv += stepReturns;
            } else {
                currentWallet += stepReturns;
            }

            totalReturnsCents += stepReturns;

            let startBalCents = currentInv + currentWallet;
            let isCycleEnd = false;

            if (futureToggle === 'true' && activeInvCycles < totalReps && currentInv > 0) {
                let bonusPerc = 0;
                if (currentInv >= mT1 && currentInv <= lT1) bonusPerc = bT1;
                else if (currentInv > lT1) bonusPerc = bT2;

                const activeCap = Math.floor(currentInv * (1 + bonusPerc));
                const cycleProfit = Math.floor(activeCap * dailyRate * stepSize);
                
                stepReinvest = activeCap - currentInv;
                currentInv = activeCap + cycleProfit;
                isCycleEnd = true;
                activeInvCycles++;
                cycleEnds.push(cycleEndStr);
            }

            let totalPool = currentInv + currentWallet;

            // Withdrawal Logic
            const isWithdrawalDay = Formatter.getDayOfWeek(cycleEndStr) === targetDay;
            let availableTier = 0, netAvailable = 0, executedNet = 0, wasExecuted = false;

            if (isWithdrawalDay) {
                availableTier = this.WITHDRAWAL_TIERS.filter(t => t <= totalPool).pop() || 0;
                netAvailable = Math.floor(availableTier * 0.90);

                if (nextWithdrawCents === 0 && netAvailable > 0 && cycleEndStr >= todayStr) {
                    nextWithdrawCents = netAvailable;
                    nextWithdrawDate = cycleEndStr;
                }

                let shouldWithdraw = false;
                if (withdrawStrategy === 'max' && availableTier > 0) shouldWithdraw = true;
                else if (withdrawStrategy === 'fixed' && availableTier >= withdrawTargetCents) shouldWithdraw = true;
                else if (withdrawStrategy === 'weekly' && availableTier > 0) {
                    const d = parseInt(cycleEndStr.split('-')[2]);
                    const week = Math.ceil(d / 7);
                    if (selectedWeeks.includes(week)) shouldWithdraw = true;
                }

                if (shouldWithdraw) {
                    const amountToWithdraw = availableTier;
                    executedNet = Math.floor(amountToWithdraw * 0.90);
                    stepWithdraw = executedNet;
                    totalWithdrawnCents += executedNet;
                    wasExecuted = true;
                    withdrawalHistory.push({ date: cycleEndStr, val: executedNet });

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

            dailyData[cycleEndStr] = {
                startBal: startBalCents,
                endBal: totalPool,
                inIncome: stepIncome,
                inReturn: stepReturns,
                outReinvest: currentInv, // Focus on current investment power
                outWithdraw: stepWithdraw,
                maturing: stepMaturingList,
                tier: availableTier,
                net: netAvailable,
                executed: wasExecuted
            };

            graphData.push({
                x: cycleEndStr,
                y: Formatter.fromCents(totalPool)
            });

            lastCycleEnd = cycleEndStr;
        }

        const netProfitCents = (currentInv + currentWallet + totalWithdrawnCents) - totalCentsInvested;
        const roi = totalCentsInvested > 0 ? (netProfitCents / totalCentsInvested) * 100 : 0;

        return {
            results: {
                netProfit: netProfitCents,
                totalWithdrawn: totalWithdrawnCents,
                finalBalance: currentInv + currentWallet,
                nextWithdraw: nextWithdrawCents,
                nextWithdrawDate: nextWithdrawDate,
                roi: roi,
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
