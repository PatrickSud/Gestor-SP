/**
 * Chart.js wrapper for the application
 */

let chartInstance = null;

export const ChartManager = {
    /**
     * Renders or updates the Balance vs Time chart
     * @param {Array} data - Array of {x: date, y: value} objects
     */
    renderBalanceChart(containerId, data) {
        const ctx = document.getElementById(containerId);
        if (!ctx) return;

        if (chartInstance) {
            chartInstance.destroy();
        }

        // Only show a subset of data for long periods for better performance
        const displayData = data.length > 90 ? data.filter((_, i) => i % Math.ceil(data.length / 90) === 0) : data;

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Projeção de Patrimônio',
                    data: displayData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'DD/MM'
                            }
                        },
                        grid: {
                            display: false,
                        },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 }
                        }
                    },
                    y: {
                        grid: {
                            color: '#1e293b',
                        },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            callback: (value) => 'R$ ' + value.toLocaleString('pt-BR')
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        borderColor: '#334155',
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
};
