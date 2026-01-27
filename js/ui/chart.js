import { Formatter } from '../utils/formatter.js'

let chartInstance = null

export const ChartManager = {
  renderBalanceChart(containerId, data) {
    const ctx = document.getElementById(containerId)
    if (!ctx) return

    if (chartInstance) {
      chartInstance.destroy()
    }

    const displayData =
      data.length > 90
        ? data.filter((_, i) => i % Math.ceil(data.length / 90) === 0)
        : data

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Projeção de Patrimônio',
            data: displayData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
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
              display: false
            },
            ticks: {
              color: '#64748b',
              font: { size: 10 }
            }
          },
          y: {
            grid: {
              color: '#1e293b'
            },
            ticks: {
              color: '#64748b',
              font: { size: 10 },
              callback: value =>
                'R$ ' + value.toLocaleString('pt-BR')
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
              label: context => {
                let label = context.dataset.label || ''
                if (label) label += ': '
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  }).format(context.parsed.y)
                }
                return label
              },
              afterBody: items => {
                const item = items && items[0]
                if (!item || !item.raw || !item.raw.meta) return []
                const meta = item.raw.meta
                const lines = []

                if (meta.incomeTask > 0) {
                  lines.push(
                    'Entradas (Tarefas): +' + Formatter.currency(meta.incomeTask)
                  )
                }
                if (meta.incomeRecurring > 0) {
                  lines.push(
                    'Entradas (Recorrentes): +' +
                      Formatter.currency(meta.incomeRecurring)
                  )
                }
                if (meta.returns > 0) {
                  lines.push(
                    'Retorno de Contrato: +' + Formatter.currency(meta.returns)
                  )
                }
                if (meta.withdrawStatus === 'planned' && meta.withdrawNet > 0) {
                  lines.push(
                    'Saque Planejado: -' + Formatter.currency(meta.withdrawNet)
                  )
                }
                if (meta.withdrawStatus === 'realized' && meta.withdrawNet > 0) {
                  lines.push(
                    'Saque Realizado: -' + Formatter.currency(meta.withdrawNet)
                  )
                }
                if (meta.isStart && item.parsed.y > 0) {
                  lines.push('Valor inicial (manual)')
                }

                return lines
              }
            }
          }
        }
      }
    })
  }
}
