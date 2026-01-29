/**
 * EXEMPLOS DE USO - Sistema de Exportação
 * Gestor Estratégico Pro
 */

// ============================================
// 1. EXEMPLO BÁSICO - Exportar PDF
// ============================================

function exemploExportarPDF() {
  // Dados necessários
  const results = {
    netProfit: 150000,      // em centavos (R$ 1.500,00)
    roi: 15.5,              // percentual
    totalWithdrawn: 50000   // em centavos (R$ 500,00)
  }

  const dailyData = {
    '2026-01-01': {
      startBal: 100000,     // R$ 1.000,00
      inReturn: 5000,       // R$ 50,00
      inIncome: 10000,      // R$ 100,00
      outWithdraw: 20000,   // R$ 200,00
      endBal: 95000         // R$ 950,00
    },
    '2026-01-02': {
      startBal: 95000,
      inReturn: 3000,
      inIncome: 8000,
      outWithdraw: 10000,
      endBal: 96000
    }
    // ... mais dias
  }

  // Chamar a função
  const success = Exporter.generatePDF(results, dailyData)
  
  if (success) {
    console.log('PDF gerado com sucesso!')
  } else {
    console.error('Erro ao gerar PDF')
  }
}

// ============================================
// 2. EXEMPLO BÁSICO - Exportar Excel
// ============================================

function exemploExportarExcel() {
  const dailyData = {
    '2026-01-01': {
      startBal: 100000,
      inReturn: 5000,
      inIncome: 10000,
      outWithdraw: 20000,
      endBal: 95000
    }
    // ... mais dias
  }

  const success = Exporter.generateExcel(dailyData)
  
  if (success) {
    console.log('Excel gerado com sucesso!')
  }
}

// ============================================
// 3. FORMATAÇÃO DE VALORES
// ============================================

// Converter centavos para R$ formatado
const valorEmCentavos = 150000
const valorFormatado = Exporter.formatCurrency(valorEmCentavos)
console.log(valorFormatado) // "R$ 1.500,00"

// Converter para formato Excel
const valorExcel = Exporter.formatCurrencyForExcel(valorEmCentavos)
console.log(valorExcel) // "R$ 1500,00"

// ============================================
// 4. INTEGRAÇÃO COM STORE
// ============================================

function exportarComDadosDoStore() {
  // Pegar dados do store
  const results = store.state.results
  const dailyData = store.state.dailyData

  // Validar
  if (!results || !dailyData) {
    console.error('Dados não disponíveis')
    return
  }

  // Exportar
  Exporter.generatePDF(results, dailyData)
}

// ============================================
// 5. EXEMPLO COM TRATAMENTO DE ERROS
// ============================================

async function exportarComTratamento() {
  try {
    const results = store.state.results
    const dailyData = store.state.dailyData

    // Validações
    if (!results) {
      throw new Error('Results não disponível')
    }

    if (!dailyData || Object.keys(dailyData).length === 0) {
      throw new Error('Nenhum dado diário disponível')
    }

    // Exportar PDF
    const pdfSuccess = Exporter.generatePDF(results, dailyData)
    if (!pdfSuccess) {
      throw new Error('Falha ao gerar PDF')
    }

    // Exportar Excel
    const excelSuccess = Exporter.generateExcel(dailyData)
    if (!excelSuccess) {
      throw new Error('Falha ao gerar Excel')
    }

    console.log('Todos os arquivos gerados com sucesso!')
    
  } catch (error) {
    console.error('Erro na exportação:', error.message)
    alert(`Erro: ${error.message}`)
  }
}

// ============================================
// 6. PERSONALIZAR PDF (Exemplo Avançado)
// ============================================

function gerarPDFPersonalizado() {
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()

  // Configurar cores personalizadas
  const corPrimaria = [59, 130, 246]    // Azul
  const corSecundaria = [16, 185, 129]  // Verde
  const corFundo = [15, 23, 42]         // Escuro

  // Cabeçalho personalizado
  doc.setFillColor(...corFundo)
  doc.rect(0, 0, 210, 50, 'F')

  doc.setTextColor(...corPrimaria)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('Meu Relatório Personalizado', 105, 25, { align: 'center' })

  // Adicionar logo (se tiver)
  // doc.addImage(logoBase64, 'PNG', 10, 10, 30, 30)

  // Adicionar dados
  let y = 60
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.text('Resumo Executivo', 20, y)

  y += 10
  doc.setFontSize(10)
  doc.text(`Total de Dias: ${Object.keys(store.state.dailyData).length}`, 20, y)

  // Adicionar tabela
  doc.autoTable({
    startY: y + 10,
    head: [['Métrica', 'Valor']],
    body: [
      ['Lucro Líquido', 'R$ 1.500,00'],
      ['ROI', '15.5%'],
      ['Total Sacado', 'R$ 500,00']
    ],
    theme: 'grid',
    headStyles: {
      fillColor: corPrimaria,
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    bodyStyles: {
      textColor: [51, 65, 85]
    }
  })

  // Salvar
  doc.save('relatorio_personalizado.pdf')
}

// ============================================
// 7. PERSONALIZAR EXCEL (Exemplo Avançado)
// ============================================

function gerarExcelPersonalizado() {
  // Dados personalizados
  const dados = [
    { 
      'Mês': 'Janeiro',
      'Receita': 'R$ 5.000,00',
      'Despesas': 'R$ 2.000,00',
      'Lucro': 'R$ 3.000,00'
    },
    {
      'Mês': 'Fevereiro',
      'Receita': 'R$ 6.000,00',
      'Despesas': 'R$ 2.500,00',
      'Lucro': 'R$ 3.500,00'
    }
  ]

  // Criar worksheet
  const ws = XLSX.utils.json_to_sheet(dados)

  // Personalizar larguras
  ws['!cols'] = [
    { wch: 15 },  // Mês
    { wch: 15 },  // Receita
    { wch: 15 },  // Despesas
    { wch: 15 }   // Lucro
  ]

  // Criar workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Resumo Mensal')

  // Adicionar segunda aba
  const dadosDetalhados = [
    { 'Data': '01/01/2026', 'Valor': 'R$ 100,00' },
    { 'Data': '02/01/2026', 'Valor': 'R$ 150,00' }
  ]
  const ws2 = XLSX.utils.json_to_sheet(dadosDetalhados)
  XLSX.utils.book_append_sheet(wb, ws2, 'Detalhado')

  // Salvar
  XLSX.writeFile(wb, 'relatorio_mensal.xlsx')
}

// ============================================
// 8. EXPORTAR APENAS PERÍODO ESPECÍFICO
// ============================================

function exportarPeriodo(dataInicio, dataFim) {
  const dailyData = store.state.dailyData
  
  // Filtrar dados do período
  const dadosFiltrados = {}
  
  Object.keys(dailyData).forEach(date => {
    if (date >= dataInicio && date <= dataFim) {
      dadosFiltrados[date] = dailyData[date]
    }
  })

  // Exportar apenas o período filtrado
  if (Object.keys(dadosFiltrados).length > 0) {
    Exporter.generateExcel(dadosFiltrados)
    console.log(`Exportados ${Object.keys(dadosFiltrados).length} dias`)
  } else {
    console.log('Nenhum dado no período especificado')
  }
}

// Exemplo de uso:
// exportarPeriodo('2026-01-01', '2026-01-31')

// ============================================
// 9. ADICIONAR GRÁFICO AO PDF (Conceito)
// ============================================

function adicionarGraficoAoPDF() {
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()

  // Capturar gráfico do canvas
  const canvas = document.getElementById('balanceChart')
  const chartImage = canvas.toDataURL('image/png')

  // Adicionar ao PDF
  doc.text('Evolução Patrimonial', 20, 20)
  doc.addImage(chartImage, 'PNG', 15, 30, 180, 100)

  // Adicionar tabela abaixo
  doc.autoTable({
    startY: 140,
    head: [['Data', 'Saldo']],
    body: [
      ['01/01/2026', 'R$ 1.000,00'],
      ['02/01/2026', 'R$ 1.500,00']
    ]
  })

  doc.save('relatorio_com_grafico.pdf')
}

// ============================================
// 10. EXPORTAR MÚLTIPLOS FORMATOS DE UMA VEZ
// ============================================

function exportarTodosFormatos() {
  const results = store.state.results
  const dailyData = store.state.dailyData

  console.log('Iniciando exportação em múltiplos formatos...')

  // PDF
  const pdfSuccess = Exporter.generatePDF(results, dailyData)
  if (pdfSuccess) {
    console.log('✓ PDF gerado')
  }

  // Aguardar um pouco para não sobrecarregar
  setTimeout(() => {
    // Excel
    const excelSuccess = Exporter.generateExcel(dailyData)
    if (excelSuccess) {
      console.log('✓ Excel gerado')
    }

    // CSV
    setTimeout(() => {
      app.exportToCSV()
      console.log('✓ CSV gerado')
      console.log('Todos os formatos exportados!')
    }, 500)
  }, 500)
}

// ============================================
// 11. VALIDAÇÃO DE DADOS ANTES DE EXPORTAR
// ============================================

function validarEExportar() {
  const dailyData = store.state.dailyData
  const results = store.state.results

  // Validações
  const validacoes = {
    temDados: Object.keys(dailyData).length > 0,
    temResults: results !== null && results !== undefined,
    temLucro: results && results.netProfit !== undefined,
    temROI: results && results.roi !== undefined
  }

  // Verificar todas as validações
  const todasValidas = Object.values(validacoes).every(v => v === true)

  if (todasValidas) {
    console.log('✓ Dados válidos, exportando...')
    Exporter.generatePDF(results, dailyData)
  } else {
    console.error('✗ Validação falhou:', validacoes)
    alert('Dados incompletos. Configure o sistema antes de exportar.')
  }
}

// ============================================
// 12. EXPORTAR COM CALLBACK
// ============================================

function exportarComCallback(onSuccess, onError) {
  try {
    const results = store.state.results
    const dailyData = store.state.dailyData

    const success = Exporter.generatePDF(results, dailyData)

    if (success && onSuccess) {
      onSuccess('PDF gerado com sucesso!')
    } else if (!success && onError) {
      onError('Falha ao gerar PDF')
    }
  } catch (error) {
    if (onError) {
      onError(error.message)
    }
  }
}

// Exemplo de uso:
exportarComCallback(
  (msg) => console.log('Sucesso:', msg),
  (err) => console.error('Erro:', err)
)

// ============================================
// FIM DOS EXEMPLOS
// ============================================

/**
 * DICAS IMPORTANTES:
 * 
 * 1. Sempre valide os dados antes de exportar
 * 2. Use try-catch para capturar erros
 * 3. Forneça feedback ao usuário (toast, console, etc)
 * 4. Teste com dados reais e dados vazios
 * 5. Verifique se as bibliotecas estão carregadas
 * 6. Use nomes de arquivo descritivos
 * 7. Mantenha a formatação consistente (R$, datas)
 * 8. Considere performance com grandes volumes de dados
 * 9. Teste em diferentes navegadores
 * 10. Documente personalizações
 */
