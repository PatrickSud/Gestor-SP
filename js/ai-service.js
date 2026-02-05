import { store } from './store.js'
import { Formatter } from './utils/formatter.js'

/**
 * AI Service - Interface com Google Gemini API
 * Fornece assistência inteligente contextualizada com dados do usuário
 */

class AiService {
  constructor() {
    this.API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    this.conversationHistory = []
    this.maxHistoryLength = 20
  }

  /**
   * Verifica se a API key está configurada
   */
  isConfigured() {
    return !!store.state.inputs.geminiApiKey?.trim()
  }

  /**
   * Obtém a API key do store
   */
  getApiKey() {
    return store.state.inputs.geminiApiKey?.trim() || ''
  }

  /**
   * Constrói o contexto do usuário para o prompt
   */
  buildUserContext() {
    const { inputs, portfolio, results, dailyData } = store.state

    // Calcular totais de investimentos
    const totalInvested = portfolio.reduce((sum, inv) => sum + (inv.val || 0), 0)
    const activeContracts = portfolio.length

    // Obter dados do dia atual
    const today = Formatter.getTodayDate()
    const todayData = dailyData[today] || {}

    // Construir contexto estruturado
    const context = {
      dataAtual: today,
      carteiras: {
        pessoal: parseFloat(inputs.personalWalletStart) || 0,
        receita: parseFloat(inputs.revenueWalletStart) || 0
      },
      investimentos: {
        totalInvestido: totalInvested,
        contratosAtivos: activeContracts,
        detalhes: portfolio.map(inv => ({
          nome: inv.name,
          valor: inv.val,
          dataInicio: inv.date,
          diasCiclo: inv.days,
          taxa: inv.rate
        }))
      },
      resultados: {
        lucroLiquido: results.netProfit || 0,
        totalSacado: results.totalWithdrawn || 0,
        saldoFinal: results.finalBalance || 0,
        proximoSaque: results.nextWithdraw || 0,
        dataProximoSaque: results.nextWithdrawDate || '-'
      },
      configuracoes: {
        estrategiaSaque: inputs.withdrawStrategy || 'none',
        metaSaque: parseFloat(inputs.withdrawTarget) || 0,
        nivelTarefas: inputs.taskLevel,
        rendaDiaria: parseFloat(inputs.taskDailyValue) || 0,
        diaPreferencialSaque: parseInt(inputs.withdrawalDaySelect) || 0
      },
      simulacao: {
        ativa: inputs.futureToggle === 'true',
        capitalInicial: parseFloat(inputs.capitalInicial) || 0,
        diasCiclo: parseInt(inputs.diasCiclo) || 3,
        taxaDiaria: parseFloat(inputs.taxaDiaria) || 1.2,
        repeticoes: parseInt(inputs.repeticoesCiclo) || 1
      }
    }

    return context
  }

  /**
   * Gera o prompt do sistema com contexto
   */
  buildSystemPrompt() {
    const context = this.buildUserContext()
    
    return `Você é um assistente financeiro inteligente integrado ao Gestor Estratégico Pro, uma aplicação de gestão financeira pessoal e projeção de investimentos.

## Seu Papel
- Ajudar o usuário a entender sua situação financeira
- Fornecer insights sobre investimentos e estratégias
- Orientar sobre o uso das funcionalidades da aplicação
- Sugerir otimizações baseadas nos dados atuais

## Contexto Atual do Usuário
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

## Diretrizes de Resposta
1. Seja conciso e direto, mas cordial
2. Use os dados do contexto para personalizar respostas
3. Formate valores monetários em Real (R$)
4. Quando relevante, sugira ações específicas
5. Alerte sobre riscos quando identificar padrões preocupantes
6. Responda sempre em português brasileiro
7. Use emojis com moderação para tornar a conversa mais amigável

## Funcionalidades da Aplicação que você conhece
- **Carteiras**: Pessoal (uso geral) e Receita (reinvestimento)
- **Investimentos**: Contratos com ciclos de dias e taxa de retorno
- **Simulador**: Projeção de reinvestimentos futuros
- **Estratégias de Saque**: Automático, Meta Fixa, Semanas Específicas
- **Calendário**: Visualização de eventos financeiros
- **Exportação**: PDF e Excel de relatórios

Agora responda à pergunta do usuário com base no contexto acima.`
  }

  /**
   * Envia mensagem para o Gemini e obtém resposta
   */
  async sendMessage(userMessage) {
    if (!this.isConfigured()) {
      throw new Error('API Key do Gemini não configurada. Acesse as Configurações para adicionar.')
    }

    // Adicionar mensagem do usuário ao histórico
    this.conversationHistory.push({
      role: 'user',
      parts: [{ text: userMessage }]
    })

    // Manter histórico limitado
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength)
    }

    try {
      const response = await fetch(`${this.API_URL}?key=${this.getApiKey()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: this.buildSystemPrompt() }]
          },
          contents: this.conversationHistory,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        if (response.status === 401 || response.status === 403) {
          throw new Error('API Key inválida ou sem permissão. Verifique sua chave nas configurações.')
        }
        
        if (response.status === 429) {
          throw new Error('Limite de requisições excedido. Aguarde um momento e tente novamente.')
        }
        
        throw new Error(errorData.error?.message || `Erro na API: ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!assistantMessage) {
        throw new Error('Resposta vazia do assistente. Tente reformular sua pergunta.')
      }

      // Adicionar resposta ao histórico
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: assistantMessage }]
      })

      return assistantMessage

    } catch (error) {
      // Remover mensagem do usuário se houve erro
      this.conversationHistory.pop()
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Erro de conexão. Verifique sua internet e tente novamente.')
      }
      
      throw error
    }
  }

  /**
   * Limpa o histórico de conversa
   */
  clearHistory() {
    this.conversationHistory = []
  }

  /**
   * Gera sugestão rápida baseada no contexto
   */
  async getQuickInsight(type = 'general') {
    const prompts = {
      general: 'Me dê um resumo rápido da minha situação financeira atual em 2-3 frases.',
      investment: 'Qual o status dos meus investimentos? Alguma ação recomendada?',
      withdraw: 'Devo fazer algum saque agora? Qual a melhor estratégia?',
      optimization: 'Tem alguma otimização que posso fazer nas minhas configurações?'
    }

    return this.sendMessage(prompts[type] || prompts.general)
  }
}

export const aiService = new AiService()
