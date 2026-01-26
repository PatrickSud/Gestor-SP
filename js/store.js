/**
 * State Management using Pub/Sub pattern
 */

class Store {
    constructor() {
        this.state = {
            currentProfileId: 'default',
            profiles: {
                'default': {
                    name: 'Principal',
                    data: this.getInitialData()
                }
            },
            portfolio: [],
            selectedWeeks: [],
            inputs: {},
            results: {
                netProfit: 0,
                totalWithdrawn: 0,
                finalBalance: 0,
                nextWithdraw: 0,
                nextWithdrawDate: '-',
                roi: 0,
                graphData: [] // For Chart.js
            },
            dailyData: {},
            lastCalculationTime: Date.now()
        };

        this.listeners = [];
        this.loadFromStorage();
    }

    getInitialData() {
        const today = new Date().toISOString().split('T')[0];
        return {
            inputs: {
                dataInicio: today,
                withdrawalDaySelect: "1",
                viewPeriodSelect: "30",
                currentWalletBalance: "0",
                monthlyExtraIncome: "0",
                monthlyIncomeToggle: false,
                taskLevel: "0",
                taskDailyValue: "0",
                withdrawStrategy: "none",
                withdrawTarget: "0",
                futureToggle: "false",
                capitalInicial: "50",
                diasCiclo: "3",
                taxaDiaria: "1.2",
                repeticoesCiclo: "1",
                mergeSimToggle: false,
                bonusTier1: "3",
                minTier1: "50",
                limitTier1: "99",
                bonusTier2: "6",
                commitBaseName: ""
            },
            portfolio: [],
            selectedWeeks: []
        };
    }

    // --- Subscription Logic ---
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // --- State Mutations ---
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.saveToStorage();
        this.notify();
    }

    updateInput(id, value) {
        this.state.inputs[id] = value;
        this.saveToStorage();
        this.notify();
    }

    setResults(results) {
        this.state.results = { ...this.state.results, ...results };
        // Não chamamos notify() aqui para evitar loop infinito com o runCalculation
    }

    setDailyData(data) {
        this.state.dailyData = data;
    }

    // --- Profile Management ---
    switchProfile(id) {
        if (!this.state.profiles[id]) return;
        
        // Save current profile data before switching
        this.state.profiles[this.state.currentProfileId].data = {
            inputs: { ...this.state.inputs },
            portfolio: [...this.state.portfolio],
            selectedWeeks: [...this.state.selectedWeeks]
        };

        this.state.currentProfileId = id;
        const profile = this.state.profiles[id].data;
        
        this.state.inputs = { ...profile.inputs };
        this.state.portfolio = [...profile.portfolio];
        this.state.selectedWeeks = [...profile.selectedWeeks];

        this.saveToStorage();
        this.notify();
    }

    addProfile(name) {
        const id = 'prof_' + Date.now();
        this.state.profiles[id] = {
            name: name,
            data: this.getInitialData()
        };
        this.switchProfile(id);
    }

    deleteProfile(id) {
        if (Object.keys(this.state.profiles).length <= 1) return false;
        
        const wasCurrent = this.state.currentProfileId === id;
        delete this.state.profiles[id];
        
        if (wasCurrent) {
            this.switchProfile(Object.keys(this.state.profiles)[0]);
        } else {
            this.saveToStorage();
            this.notify();
        }
        return true;
    }

    // --- Persistence ---
    saveToStorage() {
        const dataToSave = {
            currentProfileId: this.state.currentProfileId,
            profiles: this.state.profiles
        };
        localStorage.setItem('gestor_sp_profiles', JSON.stringify(dataToSave));
        
        // For current profile ease of access
        this.state.profiles[this.state.currentProfileId].data = {
            inputs: this.state.inputs,
            portfolio: this.state.portfolio,
            selectedWeeks: this.state.selectedWeeks
        };
    }

    loadFromStorage() {
        const saved = localStorage.getItem('gestor_sp_profiles');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state.currentProfileId = parsed.currentProfileId;
            this.state.profiles = parsed.profiles;
            
            const current = this.state.profiles[this.state.currentProfileId].data;
            this.state.inputs = { ...current.inputs };
            this.state.portfolio = [...current.portfolio];
            this.state.selectedWeeks = [...current.selectedWeeks];
        } else {
            // Migration from old app
            const oldState = localStorage.getItem('app_profiles');
            if (oldState) {
                const parsed = JSON.parse(oldState);
                // Simple migration logic if needed
            } else {
                this.state.inputs = this.getInitialData().inputs;
            }
        }
    }
}

export const store = new Store();
