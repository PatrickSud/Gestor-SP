import { Formatter } from '../utils/formatter.js';
import { Calculator } from '../core/calculator.js';

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
        const list = this.els.portfolioList();
        if (!list) return;
        
        list.innerHTML = '';
        let totalVal = 0;
        let totalProfit = 0;

        if (portfolio.length === 0) {
            list.innerHTML = '<p class="text-center text-[10px] text-slate-500 py-4 italic">Nenhum investimento ativo</p>';
        }

        portfolio.forEach(p => {
            const valCents = Formatter.toCents(p.val);
            const profitCents = Math.floor(valCents * (p.rate / 100) * p.days);
            totalVal += valCents;
            totalProfit += profitCents;

            const li = document.createElement('li');
            li.className = "bg-slate-800 p-2.5 rounded-lg flex justify-between items-center text-xs border border-slate-700/50 hover:bg-slate-700 transition-colors group relative overflow-hidden";
            li.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-50"></div>
                <div class="flex items-center gap-3 pl-2">
                     <div>
                        <span class="text-slate-300 font-bold block">${p.name || 'Ativo'}</span>
                        <span class="text-[10px] text-slate-500">${Formatter.dateDisplay(p.date)} • ${p.rate}% (${p.days}d)</span>
                     </div>
                </div>
                <div class="text-right">
                     <span class="block font-bold text-white text-[10px]">Ini: ${Formatter.currency(valCents)}</span>
                     <span class="block font-bold text-emerald-400 text-[11px]">Final: ${Formatter.currency(valCents + profitCents)}</span>
                     <button class="text-[9px] text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 remove-btn" data-id="${p.id}">
                        <i class="fas fa-times"></i>
                     </button>
                </div>
            `;
            li.querySelector('.remove-btn').onclick = (e) => {
                e.stopPropagation();
                onRemove(p.id);
            };
            list.appendChild(li);
        });

        this.els.summaryInvCount().innerText = `${portfolio.length} contratos`;
        this.els.summaryInvTotal().innerText = `Total: ${Formatter.currency(totalVal)}`;
        this.els.summaryInvProfit().innerText = `Lucro Est: ${Formatter.currency(totalProfit)}`;
    },

    renderResults(results) {
        this.els.resFinal().innerText = Formatter.currency(results.finalBalance);
        this.els.resTotalWithdrawn().innerText = Formatter.currency(results.totalWithdrawn);
        this.els.resMelhorSaque().innerText = Formatter.currency(results.nextWithdraw);
        this.els.resLucroLiquido().innerText = Formatter.currency(results.netProfit);
        this.els.navTotalBalance().innerText = Formatter.currency(results.finalBalance);
        this.els.resRoi().innerText = `ROI Total: ${results.roi.toFixed(1)}%`;

        document.getElementById('resPayback').innerText = `${results.paybackDays} dias`;
        document.getElementById('resMonthlyYield').innerText = Formatter.currency(results.avgMonthlyYield);
        document.getElementById('resBreakEven').innerText = results.breakEvenDate !== 'N/A' ? Formatter.dateDisplay(results.breakEvenDate) : 'N/A';

        const profitEl = this.els.resLucroLiquido();
        if (results.netProfit < 0) {
            profitEl.classList.replace('text-white', 'text-red-400');
        } else {
            profitEl.classList.replace('text-red-400', 'text-white');
        }
    },

    renderTable(dailyData, viewDays, startDateStr) {
        const body = this.els.tabelaBody();
        if (!body) return;

        let html = '';
        const limitDateStr = Formatter.addDays(startDateStr, viewDays);
        
        Object.keys(dailyData).sort().forEach(dateStr => {
            if (dateStr > limitDateStr) return;
            const d = dailyData[dateStr];
            const isSignificant = d.status !== 'none' || d.inReturn > 0 || dateStr === limitDateStr;
            
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
                `;
            }
        });
        body.innerHTML = html;
    },

    renderCalendar(startDateStr, dailyData, cycleEnds) {
        const container = this.els.calendarContainer();
        if (!container) return;

        container.innerHTML = '';
        const [y, m, dayOfMonth] = startDateStr.split('-').map(Number);
        const curDate = new Date(Date.UTC(y, m - 1, 1));
        const todayStr = new Date().toISOString().split('T')[0];

        for (let months = 0; months < 12; months++) {
            const monthName = curDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            const monthDiv = document.createElement('div');
            monthDiv.className = "bg-slate-800 rounded-xl p-3 border border-slate-700/50 h-max";
            monthDiv.innerHTML = `<h4 class="text-center font-bold text-slate-400 capitalize mb-2 border-b border-slate-700/50 pb-1 text-xs">${monthName}</h4>`;
            
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-7 gap-1";
            ['D','S','T','Q','Q','S','S'].forEach(h => grid.innerHTML += `<div class="text-center text-[8px] text-slate-600 font-bold">${h}</div>`);
            
            const firstDay = curDate.getUTCDay();
            for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div></div>`;
            
            const daysInMonth = new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth() + 1, 0)).getUTCDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dayStr = `${curDate.getUTCFullYear()}-${String(curDate.getUTCMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const data = dailyData[dayStr];
                const isCycle = (cycleEnds || []).includes(dayStr);
                
                let classes = "cal-day text-slate-400";
                let dots = '';

                if (dayStr === todayStr) classes += " today";
                if (data) {
                    if (data.status === 'realized') classes += " withdraw-executed";
                    else if (data.status === 'planned') classes += " withdraw-day";
                }
                if (isCycle) dots += `<div class="w-1 h-1 bg-emerald-500 rounded-full"></div>`;

                const cell = document.createElement('div');
                cell.className = classes;
                cell.innerHTML = `<span class="z-10">${day}</span>${dots ? `<div class="flex gap-0.5 mb-0.5 absolute bottom-1">${dots}</div>`: ''}`;
                cell.onclick = () => app.openDayDetails(dayStr);
                grid.appendChild(cell);
            }
            
            monthDiv.appendChild(grid);
            container.appendChild(monthDiv);
            curDate.setUTCMonth(curDate.getUTCMonth() + 1);
        }
    },

    renderTimeline(dailyData, viewDays, startDateStr) {
        const container = document.getElementById('timelineContent');
        if (!container) return;

        let html = '';
        let totalIncome = 0;
        let totalExpense = 0;
        const limitDateStr = Formatter.addDays(startDateStr, viewDays);
        const sortedDates = Object.keys(dailyData).sort();

        sortedDates.forEach((dateStr, index) => {
            if (dateStr > limitDateStr) return;
            const d = dailyData[dateStr];
            const subItems = [];

            if (index === 0) {
                subItems.push({ label: 'Saldo de Abertura', sub: 'Base inicial', val: d.startBal, type: 'balance', dot: '#3b82f6', tag: 'INÍCIO' });
            }
            if (d.inIncome > 0) {
                subItems.push({ label: 'Entradas (Tarefas)', sub: 'Renda diária', val: d.inIncome, type: 'income', dot: '#10b981', tag: 'RECEBIDO' });
                totalIncome += d.inIncome;
            }
            if (d.inReturn > 0) {
                subItems.push({ label: 'Retorno de Contrato', sub: 'Capital Reavido', val: d.inReturn, type: 'income', dot: '#10b981', tag: 'RECEBIDO' });
                totalIncome += d.inReturn;
            }
            if (d.isCycleEnd) {
                subItems.push({ label: 'Reinvestimento Simulado', sub: 'Juros Compostos', val: 0, type: 'balance', dot: '#8b5cf6', tag: 'EFETIVADO' });
            }
            if (d.status !== 'none') {
                const label = d.status === 'realized' ? 'Saque Confirmado' : 'Saque Planejado';
                const val = d.status === 'realized' ? d.outWithdraw : Math.floor(d.tier * 0.90);
                subItems.push({ 
                    label,
                    sub: 'Transferência estratégica', 
                    val: val, 
                    type: d.status === 'realized' ? 'expense' : 'balance', 
                    dot: d.status === 'realized' ? '#3b82f6' : '#10b981', 
                    tag: d.status.toUpperCase() 
                });
                if (d.status === 'realized') totalExpense += d.outWithdraw;
            }

            if (subItems.length > 0) {
                const dateObj = new Date(dateStr + 'T12:00:00Z');
                const dayLabel = `${dateStr.split('-')[2]} • ${dateObj.toLocaleDateString('pt-BR', { weekday: 'long' })}`;
                html += `<div class="timeline-day-header">${dayLabel}</div>`;
                
                subItems.forEach((item, idx) => {
                    html += `
                        <div class="timeline-item">
                            <div class="timeline-marker">
                                <div class="timeline-dot" style="background: ${item.dot}"></div>
                                ${idx < subItems.length - 1 ? '<div class="timeline-line"></div>' : ''}
                            </div>
                            <div class="timeline-content">
                                <div><div class="timeline-label">${item.label}</div><div class="timeline-sublabel">${item.sub}</div></div>
                                <div class="text-right">
                                    <div class="timeline-value ${item.type}">${item.val > 0 ? (item.type === 'expense' ? '-' : '+') + Formatter.currency(item.val) : item.tag}</div>
                                    <div class="efetivar-badge">${item.tag}</div>
                                </div>
                            </div>
                        </div>`;
                });
            }
        });

        container.innerHTML = html || '<p class="text-center text-slate-500 py-10">Sem eventos no período.</p>';
        document.getElementById('timelineTotalEntries').innerText = Formatter.currency(totalIncome);
        document.getElementById('timelineTotalExits').innerText = Formatter.currency(totalExpense);
    },

    renderGoals(goals, dailyData, onRemove) {
        const container = document.getElementById('goalsList');
        if (!container) return;
        const sortedDates = Object.keys(dailyData).sort();
        const finalBal = dailyData[sortedDates[sortedDates.length - 1]]?.endBal || 0;

        container.innerHTML = (goals || []).map((goal, idx) => {
            const target = Formatter.toCents(goal.value);
            const progress = Math.min(100, Math.floor((finalBal / target) * 100));
            let date = '---';
            for (let d of sortedDates) if (dailyData[d].endBal >= target) { date = Formatter.dateDisplay(d); break; }
            
            return `
                <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700 relative group">
                    <div class="flex justify-between items-start mb-2">
                        <div><span class="text-xs font-bold text-white block">${goal.name}</span><span class="text-[9px] text-slate-500 uppercase">Alvo: ${Formatter.currency(target)}</span></div>
                        <div class="text-right"><span class="text-[10px] text-indigo-400 font-bold block">${date}</span><button onclick="app.removeGoal(${idx})" class="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt text-[9px]"></i></button></div>
                    </div>
                    <div class="h-1 w-full bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-indigo-500" style="width: ${progress}%"></div></div>
                </div>`;
        }).join('') || '<p class="text-center text-[10px] text-slate-500 italic">Nenhuma meta ativa</p>';
    },

    renderAlerts(portfolio) {
        const badge = document.getElementById('alertsBadge');
        const list = document.getElementById('alertsList');
        const container = document.getElementById('alertsContainer');
        if (!badge || !list || !container) return;
        
        const today = new Date();
        const alerts = [];

        (portfolio || []).forEach(p => {
            const end = new Date(Formatter.addDays(p.date, p.days));
            const diff = Math.ceil((end - today) / 86400000);
            if (diff <= 2 && diff >= 0) alerts.push({ type: 'warning', msg: `Vence em ${diff}d: ${p.name}`, icon: 'fa-exclamation-triangle' });
            else if (diff < 0 && diff > -5) alerts.push({ type: 'danger', msg: `VENCIDO: ${p.name}`, icon: 'fa-clock' });
        });

        if (alerts.length > 0) {
            container.classList.remove('hidden');
            badge.classList.remove('hidden'); badge.innerText = alerts.length;
            list.innerHTML = alerts.map(a => `<div class="p-2 bg-slate-900 border border-slate-700 rounded flex gap-2 items-center text-[10px]"><i class="fas ${a.icon} ${a.type === 'warning' ? 'text-yellow-500' : 'text-red-500'}"></i><span class="text-white">${a.msg}</span></div>`).join('');
        } else {
            container.classList.add('hidden'); badge.classList.add('hidden');
        }
    },

    renderWithdrawButtons(onSelect, selectedValue) {
        const grid = this.els.tiersGrid();
        if (!grid) return;
        grid.innerHTML = Calculator.WITHDRAWAL_TIERS.map(t => {
            const v = Formatter.fromCents(t);
            return `<button class="tier-btn ${selectedValue == v ? 'selected' : ''}" onclick="app.setWithdrawTarget(${v})">${v.toLocaleString('pt-BR')}</button>`;
        }).join('');
    },

    renderProfileList(profiles, currentId, onSwitch, onDelete) {
        const list = this.els.profileList();
        if (!list) return;
        list.innerHTML = Object.entries(profiles).map(([id, prof]) => {
            const isCurrent = id === currentId;
            return `
                <div class="p-3 flex justify-between items-center ${isCurrent ? 'bg-slate-800' : 'hover:bg-slate-800 cursor-pointer'}" onclick="${!isCurrent ? `app.switchProfile('${id}')` : ''}">
                    <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : 'bg-slate-600'}"></div><span class="text-xs ${isCurrent ? 'text-white font-bold' : 'text-slate-400'}">${prof.name}</span></div>
                    ${!isCurrent ? `<button class="text-slate-500 hover:text-red-400 px-2" onclick="event.stopPropagation(); app.deleteProfile('${id}')"><i class="fas fa-trash-alt text-[10px]"></i></button>` : '<span class="text-[9px] text-blue-500 font-bold uppercase">Ativo</span>'}
                </div>`;
        }).join('');
        this.els.currentProfileName().innerText = profiles[currentId].name;
    },

    toast(message, type = 'info') {
        let cont = document.querySelector('.toast-container') || Object.assign(document.createElement('div'), { className: 'toast-container' });
        if (!cont.parentElement) document.body.appendChild(cont);
        const t = Object.assign(document.createElement('div'), { className: `toast toast-${type}`, innerHTML: `<i class="fas ${type==='success'?'fa-check-circle':type==='error'?'fa-exclamation-circle':'fa-info-circle'}"></i> <span>${message}</span>` });
        cont.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; setTimeout(()=>t.remove(), 300); }, 3000);
    }
};
