import { Formatter } from '../utils/formatter.js'

let chartInstance = null

export const ChartManager = {
  renderBalanceChart(containerId, data) {
    const ctx = document.getElementById(containerId)
    if (!ctx) return

    if (chartInstance) {
      chartInstance.destroy()
    }

    const todayStr = Formatter.getTodayDate()
    const futureData = (data || []).filter(d => d.x >= todayStr)
    const baseData = futureData.length > 0 ? futureData : data
    const displayData =
      baseData.length > 90
        ? baseData.filter((_, i) => i % Math.ceil(baseData.length / 90) === 0)
        : baseData

    const plannedDates = baseData
      .filter(it => it.meta && it.meta.withdrawStatus === 'planned')
      .map(it => it.x)
    const returnDates = baseData
      .filter(it => it.meta && (it.meta.returns || 0) > 0)
      .map(it => it.x)
    const realizedDates = baseData
      .filter(it => it.meta && it.meta.withdrawStatus === 'realized')
      .map(it => it.x)

    const markerPlugin = {
      id: 'markerPlugin',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart
        if (!chartArea) return
        const topY = chartArea.top
        const bottomY = chartArea.bottom
        const xScale = scales.x
        const drawLineAt = (dateStr, color) => {
          const xPos = xScale.getPixelForValue(new Date(dateStr + 'T00:00:00'))
          if (!isFinite(xPos)) return
          ctx.save()
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(xPos, topY)
          ctx.lineTo(xPos, bottomY)
          ctx.stroke()
          ctx.restore()
        }

        plannedDates.forEach(d => drawLineAt(d, '#f59e0b'))
        returnDates.forEach(d => drawLineAt(d, '#8b5cf6'))
        realizedDates.forEach(d => drawLineAt(d, '#3b82f6'))
      }
    }

    // Ensure plugin is registered
    if (typeof Chart !== 'undefined' && Chart.register) {
      Chart.register(markerPlugin)
    }

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
              callback: value => 'R$ ' + value.toLocaleString('pt-BR')
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
              title: items => {
                const item = items && items[0]
                const rawX = item && item.raw && item.raw.x
                const dateObj = rawX ? new Date(rawX + 'T00:00:00') : null
                if (!dateObj) return ''
                const dd = String(dateObj.getDate()).padStart(2, '0')
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
                const yyyy = dateObj.getFullYear()
                const weekday = dateObj
                  .toLocaleDateString('pt-BR', { weekday: 'long' })
                  .replace(/^\w/, c => c.toUpperCase())
                return `${dd}/${mm} - ${weekday}, ${yyyy}`
              },
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
              labelColor: context => {
                const meta = context.raw && context.raw.meta
                if (meta && meta.withdrawStatus === 'planned') {
                  return { borderColor: '#f59e0b', backgroundColor: '#f59e0b' }
                }
                if (meta && (meta.returns || 0) > 0) {
                  return { borderColor: '#8b5cf6', backgroundColor: '#8b5cf6' }
                }
                return { borderColor: '#3b82f6', backgroundColor: '#3b82f6' }
              },
              afterBody: items => {
                const item = items && items[0]
                if (!item || !item.raw || !item.raw.meta) return []
                const meta = item.raw.meta
                const lines = []

                if (meta.incomeTask > 0) {
                  lines.push(
                    'Entradas (Tarefas): +' +
                      Formatter.currency(meta.incomeTask)
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
                if (
                  meta.withdrawStatus === 'realized' &&
                  meta.withdrawNet > 0
                ) {
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
