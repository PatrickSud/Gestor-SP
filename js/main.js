import { store } from './store.js';
import { Formatter } from './utils/formatter.js';
import { Calculator } from './core/calculator.js';
import { Renderer } from './ui/render.js';
import { ChartManager } from './ui/chart.js';

/**
 * Main Application Controller
 */

class App {
    constructor() {
        this.init();
    }

    init() {
        // Global access for onclick handlers in HTML (temporary until fully migrated)
        window.app = this;

        // Initialize UI State from Store
        this.applyStoreToUI();
        
        // Initial Calculation
        this.runCalculation();

        // Subscribe to store changes
        store.subscribe((state) => {
            this.runCalculation(false); // Run without saving to avoid infinite loops
            this.updateUIPieces(state);
        });

        // Set up event listeners
        this.setupEventListeners();
        
        Renderer.toast('Sistema inicializado com sucesso', 'success');
    }

    // --- Core Logic ---
    runCalculation(save = true) {
        const results = Calculator.calculate(
            store.state.inputs,
            store.state.portfolio,
            store.state.selectedWeeks,
            store.state.realizedWithdrawals
        );

        if (results) {
            store.setResults(results.results);
            store.setDailyData(results.dailyData);
            
            // Update UI components
            Renderer.renderResults(results.results);
            Renderer.renderTable(results.dailyData, parseInt(store.state.inputs.viewPeriodSelect), store.state.inputs.dataInicio);
            Renderer.renderCalendar(store.state.inputs.dataInicio, results.dailyData, results.cycleEnds);
            Renderer.renderPortfolio(store.state.portfolio, (id) => this.removeInvestment(id));
            
            // Sync strategy buttons
            Renderer.renderWithdrawButtons((val) => {
                store.updateInput('withdrawTarget', val);
                this.runCalculation();
            }, store.state.inputs.withdrawTarget);
            
            // Update Chart
            ChartManager.renderBalanceChart('balanceChart', results.results.graphData);
            
            // Goals & Alerts
            Renderer.renderGoals(store.state.goals, results.dailyData, (idx) => this.removeGoal(idx));
            Renderer.renderAlerts(store.state.portfolio);
            
            if (save) store.saveToStorage();
        }
    }

    // --- UI Event Handlers ---
    setupEventListeners() {
        // Generic Input Handler
        document.querySelectorAll('input, select').forEach(el => {
            if (!el.id) return;
            
            // Skip fields that shouldn't auto-calculate or are handled specifically
            const skip = ['newInv', 'newProfile', 'editCurrentProfile', 'commitBase', 'search'];
            if (skip.some(s => el.id.startsWith(s))) return;

            el.addEventListener('change', (e) => {
                const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                store.updateInput(el.id, val);
                
                // Specific UI toggles
                if (el.id === 'taskLevel') {
                    if (val === 'custom') {
                        document.getElementById('customTaskInput').classList.remove('hidden');
                    } else {
                        document.getElementById('customTaskInput').classList.add('hidden');
                        document.getElementById('taskDailyValue').value = val;
                        store.updateInput('taskDailyValue', val);
                    }
                }
                
                if (el.id === 'monthlyIncomeToggle') {
                    document.getElementById('monthlyIncomeContainer').classList.toggle('hidden', !val);
                }
                
                if (el.id === 'withdrawStrategy') {
                    document.getElementById('withdrawFixedOptions').classList.toggle('hidden', val !== 'fixed');
                    document.getElementById('withdrawWeeklyOptions').classList.toggle('hidden', val !== 'weekly');
                }
                
                this.runCalculation(); // Force immediate calculation on change
            });
        });

        // Investment Add Handler
        document.getElementById('addInvBtn').onclick = () => this.addInvestment();

        // Backup Import Handler
        const importInp = document.getElementById('importFile');
        if (importInp) {
            importInp.onchange = (e) => this.importBackup(e.target.files[0]);
        }
    }

    applyStoreToUI() {
        const { inputs } = store.state;
        for (const [id, value] of Object.entries(inputs)) {
            const el = document.getElementById(id);
            if (!el) continue;
            
            if (el.type === 'checkbox') el.checked = value;
            else el.value = value;
        }

        // Restore Toggles
        document.getElementById('monthlyIncomeContainer').classList.toggle('hidden', !inputs.monthlyIncomeToggle);
        document.getElementById('customTaskInput').classList.toggle('hidden', inputs.taskLevel !== 'custom');
        document.getElementById('withdrawFixedOptions').classList.toggle('hidden', inputs.withdrawStrategy !== 'fixed');
        document.getElementById('withdrawWeeklyOptions').classList.toggle('hidden', inputs.withdrawStrategy !== 'weekly');
        
        // Restore Future Toggle Visuals
        const futureOn = inputs.futureToggle === 'true';
        document.getElementById('futureConfigPanel').classList.toggle('hidden', !futureOn);
        this.updateFutureToggleVisual(futureOn);

        // Render Initial Pieces
        Renderer.renderWithdrawButtons((val) => {
            store.updateInput('withdrawTarget', val);
            this.runCalculation();
            Renderer.renderWithdrawButtons(null, val); // Refresh selection
        }, inputs.withdrawTarget);
        
        this.restoreWeeksUI();
    }

    updateUIPieces(state) {
        Renderer.renderProfileList(state.profiles, state.currentProfileId, 
            (id) => this.switchProfile(id), 
            (id) => this.deleteProfile(id)
        );

        // Refresh dynamic UI selectors
        this.restoreWeeksUI();
        Renderer.renderWithdrawButtons((val) => {
            store.updateInput('withdrawTarget', val);
            this.runCalculation();
        }, state.inputs.withdrawTarget);
    }

    // --- Actions ---
    addInvestment() {
        const name = document.getElementById('newInvName').value;
        const val = parseFloat(document.getElementById('newInvVal').value);
        const date = document.getElementById('newInvDate').value;
        const days = parseInt(document.getElementById('newInvDays').value);
        const rate = parseFloat(document.getElementById('newInvRate').value);

        if (!name || isNaN(val) || !date || isNaN(days) || isNaN(rate)) {
            return Renderer.toast('Preencha todos os campos do investimento', 'error');
        }

        const newInv = { id: Date.now(), name, val, date, days, rate };
        store.setState({ portfolio: [...store.state.portfolio, newInv] });
        
        // Clear inputs
        document.getElementById('newInvName').value = '';
        document.getElementById('newInvVal').value = '';
        
        Renderer.toast('Investimento adicionado');
        this.runCalculation();
    }

    removeInvestment(id) {
        store.setState({ portfolio: store.state.portfolio.filter(p => p.id !== id) });
        this.runCalculation();
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        
        if (isOpen) {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        } else {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        }
    }

    switchTab(tabName) {
        const tabs = ['resources', 'simulation', 'goals'];
        tabs.forEach(t => {
            const btn = document.getElementById('tab-' + t);
            const content = document.getElementById('content-' + t);
            if (t === tabName) {
                btn.className = "flex-1 py-3 text-xs font-bold uppercase tracking-wider text-white bg-slate-700/50 border-b-2 border-blue-500 transition-colors";
                content.classList.remove('hidden');
            } else {
                btn.className = "flex-1 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white border-b-2 border-transparent transition-colors";
                content.classList.add('hidden');
            }
        });
    }

    toggleFuturePlanning() {
        const current = store.state.inputs.futureToggle === 'true';
        const newVal = !current;
        store.updateInput('futureToggle', String(newVal));
        
        document.getElementById('futureConfigPanel').classList.toggle('hidden', !newVal);
        this.updateFutureToggleVisual(newVal);
        this.runCalculation();
    }

    updateFutureToggleVisual(on) {
        const knob = document.getElementById('futureToggleKnob');
        const visual = document.getElementById('futureToggleVisual');
        if (on) {
            visual.classList.replace('bg-slate-800', 'bg-emerald-500');
            visual.classList.replace('border-slate-600', 'border-emerald-400');
            knob.classList.replace('left-1', 'left-6');
            knob.classList.replace('bg-slate-400', 'bg-white');
        } else {
            visual.classList.replace('bg-emerald-500', 'bg-slate-800');
            visual.classList.replace('border-emerald-400', 'border-slate-600');
            knob.classList.replace('left-6', 'left-1');
            knob.classList.replace('bg-white', 'bg-slate-400');
        }
    }

    togglePortfolioDetails() {
        const content = document.getElementById('portfolioDetails');
        const chevron = document.getElementById('invChevron');
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        chevron.classList.toggle('rotate-180', isHidden);
    }

    syncBalance() {
        const projected = Formatter.fromCents(store.state.results.finalBalance); // Simple sync for today would be better
        // Based on original logic: projectedTodayBalance
        // Need to extract today's balance from dailyData
        const todayStr = new Date().toISOString().split('T')[0];
        const todayData = store.state.dailyData[todayStr];
        
        if (!todayData) return Renderer.toast('Dados de hoje não disponíveis', 'error');
        
        const val = Formatter.fromCents(todayData.endBal);
        
        if (confirm(`Deseja atualizar o Saldo Inicial para R$ ${val.toFixed(2)}?\nIsso altera a base de cálculo.`)) {
            store.updateInput('currentWalletBalance', val.toFixed(2));
            document.getElementById('currentWalletBalance').value = val.toFixed(2);
            this.runCalculation();
            Renderer.toast('Saldo sincronizado');
        }
    }

    openDayDetails(dateStr) {
        const data = store.state.dailyData[dateStr];
        if (!data) return Renderer.toast('Dia fora do período de simulação', 'error');

        document.getElementById('modalDate').innerText = Formatter.dateDisplay(dateStr);
        document.getElementById('modalStartBal').innerText = Formatter.currency(data.startBal);
        document.getElementById('modalEndBal').innerText = Formatter.currency(data.endBal);
        
        document.getElementById('modalFlowIncome').innerText = Formatter.currency(data.inIncome);
        document.getElementById('modalFlowReturns').innerText = Formatter.currency(data.inReturn);
        document.getElementById('modalFlowReinvest').innerText = `-${Formatter.currency(data.outReinvest)}`; // Simplified display
        document.getElementById('modalFlowWithdraw').innerText = `-${Formatter.currency(data.outWithdraw)}`;

        const matList = document.getElementById('modalMaturingList');
        const matSec = document.getElementById('modalMaturingSection');
        if (data.maturing && data.maturing.length > 0) {
            matSec.classList.remove('hidden');
            matList.innerHTML = data.maturing.map(m => `
                <div class="flex justify-between items-center text-[10px] border-b border-slate-700/50 py-1 last:border-0">
                    <span class="text-slate-300 truncate w-1/2">${m.name}</span>
                    <div class="text-right">
                        <span class="block text-emerald-400 font-bold">+${Formatter.currency(m.total)}</span>
                        <span class="text-slate-500 text-[9px]">(Lucro: ${Formatter.currency(m.profit)})</span>
                    </div>
                </div>`).join('');
        } else {
            matSec.classList.add('hidden');
        }

        const wSec = document.getElementById('modalWithdrawSection');
        const canWithdraw = data.tier > 0 || data.status !== 'none';
        
        if (canWithdraw) {
            wSec.classList.remove('hidden');
            
            // Value display logic
            const amountToDisplay = data.status === 'realized' ? data.outWithdraw : Math.floor(data.tier * 0.90);
            document.getElementById('modalWithdrawVal').innerText = Formatter.currency(amountToDisplay);
            
            const status = document.getElementById('modalWithdrawStatus');
            if (data.status === 'realized') {
                status.innerText = "SAQUE CONFIRMADO";
                status.className = "text-blue-400 font-bold uppercase mt-1";
            } else {
                const label = data.status === 'planned' ? 'SAQUE PLANEJADO' : 'DISPONÍVEL (FORA DA ESTRATÉGIA)';
                status.innerHTML = `
                    <div class="text-emerald-500 font-bold uppercase mt-1 mb-2">${label}</div>
                    <button onclick="app.executeWithdrawal('${dateStr}', ${Formatter.fromCents(data.tier)})" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-2 rounded-lg transition-colors">
                        <i class="fas fa-hand-holding-usd mr-1"></i> Realizar Saque Agora
                    </button>
                `;
                status.className = "";
            }
        } else {
            wSec.classList.add('hidden');
        }
        
        this.openModal('dayModal');
    }

    openTimelineModal() {
        Renderer.renderTimeline(
            store.state.dailyData, 
            parseInt(store.state.inputs.viewPeriodSelect), 
            store.state.inputs.dataInicio
        );
        this.openModal('timelineModal');
    }

    openCardDetails(type) {
        const content = document.getElementById('cardModalContent');
        const results = store.state.results;
        let html = '';

        if (type === 'profit') {
            html = `
                <h3 class="text-lg font-bold text-emerald-400 mb-4"><i class="fas fa-chart-line mr-2"></i>Detalhamento de Lucros</h3>
                <div class="space-y-3">
                    <div class="bg-slate-900 p-3 rounded-lg border border-emerald-900/30 text-center mt-2">
                        <span class="block text-xs text-slate-500 uppercase">Lucro Líquido Projetado</span>
                        <span class="block text-2xl font-black text-emerald-400">${Formatter.currency(results.netProfit)}</span>
                        <span class="text-[10px] text-emerald-600 font-bold">ROI: ${results.roi.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        } else if (type === 'withdrawn') {
            const history = results.withdrawalHistory || [];
            let listHtml = history.length === 0 ? '<p class="text-xs text-slate-500 italic text-center">Nenhum saque realizado.</p>' : '';
            history.slice(-5).reverse().forEach(w => {
                listHtml += `
                    <div class="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded mb-1">
                        <span class="text-slate-400">${Formatter.dateDisplay(w.date)}</span>
                        <span class="text-blue-400 font-bold">${Formatter.currency(w.val)}</span>
                    </div>`;
            });
            
            html = `
                <h3 class="text-lg font-bold text-blue-400 mb-4"><i class="fas fa-hand-holding-usd mr-2"></i>Histórico de Saques</h3>
                <div class="text-center mb-4">
                    <span class="text-3xl font-black text-white">${Formatter.currency(results.totalWithdrawn)}</span>
                    <p class="text-[10px] text-slate-500">Total líquido transferido</p>
                </div>
                <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Últimos 5 Saques</p>
                <div class="max-h-[150px] overflow-y-auto">${listHtml}</div>
            `;
        } else if (type === 'balance') {
            const cash = results.finalWallet || 0;
            const active = results.finalActiveInv || 0;
            const total = cash + active;
            const cashPerc = total > 0 ? (cash/total)*100 : 0;
            
            html = `
                <h3 class="text-lg font-bold text-white mb-4"><i class="fas fa-piggy-bank mr-2"></i>Composição do Saldo</h3>
                <div class="text-center mb-4">
                    <span class="text-3xl font-black text-white">${Formatter.currency(total)}</span>
                    <p class="text-[10px] text-slate-500">Projeção Final</p>
                </div>
                <div class="h-4 bg-slate-700 rounded-full overflow-hidden flex mb-4">
                    <div class="h-full bg-emerald-500" style="width: ${100-cashPerc}%"></div>
                    <div class="h-full bg-blue-500" style="width: ${cashPerc}%"></div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="bg-slate-900 p-2 rounded border border-slate-700">
                        <div class="flex items-center gap-1 mb-1"><div class="w-2 h-2 rounded-full bg-emerald-500"></div><span class="text-slate-400">Investido</span></div>
                        <span class="font-bold text-white block text-right">${Formatter.currency(active)}</span>
                    </div>
                    <div class="bg-slate-900 p-2 rounded border border-slate-700">
                        <div class="flex items-center gap-1 mb-1"><div class="w-2 h-2 rounded-full bg-blue-500"></div><span class="text-slate-400">Em Caixa</span></div>
                        <span class="font-bold text-white block text-right">${Formatter.currency(cash)}</span>
                    </div>
                </div>
            `;
        } else if (type === 'next') {
            html = `
                <h3 class="text-lg font-bold text-yellow-400 mb-4"><i class="fas fa-clock mr-2"></i>Próximo Saque</h3>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4 text-center">
                    <span class="text-xs text-slate-400 block">Data Estimada</span>
                    <span class="text-xl font-bold text-white">${results.nextWithdrawDate !== '-' ? Formatter.dateDisplay(results.nextWithdrawDate) : '---'}</span>
                    <span class="text-sm font-bold text-yellow-400 block mt-1">${Formatter.currency(results.nextWithdraw)}</span>
                </div>
            `;
        }

        content.innerHTML = html;
        this.openModal('cardModal');
    }

    // --- Profile Actions ---
    openProfileModal() {
        const current = store.state.profiles[store.state.currentProfileId];
        document.getElementById('editCurrentProfileName').value = current.name;
        this.openModal('profileModal');
    }

    saveProfileName() {
        const name = document.getElementById('editCurrentProfileName').value;
        if (!name) return Renderer.toast('Nome inválido', 'error');
        
        const profiles = { ...store.state.profiles };
        profiles[store.state.currentProfileId].name = name;
        store.setState({ profiles });
        Renderer.toast('Nome do perfil atualizado');
    }

    createProfile() {
        const name = document.getElementById('newProfileName').value;
        if (!name) return Renderer.toast('Digite um nome', 'error');
        store.addProfile(name);
        document.getElementById('newProfileName').value = '';
        Renderer.toast('Perfil criado com sucesso');
        this.applyStoreToUI();
        this.runCalculation();
    }

    switchProfile(id) {
        store.switchProfile(id);
        this.applyStoreToUI();
        this.runCalculation();
        this.closeModal('profileModal');
    }

    deleteProfile(id) {
        if (confirm("Tem certeza que deseja excluir este perfil?")) {
            if (store.deleteProfile(id)) {
                this.applyStoreToUI();
                this.runCalculation();
                Renderer.toast('Perfil removido');
            } else {
                Renderer.toast('Não é possível remover o único perfil', 'error');
            }
        }
    }

    // --- Weekly Strategy ---
    toggleWeek(week, btn) {
        let weeks = [...store.state.selectedWeeks];
        if (weeks.includes(week)) {
            weeks = weeks.filter(w => w !== week);
            btn.classList.remove('active');
        } else {
            weeks.push(week);
            btn.classList.add('active');
        }
        store.setState({ selectedWeeks: weeks });
        this.runCalculation();
    }

    restoreWeeksUI() {
        const weeks = store.state.selectedWeeks;
        document.querySelectorAll('.week-btn').forEach((btn, idx) => {
            const week = idx + 1;
            btn.classList.toggle('active', weeks.includes(week));
            // Ensure onclick is bound
            btn.onclick = () => this.toggleWeek(week, btn);
        });
    }

    // --- Simulation Commit ---
    openCommitModal() {
        this.openModal('commitModal');
    }

    confirmCommit() {
        const baseName = document.getElementById('commitBaseName').value;
        if (!baseName) return Renderer.toast('Informe um nome base', 'error');

        const inputs = store.state.inputs;
        const capIni = parseFloat(inputs.capitalInicial);
        const days = parseInt(inputs.diasCiclo);
        const rate = parseFloat(inputs.taxaDiaria);
        const reps = parseInt(inputs.repeticoesCiclo);

        let portfolio = [...store.state.portfolio];
        let currentVal = capIni;
        let currentDateStr = new Date().toISOString().split('T')[0];

        for (let i = 0; i < reps; i++) {
            portfolio.push({
                id: Date.now() + i,
                name: `${baseName} (${i + 1}/${reps})`,
                val: parseFloat(currentVal.toFixed(2)),
                date: currentDateStr,
                days: days,
                rate: rate
            });
            const profit = currentVal * (rate / 100) * days;
            currentVal += profit;
            currentDateStr = Formatter.addDays(currentDateStr, days);
        }

        store.setState({ portfolio });
        this.closeModal('commitModal');
        document.getElementById('commitBaseName').value = '';
        this.switchTab('resources');
        Renderer.toast('Simulação efetivada com sucesso!', 'success');
        this.runCalculation();
    }

    // --- Goals Actions ---
    addGoal() {
        const name = document.getElementById('goalName').value;
        const val = parseFloat(document.getElementById('goalValue').value);
        if (!name || isNaN(val)) return Renderer.toast('Preencha os dados da meta', 'error');

        const goals = [...(store.state.goals || []), { name, value: val }];
        store.setState({ goals });
        document.getElementById('goalName').value = '';
        document.getElementById('goalValue').value = '';
        Renderer.toast('Meta adicionada!');
        this.runCalculation();
    }

    removeGoal(index) {
        const goals = store.state.goals.filter((_, i) => i !== index);
        store.setState({ goals });
        this.runCalculation();
    }

    // --- Alerts Action ---
    openAlertsModal() {
        this.openModal('alertsModal');
    }

    // --- Backup Actions ---
    exportBackup() {
        const data = store.exportAllData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_gestor_sp_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        Renderer.toast('Backup gerado com sucesso!', 'success');
    }

    importBackup(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            if (store.importAllData(e.target.result)) {
                Renderer.toast('Backup restaurado com sucesso!', 'success');
                this.applyStoreToUI();
                this.runCalculation();
            } else {
                Renderer.toast('Erro ao importar backup. Formato inválido.', 'error');
            }
        };
        reader.readAsText(file);
    }

    executeWithdrawal(date, amount) {
        if (!confirm(`Confirma o saque de R$ ${amount}? \nIsso será registrado como um 'Saque Realizado' e influenciará sua projeção.`)) return;

        const realizedWithdrawals = [...(store.state.realizedWithdrawals || []), { date, amount }];
        store.setState({ realizedWithdrawals });
        
        Renderer.toast('Saque realizado com sucesso!', 'success');
        this.runCalculation();
        this.openDayDetails(date); // Refresh modal
    }

    // --- Utils ---
    openModal(id) { document.getElementById(id).classList.remove('hidden'); }
    closeModal(id) { document.getElementById(id).classList.add('hidden'); }
    
    resetData() {
        if (confirm("Deseja limpar todos os dados do perfil atual?")) {
            const initial = store.getInitialData();
            store.setState({
                inputs: initial.inputs,
                portfolio: initial.portfolio,
                selectedWeeks: initial.selectedWeeks
            });
            this.applyStoreToUI();
            this.runCalculation();
            Renderer.toast('Dados limpos');
        }
    }

    setWithdrawTarget(val) {
        store.updateInput('withdrawTarget', val);
        this.runCalculation();
        Renderer.toast(`Meta de saque definida: ${Formatter.currency(Formatter.toCents(val))}`);
    }

    exportToCSV() {
        const dailyData = store.state.dailyData;
        let csv = "Data,Saldo Inicial,Retorno,Renda,Aporte,Saque,Saldo Final\n";
        
        Object.keys(dailyData).sort().forEach(date => {
            const d = dailyData[date];
            csv += `${date},${Formatter.fromCents(d.startBal)},${Formatter.fromCents(d.inReturn)},${Formatter.fromCents(d.inIncome)},0,${Formatter.fromCents(d.outWithdraw)},${Formatter.fromCents(d.endBal)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `gestor_sp_${store.state.currentProfileId}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
