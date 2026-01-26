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
            
            const data = dailyData[dateStr];
            // Only show significant days
            const isSignificant = data.executed || data.tier > 0 || data.inReturn > 0 || dateStr === limitDateStr;
            
            if (isSignificant) {
                html += `
                    <tr class="hover:bg-slate-700/50 border-b border-slate-700/50 transition-colors cursor-pointer" onclick="app.openDayDetails('${dateStr}')">
                        <td class="p-2 text-slate-300 border-r border-slate-700/50 whitespace-nowrap">${Formatter.dateDisplay(dateStr)}</td>
                        <td class="p-2 text-right text-slate-500 hidden md:table-cell col-money">${Formatter.currency(data.startBal)}</td>
                        <td class="p-2 text-right text-emerald-400 font-bold col-money">${data.inReturn > 0 ? '+' + Formatter.currency(data.inReturn) : '-'}</td>
                        <td class="p-2 text-right text-indigo-400 col-money">${data.inIncome > 0 ? '+' + Formatter.currency(data.inIncome) : '-'}</td>
                        <td class="p-2 text-right text-blue-400 col-money">${data.outReinvest > 0 ? '-' + Formatter.currency(data.outReinvest) : '-'}</td>
                        <td class="p-2 text-right text-yellow-500 col-money">${data.executed ? '-' + Formatter.currency(data.outWithdraw) : '-'}</td>
                        <td class="p-2 text-right text-white font-bold bg-slate-800/30 border-l border-slate-700/50 col-money">${Formatter.currency(data.endBal)}</td>
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
        const [y, m, d] = startDateStr.split('-').map(Number);
        const curDate = new Date(Date.UTC(y, m - 1, 1));
        const limitDate = Formatter.addDays(startDateStr, 365);
        const todayStr = new Date().toISOString().split('T')[0];

        let monthsRendered = 0;
        while (monthsRendered < 12) {
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
            for (let d = 1; d <= daysInMonth; d++) {
                const dayStr = `${curDate.getUTCFullYear()}-${String(curDate.getUTCMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const data = dailyData[dayStr];
                const isCycle = cycleEnds.includes(dayStr);
                
                let classes = "cal-day text-slate-400";
                let dots = '';

                if (dayStr === todayStr) classes += " today";
                if (data) {
                    if (data.executed) classes += " withdraw-executed";
                    else if (data.tier > 0) classes += " withdraw-day";
                }
                
                if (isCycle) dots += `<div class="w-1 h-1 bg-emerald-500 rounded-full"></div>`;

                const cell = document.createElement('div');
                cell.className = classes;
                cell.innerHTML = `<span class="z-10">${d}</span>${dots ? `<div class="flex gap-0.5 mb-0.5 absolute bottom-1">${dots}</div>`: ''}`;
                cell.onclick = () => app.openDayDetails(dayStr);
                grid.appendChild(cell);
            }
            
            monthDiv.appendChild(grid);
            container.appendChild(monthDiv);
            curDate.setUTCMonth(curDate.getUTCMonth() + 1);
            monthsRendered++;
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

        if (sortedDates.length === 0) {
            container.innerHTML = '<div class="text-center py-20 text-slate-500 font-bold italic text-sm">Nenhum dado projetado para este período.</div>';
            return;
        }

        let itemsRendered = 0;

        sortedDates.forEach((dateStr, index) => {
            if (dateStr > limitDateStr) return;
            const d = dailyData[dateStr];
            
            // Atividades do dia
            const subItems = [];

            // 0. Saldo de Abertura (Apenas no primeiro dia)
            if (index === 0) {
                subItems.push({ 
                    label: 'Saldo de Abertura', 
                    sub: 'Base inicial configurada', 
                    val: d.startBal, 
                    type: 'balance',
                    dot: '#3b82f6',
                    customText: Formatter.currency(d.startBal)
                });
            }

            // 1. Renda de Tarefas
            if (d.inIncome > 0) {
                subItems.push({ 
                    label: 'Entradas (Tarefas)', 
                    sub: 'Renda diária do nível selecionado', 
                    val: d.inIncome, 
                    type: 'income',
                    dot: '#10b981'
                });
                totalIncome += d.inIncome;
            }

            // 2. Retornos de Contratos
            if (d.inReturn > 0) {
                subItems.push({ 
                    label: 'Retorno de Contrato', 
                    sub: 'Capital + Lucro desbloqueado', 
                    val: d.inReturn, 
                    type: 'income',
                    dot: '#10b981'
                });
                totalIncome += d.inReturn;
            }

            // 3. Simulação
            if (d.isCycleEnd) {
                subItems.push({ 
                    label: 'Reinvestimento Simulado', 
                    sub: 'Ciclo de juros compostos', 
                    val: 0,
                    type: 'balance',
                    dot: '#8b5cf6',
                    customText: 'EFETIVADO' 
                });
            }

            // 4. Saques
            if (d.outWithdraw > 0) {
                subItems.push({ 
                    label: 'Saque Estratégico', 
                    sub: 'Transferência realizada (líquida)', 
                    val: d.outWithdraw, 
                    type: 'expense',
                    dot: '#ef4444'
                });
                totalExpense += d.outWithdraw;
            }

            // Se for um dia importante ou o último dia, mostramos o Saldo Previsto
            if (subItems.length > 0 || dateStr === limitDateStr) {
                subItems.push({ 
                    label: 'Saldo Previsto', 
                    sub: 'Acumulado até o momento', 
                    val: d.endBal, 
                    type: 'balance',
                    dot: '#64748b',
                    customText: Formatter.currency(d.endBal)
                });
            }

            // Renderizar se houver itens no dia
            if (subItems.length > 0) {
                itemsRendered++;
                const dateObj = new Date(dateStr + 'T12:00:00Z');
                const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
                const dayNum = dateStr.split('-')[2];
                const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'short' });

                html += `<div class="timeline-day-header">${dayNum} de ${monthName} • ${dayName}</div>`;
                
                subItems.forEach((item, idx) => {
                    const isLast = idx === subItems.length - 1;
                    html += `
                        <div class="timeline-item">
                            <div class="timeline-marker">
                                <div class="timeline-dot" style="background: ${item.dot}"></div>
                                ${!isLast ? '<div class="timeline-line"></div>' : ''}
                            </div>
                            <div class="timeline-content">
                                <div>
                                    <div class="timeline-label">${item.label}</div>
                                    <div class="timeline-sublabel">${item.sub}</div>
                                </div>
                                <div class="text-right">
                                    <div class="timeline-value ${item.type}">${item.customText || (item.type === 'expense' ? '-' : '+') + Formatter.currency(item.val)}</div>
                                    <div class="efetivar-badge">Padrão</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }
        });

        if (itemsRendered === 0) {
            container.innerHTML = '<div class="text-center py-20 text-slate-500 font-bold italic text-sm">Nenhum evento financeiro neste período.</div>';
        } else {
            container.innerHTML = html;
        }
        
        document.getElementById('timelineTotalEntries').innerText = Formatter.currency(totalIncome);
        document.getElementById('timelineTotalExits').innerText = Formatter.currency(totalExpense);
    },

    renderWithdrawButtons(onSelect, selectedValue) {
        const grid = this.els.tiersGrid();
        if (!grid) return;
        
        grid.innerHTML = '';
        Calculator.WITHDRAWAL_TIERS.forEach(tierCents => {
            const val = Formatter.fromCents(tierCents);
            const btn = document.createElement('button');
            btn.className = `tier-btn ${selectedValue == val ? 'selected' : ''}`;
            btn.innerText = val.toLocaleString('pt-BR');
            btn.onclick = () => onSelect(val);
            grid.appendChild(btn);
        });
    },

    renderProfileList(profiles, currentId, onSwitch, onDelete) {
        const list = this.els.profileList();
        if (!list) return;

        list.innerHTML = '';
        Object.entries(profiles).forEach(([id, prof]) => {
            const isCurrent = id === currentId;
            const div = document.createElement('div');
            div.className = `p-3 flex justify-between items-center ${isCurrent ? 'bg-slate-800' : 'hover:bg-slate-800'} transition-colors cursor-pointer`;
            div.onclick = () => onSwitch(id);
            div.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : 'bg-slate-600'}"></div>
                    <span class="text-xs ${isCurrent ? 'text-white font-bold' : 'text-slate-400'}">${prof.name}</span>
                </div>
                ${!isCurrent ? `<button class="text-slate-500 hover:text-red-400 px-2 delete-btn"><i class="fas fa-trash-alt text-[10px]"></i></button>` : '<span class="text-[9px] text-blue-500 font-bold uppercase">Ativo</span>'}
            `;
            if (!isCurrent) {
                div.querySelector('.delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    onDelete(id);
                };
            }
            list.appendChild(div);
        });
        
        this.els.currentProfileName().innerText = profiles[currentId].name;
    },

    toast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = `<i class="fas ${icons[type]}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
