import { store } from './store.js'
import { Formatter } from './utils/formatter.js'

/**
 * AI Service - Interface com Google Gemini API
 * Fornece assistência inteligente contextualizada com dados do usuário
 */

class AiService {
  constructor() {
    this.GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    this.OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
    this.GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
    this.OPENAI_MODEL = 'gpt-4o-mini'
    this.conversationHistory = []
    this.maxHistoryLength = 20
  }

  /**
   * Verifica se a IA está configurada para o provedor selecionado
   */
  isConfigured() {
    const provider = this.getProvider()
    if (provider === 'openai') {
      return !!store.state.inputs.openaiApiKey?.trim()
    }
    if (provider === 'groq') {
      return !!store.state.inputs.groqApiKey?.trim()
    }
    return !!store.state.inputs.geminiApiKey?.trim()
  }

  /**
   * Obtém o provedor atual
   */
  getProvider() {
    return store.state.inputs.aiProvider || 'gemini'
  }

  /**
   * Obtém a API key correta do store
   */
  getApiKey() {
    const provider = this.getProvider()
    if (provider === 'openai') {
      return store.state.inputs.openaiApiKey?.trim() || ''
    }
    if (provider === 'groq') {
      return store.state.inputs.groqApiKey?.trim() || ''
    }
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
   * Envia mensagem para o provedor configurado e obtém resposta
   */
  async sendMessage(userMessage) {
    if (!this.isConfigured()) {
      const providers = { gemini: 'Gemini', openai: 'ChatGPT', groq: 'Groq' }
      const providerName = providers[this.getProvider()] || 'IA'
      throw new Error(`API Key do ${providerName} não configurada. Acesse as Configurações para adicionar.`)
    }

    const provider = this.getProvider()
    
    if (provider === 'openai') {
      return this.sendOpenAiMessage(userMessage)
    } else if (provider === 'groq') {
      return this.sendGroqMessage(userMessage)
    } else {
      return this.sendGeminiMessage(userMessage)
    }
  }

  /**
   * Envia mensagem para o Gemini (Google)
   */
  async sendGeminiMessage(userMessage) {
    // Adicionar mensagem do usuário ao histórico (formato Gemini)
    this.conversationHistory.push({
      role: 'user',
      parts: [{ text: userMessage }]
    })

    // Manter histórico limitado
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength)
    }

    try {
      // Normalizar histórico para Gemini (user/model) e evitar papéis duplicados
      const geminiHistory = this.conversationHistory
        .map(msg => ({
          role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
          content: typeof msg.content === 'string' ? msg.content : (msg.parts?.[0]?.text || '')
        }))
        .filter(msg => msg.content && msg.content.trim() !== '')
        .map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }))
        // Garantir alternância user -> model -> user
        .filter((msg, i, arr) => i === 0 || msg.role !== arr[i-1].role)

      const response = await fetch(`${this.GEMINI_URL}?key=${this.getApiKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.buildSystemPrompt() }] },
          contents: geminiHistory,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Limite de requisições ou cota do Gemini excedida. Tente novamente em alguns segundos ou use a Groq.')
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('API Key do Gemini inválida ou sem permissão.')
        }
        throw new Error(`Erro na API Gemini: ${response.status} - Verifique sua conexão.`)
      }

      const data = await response.json()
      const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!assistantMessage) throw new Error('Resposta vazia do Gemini.')

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      })

      return assistantMessage
    } catch (error) {
      this.conversationHistory.pop()
      throw error
    }
  }

  /**
   * Envia mensagem para o ChatGPT (OpenAI)
   */
  async sendOpenAiMessage(userMessage) {
    // Adicionar mensagem do usuário (formato OpenAI)
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    })

    // Manter histórico limitado
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength)
    }

    try {
      const model = this.OPENAI_MODEL
      const response = await fetch(this.OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getApiKey()}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: this.buildSystemPrompt() },
            ...this.conversationHistory.map(msg => ({
              role: msg.role === 'model' ? 'assistant' : msg.role,
              content: typeof msg.content === 'string' ? msg.content : (msg.parts?.[0]?.text || '')
            }))
          ],
          temperature: 0.7
        })
      })

      if (!response.ok) {
        if (response.status === 401) throw new Error('API Key da OpenAI inválida.')
        if (response.status === 429) {
          throw new Error('Limite ou Cota da OpenAI excedida. Verifique se você tem créditos em sua conta OpenAI (platform.openai.com).')
        }
        throw new Error(`Erro na API OpenAI: ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage = data.choices?.[0]?.message?.content

      if (!assistantMessage) throw new Error('Resposta vazia da OpenAI.')

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      })

      return assistantMessage
    } catch (error) {
      this.conversationHistory.pop()
      throw error
    }
  }

  /**
   * Envia mensagem para o Groq (DeepSeek / Llama)
   */
  async sendGroqMessage(userMessage) {
    // Adicionar mensagem do usuário (formato compatível com OpenAI)
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    })

    // Manter histórico limitado
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength)
    }

    try {
      const model = store.state.inputs.groqModel || 'qwen-qwq-32b'
      
      // Sanitização das mensagens: Filtra vazias e garante formato correto
      const sanitizedMessages = [
        { role: 'system', content: this.buildSystemPrompt() },
        ...this.conversationHistory
          .map(msg => ({
            role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
            content: typeof msg.content === 'string' ? msg.content : (msg.parts?.[0]?.text || '')
          }))
          .filter(msg => msg.content && msg.content.trim() !== '')
      ]

      const response = await fetch(this.GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getApiKey()}`
        },
        body: JSON.stringify({
          model: model,
          messages: sanitizedMessages,
          temperature: 0.6 // DeepSeek R1 prefere temp menor
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error('Erro Groq Detalhado:', errData)
        
        if (response.status === 401) throw new Error('API Key da Groq inválida.')
        if (response.status === 400) throw new Error(`Requisição Inválida (400): ${errData.error?.message || 'Histórico malformado'}`)
        if (response.status === 429) throw new Error('Limite de requisições da Groq excedido.')
        throw new Error(`Erro na API Groq: ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage = data.choices?.[0]?.message?.content

      if (!assistantMessage) throw new Error('Resposta vazia da Groq.')

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      })

      return assistantMessage
    } catch (error) {
      this.conversationHistory.pop()
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

  // ============================================
  // PROACTIVE INSIGHTS SYSTEM
  // ============================================

  /**
   * Cache para evitar regeneração constante de insights
   */
  insightsCache = {
    data: [],
    timestamp: null,
    cacheValidMs: 5 * 60 * 1000 // 5 minutos
  }

  /**
   * Analisa os dados localmente e gera insights sem usar IA
   * Retorna array de insights baseados em regras
   */
  analyzeData() {
    const { inputs, portfolio, results, dailyData } = store.state
    const insights = []
    const today = Formatter.getTodayDate()
    const todayData = dailyData[today] || {}

    // 1. Verificar dia de saque
    const targetDay = parseInt(inputs.withdrawalDaySelect) || 0
    const currentDay = new Date().getDay()
    
    if (currentDay === targetDay && results.nextWithdraw > 0) {
      insights.push({
        type: 'urgent',
        icon: '💰',
        title: 'Dia de Saque!',
        message: `Hoje é seu dia de saque preferencial. Você tem R$ ${this.formatCurrency(results.nextWithdraw)} disponível.`,
        action: 'Ver detalhes',
        priority: 1
      })
    } else if ((targetDay - currentDay + 7) % 7 === 1) {
      insights.push({
        type: 'warning',
        icon: '📅',
        title: 'Saque Amanhã',
        message: `Amanhã é seu dia de saque. Prepare-se para sacar até R$ ${this.formatCurrency(results.nextWithdraw)}.`,
        priority: 2
      })
    }

    // 2. Verificar contratos próximos de vencer
    const tomorrow = Formatter.addDays(today, 1)
    const dayAfter = Formatter.addDays(today, 2)
    
    portfolio.forEach(inv => {
      const endDate = Formatter.addDays(inv.date, inv.days)
      const profit = inv.val * (inv.rate / 100) * inv.days
      const total = inv.val + profit

      if (endDate === today) {
        insights.push({
          type: 'success',
          icon: '🎉',
          title: 'Retorno Hoje!',
          message: `${inv.name} retorna hoje: R$ ${this.formatCurrency(total)} (+R$ ${this.formatCurrency(profit)} lucro)`,
          priority: 1
        })
      } else if (endDate === tomorrow) {
        insights.push({
          type: 'info',
          icon: '📈',
          title: 'Retorno Amanhã',
          message: `${inv.name} retorna amanhã com R$ ${this.formatCurrency(profit)} de lucro.`,
          priority: 3
        })
      } else if (endDate === dayAfter) {
        insights.push({
          type: 'info',
          icon: '📊',
          title: 'Retorno em 2 dias',
          message: `${inv.name} vence em 2 dias. Total esperado: R$ ${this.formatCurrency(total)}`,
          priority: 4
        })
      }
    })

    // 3. Verificar meta de saque
    if (inputs.withdrawStrategy === 'fixed') {
      const meta = parseFloat(inputs.withdrawTarget) || 0
      const saldoTotal = (parseFloat(inputs.personalWalletStart) || 0) + (parseFloat(inputs.revenueWalletStart) || 0)
      const diferenca = meta - saldoTotal

      if (diferenca <= 0) {
        insights.push({
          type: 'success',
          icon: '🎯',
          title: 'Meta Atingida!',
          message: `Você atingiu sua meta de R$ ${this.formatCurrency(meta)}! Considere realizar o saque.`,
          priority: 1
        })
      } else if (diferenca <= meta * 0.2) { // Falta 20% ou menos
        insights.push({
          type: 'info',
          icon: '🎯',
          title: 'Quase Lá!',
          message: `Faltam apenas R$ ${this.formatCurrency(diferenca)} para atingir sua meta de saque.`,
          priority: 2
        })
      }
    }

    // 4. Oportunidade de investimento (saldo alto parado)
    const saldoReceita = parseFloat(inputs.revenueWalletStart) || 0
    if (saldoReceita >= 50 && portfolio.length === 0) {
      insights.push({
        type: 'tip',
        icon: '💡',
        title: 'Oportunidade',
        message: `Você tem R$ ${this.formatCurrency(saldoReceita)} na carteira de receita sem investir. Considere alocar em um contrato.`,
        action: 'Ir para Investimentos',
        priority: 3
      })
    }

    // 5. Marcos e conquistas
    const lucroTotal = results.netProfit || 0
    const marcos = [100, 500, 1000, 5000, 10000]
    
    for (const marco of marcos) {
      const marcoKey = `milestone_${marco}`
      const achieved = localStorage.getItem(marcoKey)
      
      if (lucroTotal >= marco && !achieved) {
        insights.push({
          type: 'achievement',
          icon: '🏆',
          title: 'Conquista Desbloqueada!',
          message: `Parabéns! Você ultrapassou R$ ${this.formatCurrency(marco)} em lucros totais!`,
          priority: 1,
          marcoKey
        })
        break // Apenas um marco por vez
      }
    }

    // 6. Sem investimentos ativos
    if (portfolio.length === 0 && saldoReceita < 50) {
      insights.push({
        type: 'info',
        icon: '📚',
        title: 'Comece a Investir',
        message: 'Você ainda não tem investimentos. Use o Simulador para projetar seus ganhos!',
        action: 'Abrir Simulador',
        priority: 5
      })
    }

    // Ordenar por prioridade
    return insights.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Gera insights usando IA para análises mais complexas
   * Usa cache para evitar chamadas frequentes
   */
  async generateAiInsights() {
    if (!this.isConfigured()) {
      return this.analyzeData() // Fallback para análise local
    }

    // Verificar cache
    const now = Date.now()
    if (this.insightsCache.timestamp && (now - this.insightsCache.timestamp) < this.insightsCache.cacheValidMs) {
      return this.insightsCache.data
    }

    // Combinar insights locais com análise de IA
    const localInsights = this.analyzeData()
    
    try {
      const aiPrompt = `Analise minha situação financeira e me dê 1-2 insights CURTOS e OBJETIVOS (máximo 1 frase cada) que não estejam óbvios nos dados. Foque em:
- Padrões de comportamento
- Oportunidades de otimização
- Riscos potenciais

Responda em formato JSON: [{"icon": "emoji", "title": "título curto", "message": "mensagem curta"}]
Não inclua formatação markdown, apenas o JSON.`

      const provider = this.getProvider()
      let aiResponseText = ''

      if (provider === 'gemini') {
        const response = await fetch(`${this.GEMINI_URL}?key=${this.getApiKey()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: this.buildSystemPrompt() }] },
            contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 256 }
          })
        })

        if (!response.ok) {
          if (response.status === 429) {
            console.warn('Limite Gemini (429). Fallback para local.')
            return localInsights
          }
          throw new Error(`Erro Gemini: ${response.status}`)
        }

        const data = await response.json()
        aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text
      } 
      else if (provider === 'openai' || provider === 'groq') {
        const url = provider === 'openai' ? this.OPENAI_URL : this.GROQ_URL
        const model = provider === 'openai' ? this.OPENAI_MODEL : (store.state.inputs.groqModel || 'qwen-qwq-32b')
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getApiKey()}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: this.buildSystemPrompt() },
              { role: 'user', content: aiPrompt }
            ],
            temperature: 0.5,
            max_tokens: 256
          })
        })

        if (!response.ok) {
          if (response.status === 429) {
            console.warn(`Limite ${provider.toUpperCase()} (429). Fallback para local.`)
            return localInsights
          }
          throw new Error(`Erro ${provider.toUpperCase()}: ${response.status}`)
        }

        const data = await response.json()
        aiResponseText = data.choices?.[0]?.message?.content
      }

      const response = aiResponseText || ''
      
      // Tentar parsear resposta JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const aiInsights = JSON.parse(jsonMatch[0])
        const formattedAiInsights = aiInsights.map((insight, idx) => ({
          type: 'ai',
          icon: insight.icon || '🤖',
          title: insight.title,
          message: insight.message,
          priority: 10 + idx // Menor prioridade que locais
        }))

        const combined = [...localInsights, ...formattedAiInsights]
        
        // Atualizar cache
        this.insightsCache.data = combined
        this.insightsCache.timestamp = now
        
        return combined
      }
    } catch (error) {
      console.warn('Erro ao gerar insights com IA:', error)
    }

    // Fallback: apenas insights locais
    return localInsights
  }

  /**
   * Marca um marco como alcançado
   */
  markMilestoneAchieved(marcoKey) {
    if (marcoKey) {
      localStorage.setItem(marcoKey, 'true')
    }
  }

  /**
   * Formata valor para moeda
   */
  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  /**
   * Invalida cache de insights (chamar após mudanças significativas)
   */
  invalidateInsightsCache() {
    this.insightsCache.timestamp = null
  }
}

export const aiService = new AiService()

