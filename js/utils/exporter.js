import { Formatter } from './formatter.js'

/**
 * Exporter Module - Handles PDF and Excel export functionality
 */
export const Exporter = {
  /**
   * Generate PDF report with financial data
   * @param {Object} results - Calculation results
   * @param {Object} dailyData - Daily financial data
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD (optional)
   */
  generatePDF(results, dailyData, startDate, endDate) {
    try {
      // Access jsPDF from global scope
      const { jsPDF } = window.jspdf

      // Default start to today if not provided
      if (!startDate) startDate = Formatter.getTodayDate()

      // Create new PDF document (A4, portrait)
      const doc = new jsPDF('p', 'mm', 'a4')

      // Define colors
      const primaryColor = [59, 130, 246] // Blue
      const accentColor = [16, 185, 129] // Emerald
      const darkBg = [15, 23, 42] // Dark slate
      const textColor = [226, 232, 240] // Light slate

      // Header Section
      doc.setFillColor(...darkBg)
      doc.rect(0, 0, 210, 45, 'F')

      // Title
      doc.setTextColor(...primaryColor)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('Relatório Gestor Estratégico Pro', 105, 20, { align: 'center' })

      // Date
      doc.setTextColor(...textColor)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const currentDate = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      const periodStr = endDate
        ? `Período: ${Formatter.dateDisplay(startDate)} a ${Formatter.dateDisplay(endDate)}`
        : `A partir de: ${Formatter.dateDisplay(startDate)}`

      doc.text(`Gerado em: ${currentDate}`, 105, 30, { align: 'center' })
      doc.text(periodStr, 105, 35, { align: 'center' })

      // Summary Section
      let yPos = 55

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Resumo Financeiro', 15, yPos)

      yPos += 10

      // Calculate summary for the selected period
      const allDates = Object.keys(dailyData).sort()
      const dates = allDates.filter(
        d => d >= startDate && (!endDate || d <= endDate)
      )

      const filteredRes = {
        income: dates.reduce((acc, d) => acc + (dailyData[d].inIncome || 0), 0),
        invest: dates.reduce(
          (acc, d) =>
            acc +
            (dailyData[d].inReturnProfit || 0) +
            (dailyData[d].outReinvest || 0),
          0
        ),
        withdraw: dates.reduce(
          (acc, d) => acc + (dailyData[d].outWithdraw || 0),
          0
        )
      }
      filteredRes.net = filteredRes.income + filteredRes.invest

      // Summary boxes config - 3 columns perfectly centered (10mm margins, 5mm spacing)
      const boxWidth = 60
      const spacing = 5
      const startX = 10

      // 1. Lucro Líquido Block
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(startX, yPos, boxWidth, 25, 3, 3, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text('Lucro Líquido', startX + boxWidth / 2, yPos + 7, {
        align: 'center'
      })
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...accentColor)
      doc.text(
        this.formatCurrency(filteredRes.net),
        startX + boxWidth / 2,
        yPos + 18,
        { align: 'center' }
      )

      // 2. Composição Block (Renda + Invest)
      const x2 = startX + boxWidth + spacing
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x2, yPos, boxWidth, 25, 3, 3, 'F')

      // Renda Part
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text('Renda / Extras', x2 + boxWidth / 2, yPos + 5.5, {
        align: 'center'
      })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(14, 165, 233)
      doc.text(
        this.formatCurrency(filteredRes.income),
        x2 + boxWidth / 2,
        yPos + 10.5,
        { align: 'center' }
      )

      // Divider Line
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.1)
      doc.line(x2 + 10, yPos + 12.5, x2 + 50, yPos + 12.5)

      // Invest Part
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text('Lucro Invest.', x2 + boxWidth / 2, yPos + 17.5, {
        align: 'center'
      })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(168, 85, 247)
      doc.text(
        this.formatCurrency(filteredRes.invest),
        x2 + boxWidth / 2,
        yPos + 22.5,
        { align: 'center' }
      )

      // 3. Total Sacado Block
      const x3 = startX + (boxWidth + spacing) * 2
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x3, yPos, boxWidth, 25, 3, 3, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text('Total Sacado', x3 + boxWidth / 2, yPos + 7, { align: 'center' })
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(59, 130, 246)
      doc.text(
        this.formatCurrency(filteredRes.withdraw),
        x3 + boxWidth / 2,
        yPos + 18,
        { align: 'center' }
      )

      yPos += 35

      // Financial Table
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Detalhamento Financeiro', 15, yPos)

      yPos += 5

      // Prepare table data and check if there are any investments
      const tableData = []
      const sortedDates = Object.keys(dailyData)
        .sort()
        .filter(d => d >= startDate && (!endDate || d <= endDate))
      let hasInvestments = false

      sortedDates.forEach(date => {
        const d = dailyData[date]
        // Check if there are any investments in the period
        if (d.outInvest && d.outInvest > 0) {
          hasInvestments = true
        }
      })

      // Build table rows
      const lastValues = {}

      sortedDates.forEach((date, rowIndex) => {
        const d = dailyData[date]

        // Valores brutos para comparação
        const currentValues = {
          returns: d.inReturn || 0,
          income: d.inIncome || 0,
          invest: d.outInvest || 0,
          withdraw: d.outWithdraw || 0,
          personal: d.endPersonal || 0,
          revenue: d.endRevenue || 0
        }

        // Função auxiliar para formatar seguindo as regras do usuário
        const formatF = (val, key) => {
          const isZero = val === 0
          const isRepeated = rowIndex > 0 && val === lastValues[key]
          lastValues[key] = val // Atualiza para a próxima comparação

          if (isZero || isRepeated) return '-'
          return this.formatCurrency(val)
        }

        const row = [
          Formatter.dateDisplay(date),
          formatF(currentValues.returns, 'returns'),
          formatF(currentValues.income, 'income')
        ]

        // Add investment column only if there are investments
        if (hasInvestments) {
          row.push(formatF(currentValues.invest, 'invest'))
        }

        row.push(
          formatF(currentValues.withdraw, 'withdraw'),
          formatF(currentValues.personal, 'personal'),
          formatF(currentValues.revenue, 'revenue')
        )

        tableData.push(row)
      })

      // Build headers dynamically
      const headers = ['Data', 'Retornos', 'Renda']

      if (hasInvestments) {
        headers.push('Aportes')
      }

      headers.push('Saques', 'Saldo Pessoal', 'Saldo Receita')

      // Build column styles with semantic colors for each category
      const columnStyles = {
        0: { halign: 'center', cellWidth: 22, textColor: [100, 116, 139] } // Data (Slate)
      }

      let colIndex = 1
      columnStyles[colIndex++] = {
        halign: 'right',
        cellWidth: hasInvestments ? 20 : 25,
        textColor: [79, 70, 229]
      } // Retornos (Indigo)
      columnStyles[colIndex++] = {
        halign: 'right',
        cellWidth: hasInvestments ? 20 : 25,
        textColor: [2, 132, 199]
      } // Renda (Sky)

      if (hasInvestments) {
        columnStyles[colIndex++] = {
          halign: 'right',
          cellWidth: 20,
          textColor: [71, 85, 105]
        } // Aportes (Slate)
      }

      columnStyles[colIndex++] = {
        halign: 'right',
        cellWidth: hasInvestments ? 20 : 25,
        textColor: [185, 28, 28]
      } // Saques (Red)
      columnStyles[colIndex++] = {
        halign: 'right',
        cellWidth: hasInvestments ? 25 : 30,
        fontStyle: 'bold',
        textColor: [5, 150, 105]
      } // Saldo Pessoal (Emerald)
      columnStyles[colIndex] = {
        halign: 'right',
        cellWidth: hasInvestments ? 25 : 30,
        fontStyle: 'bold',
        textColor: [37, 99, 235]
      } // Saldo Receita (Blue)

      // Generate table using autoTable
      doc.autoTable({
        startY: yPos,
        head: [headers],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59], // Slate 800 for headers base
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 7
          // textColor is defined per column in columnStyles
        },
        columnStyles: columnStyles,
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 15, right: 15 },
        didParseCell: function (data) {
          // Color text for dashes (-) to keep them subtle
          if (data.cell.text[0] === '-') {
            data.cell.styles.textColor = [203, 213, 225] // Slate 300
          }

          // Apply category specific background to headers (optional but professional)
          if (data.section === 'head' && data.column.index > 0) {
            const colStyle = columnStyles[data.column.index]
            if (colStyle && colStyle.textColor) {
              // Apply a subtle background or thicker border could work,
              // but let's try styling the header text color specifically
              // data.cell.styles.textColor = colStyle.textColor;
            }
          }
        }
      })

      // Footer
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.setFont('helvetica', 'normal')
        doc.text(
          `Página ${i} de ${pageCount}`,
          105,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        )
        doc.text(
          'Gestor Estratégico Pro - Relatório Confidencial',
          105,
          doc.internal.pageSize.height - 5,
          { align: 'center' }
        )
      }

      // Save the PDF
      const fileName = `relatorio_gestor_sp_${Formatter.getTodayDate()}.pdf`
      doc.save(fileName)

      return true
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      return false
    }
  },

  /**
   * Generate Excel file with financial data
   * @param {Object} dailyData - Daily financial data
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD (optional)
   */
  generateExcel(dailyData, startDate, endDate) {
    try {
      // Default start to today if not provided
      if (!startDate) startDate = Formatter.getTodayDate()

      // Prepare data for Excel
      const excelData = []
      // Filter dates starting from startDate
      const sortedDates = Object.keys(dailyData)
        .sort()
        .filter(d => d >= startDate && (!endDate || d <= endDate))

      // Check if there are any investments
      let hasInvestments = false
      sortedDates.forEach(date => {
        const d = dailyData[date]
        if (d.outInvest && d.outInvest > 0) {
          hasInvestments = true
        }
      })

      const lastValues = {}

      sortedDates.forEach((date, rowIndex) => {
        const d = dailyData[date]

        // Valores brutos para comparação
        const currentValues = {
          returns: d.inReturn || 0,
          income: d.inIncome || 0,
          invest: d.outInvest || 0,
          withdraw: d.outWithdraw || 0,
          personal: d.endPersonal || 0,
          revenue: d.endRevenue || 0
        }

        // Função auxiliar para Excel
        const formatExcel = (val, key) => {
          const isZero = val === 0
          const isRepeated = rowIndex > 0 && val === lastValues[key]
          lastValues[key] = val

          if (isZero || isRepeated) return '-'
          return this.formatCurrencyForExcel(val)
        }

        const row = {
          Data: Formatter.dateDisplay(date),
          Retornos: formatExcel(currentValues.returns, 'returns'),
          Renda: formatExcel(currentValues.income, 'income')
        }

        // Add investment column only if there are investments
        if (hasInvestments) {
          row['Aportes'] = formatExcel(currentValues.invest, 'invest')
        }

        row['Saques'] = formatExcel(currentValues.withdraw, 'withdraw')
        row['Saldo Pessoal'] = formatExcel(currentValues.personal, 'personal')
        row['Saldo Receita'] = formatExcel(currentValues.revenue, 'revenue')

        excelData.push(row)
      })

      // Create worksheet from data
      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths dynamically
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 12 }, // Retornos
        { wch: 12 } // Renda
      ]

      if (hasInvestments) {
        colWidths.push({ wch: 12 }) // Aportes
      }

      colWidths.push(
        { wch: 12 }, // Saques
        { wch: 15 }, // Saldo Pessoal
        { wch: 15 } // Saldo Receita
      )

      ws['!cols'] = colWidths

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Detalhamento Financeiro')

      // Add summary sheet
      const summaryData = this.prepareSummarySheet(
        dailyData,
        startDate,
        endDate
      )
      const wsSummary = XLSX.utils.json_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo')

      // Generate file name
      const fileName = `gestor_sp_${Formatter.getTodayDate()}.xlsx`

      // Save file
      XLSX.writeFile(wb, fileName)

      return true
    } catch (error) {
      console.error('Erro ao gerar Excel:', error)
      return false
    }
  },

  /**
   * Prepare summary data for Excel
   * @param {Object} dailyData - Daily financial data
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD (optional)
   * @returns {Array} Summary data array
   */
  prepareSummarySheet(dailyData, startDate, endDate) {
    if (!startDate) startDate = Formatter.getTodayDate()
    const dates = Object.keys(dailyData)
      .sort()
      .filter(d => d >= startDate && (!endDate || d <= endDate))
    if (dates.length === 0) return []

    const firstDay = dailyData[dates[0]]
    const lastDay = dailyData[dates[dates.length - 1]]

    const totalEntries = dates.reduce((sum, date) => {
      return sum + dailyData[date].inReturn + dailyData[date].inIncome
    }, 0)

    const totalWithdrawals = dates.reduce((sum, date) => {
      return sum + dailyData[date].outWithdraw
    }, 0)

    return [
      { Métrica: 'Período Analisado', Valor: `${dates.length} dias` },
      { Métrica: 'Data Inicial', Valor: Formatter.dateDisplay(dates[0]) },
      {
        Métrica: 'Data Final',
        Valor: Formatter.dateDisplay(dates[dates.length - 1])
      },
      { Métrica: '', Valor: '' },
      {
        Métrica: 'Saldo Inicial',
        Valor: this.formatCurrencyForExcel(firstDay.startBal)
      },
      {
        Métrica: 'Saldo Final',
        Valor: this.formatCurrencyForExcel(lastDay.endBal)
      },
      { Métrica: '', Valor: '' },
      {
        Métrica: 'Total de Entradas',
        Valor: this.formatCurrencyForExcel(totalEntries)
      },
      {
        Métrica: 'Total de Saques',
        Valor: this.formatCurrencyForExcel(totalWithdrawals)
      },
      {
        Métrica: 'Lucro Líquido',
        Valor: this.formatCurrencyForExcel(lastDay.endBal - firstDay.startBal)
      }
    ]
  },

  /**
   * Format currency value for display (cents to R$)
   * @param {number} cents - Value in cents
   * @returns {string} Formatted currency string
   */
  formatCurrency(cents) {
    const value = cents / 100
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  },

  /**
   * Format currency value for Excel (cents to decimal)
   * @param {number} cents - Value in cents
   * @returns {string} Formatted value for Excel
   */
  formatCurrencyForExcel(cents) {
    const value = cents / 100
    return `R$ ${value.toFixed(2).replace('.', ',')}`
  }
}
