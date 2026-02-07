import { store } from '../store.js'
import { Formatter } from './formatter.js'

/**
 * Notification Manager - Centralizes the logic for system alerts and insights.
 * Purely deterministic based on current store state.
 */
export class NotificationManager {
  /**
   * Consolidates all notifications (alerts, warnings, tips, achievements)
   * @returns {Array} List of notification objects
   */
  static getNotifications() {
    const { inputs, portfolio, results, dismissedNotifications = [] } = store.state
    const notifications = []
    const todayStr = Formatter.getTodayDate()
    const today = new Date()

    // 1. Investment Expirations (Alerts)
    portfolio.forEach(p => {
      const endStr = Formatter.addDays(p.date, p.days)
      const end = new Date(endStr)
      const diff = Math.ceil((end - today) / 86400000)
      
      const profit = Math.floor(Formatter.toCents(p.val) * (p.rate / 100) * p.days)
      const total = Formatter.toCents(p.val) + profit

      if (endStr === todayStr) {
        notifications.push({
          id: `inv_today_${p.id}`,
          type: 'success',
          icon: '🎉',
          title: 'Retorno Hoje!',
          message: `${p.name} retorna hoje: ${Formatter.currency(total)} (+${Formatter.currency(profit)} lucro)`,
          priority: 1
        })
      } else if (diff === 1) {
        notifications.push({
          id: `inv_tomorrow_${p.id}`,
          type: 'info',
          icon: '📈',
          title: 'Retorno Amanhã',
          message: `${p.name} retorna amanhã com ${Formatter.currency(profit)} de lucro.`,
          priority: 3
        })
      } else if (diff === 2) {
        notifications.push({
          id: `inv_2days_${p.id}`,
          type: 'info',
          icon: '📊',
          title: 'Retorno em 2 dias',
          message: `${p.name} vence em 2 dias. Total esperado: ${Formatter.currency(total)}`,
          priority: 4
        })
      } else if (diff < 0 && diff > -5) {
        notifications.push({
          id: `inv_expired_${p.id}`,
          type: 'urgent',
          icon: '⚠️',
          title: 'Contrato Vencido',
          message: `O contrato ${p.name} venceu há ${Math.abs(diff)} dias. Considere realizar o saque ou reinvestir.`,
          priority: 1
        })
      }
    })

    // 2. Withdrawal Day (Insights)
    const targetDay = parseInt(inputs.withdrawalDaySelect) || 0
    const currentDay = today.getDay()
    
    if (currentDay === targetDay && (results.nextWithdraw || 0) > 0) {
      notifications.push({
        id: `withdraw_day_${todayStr}`,
        type: 'urgent',
        icon: '💰',
        title: 'Dia de Saque!',
        message: `Hoje é seu dia de saque preferencial. Você tem ${Formatter.currency(results.nextWithdraw)} disponível para retirada.`,
        action: 'Ver detalhes',
        priority: 1
      })
    } else if ((targetDay - currentDay + 7) % 7 === 1) {
      notifications.push({
        id: `withdraw_tomorrow_${todayStr}`,
        type: 'warning',
        icon: '📅',
        title: 'Saque Amanhã',
        message: `Amanhã é seu dia de saque. Prepare-se para sacar até ${Formatter.currency(results.nextWithdraw || 0)}.`,
        priority: 2
      })
    }

    // 3. Withdrawal Goal (Meta de Saque)
    if (inputs.withdrawStrategy === 'fixed') {
      const meta = Formatter.toCents(inputs.withdrawTarget) || 0
      const saldoTotal = (results.todayPersonalBalance || 0) + (results.todayRevenueBalance || 0)
      const diferenca = meta - saldoTotal

      if (diferenca <= 0 && meta > 0) {
        notifications.push({
          id: `goal_reached_${meta}`,
          type: 'success',
          icon: '🎯',
          title: 'Meta Atingida!',
          message: `Você atingiu sua meta de ${Formatter.currency(meta)}! Considere realizar o saque programado.`,
          priority: 1
        })
      } else if (meta > 0 && diferenca <= meta * 0.2) {
        notifications.push({
          id: `goal_near_${meta}`,
          type: 'info',
          icon: '🎯',
          title: 'Quase Lá!',
          message: `Faltam apenas ${Formatter.currency(diferenca)} para atingir sua meta de saque.`,
          priority: 2
        })
      }
    }

    // 4. Investment Opportunity (High Idle Balance)
    const saldoReceita = results.todayRevenueBalance || 0
    if (saldoReceita >= 5000 && portfolio.length === 0) {
      notifications.push({
        id: 'opportunity_idle_balance',
        type: 'tip',
        icon: '💡',
        title: 'Oportunidade',
        message: `Você tem ${Formatter.currency(saldoReceita)} na carteira de receita sem nenhum investimento ativo.`,
        action: 'Ir para Investimentos',
        priority: 3
      })
    }

    // 5. System Achievements
    const lucroTotal = results.netProfit || 0
    const marcos = [100, 500, 1000, 5000, 10000]
    
    for (const marco of marcos) {
      const marcoKey = `milestone_${marco}`
      const achieved = localStorage.getItem(marcoKey)
      
      const marcoCents = marco * 100
      if (lucroTotal >= marcoCents && !achieved) {
        notifications.push({
          id: marcoKey,
          type: 'achievement',
          icon: '🏆',
          title: 'Conquista Desbloqueada!',
          message: `Parabéns! Você ultrapassou ${Formatter.currency(marcoCents)} em lucros totais no sistema!`,
          priority: 1,
          marcoKey
        })
        break 
      }
    }

    // 6. Onboarding / Start Tip
    if (portfolio.length === 0 && (results.todayRevenueBalance || 0) < 5000) {
      notifications.push({
        id: 'onboarding_tip',
        type: 'info',
        icon: '📚',
        title: 'Dica de Início',
        message: 'Você ainda não tem investimentos ativos. Use o Simulador para projetar seus ganhos futuros!',
        action: 'Abrir Simulador',
        priority: 5
      })
    }

    // Filter out dismissed notifications and sort by priority
    return notifications
      .filter(n => !dismissedNotifications.includes(n.id))
      .sort((a, b) => a.priority - b.priority)
  }
}
