import { Formatter } from './formatter.js'

/**
 * Exporter Module - Handles PDF and Excel export functionality
 */
export const Exporter = {
  /**
   * Generate PDF report with financial data
   * @param {Object} results - Calculation results
   * @param {Object} dailyData - Daily financial data
   */
  generatePDF(results, dailyData) {
    try {
      // Access jsPDF from global scope
      const { jsPDF } = window.jspdf

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
      doc.text(`Gerado em: ${currentDate}`, 105, 30, { align: 'center' })

      // Summary Section
      let yPos = 55
      
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Resumo Financeiro', 15, yPos)
      
      yPos += 10

      // Summary boxes - Primeira linha (3 cards)
      const summaryDataRow1 = [
        { label: 'Lucro Líquido', value: results.netProfit, color: accentColor },
        { label: 'Renda / Extras', value: results.totalIncomeCents || 0, color: [14, 165, 233] }, // Sky blue
        { label: 'Lucro Invest.', value: results.totalInvProfitCents || 0, color: [168, 85, 247] } // Purple
      ]

      summaryDataRow1.forEach((item, index) => {
        const xPos = 15 + (index * 63)
        
        // Box background
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(xPos, yPos, 60, 25, 3, 3, 'F')
        
        // Label
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(item.label, xPos + 30, yPos + 7, { align: 'center' })
        
        // Value
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...item.color)
        const displayValue = this.formatCurrency(item.value)
        doc.text(displayValue, xPos + 30, yPos + 18, { align: 'center' })
      })

      yPos += 30

      // Summary boxes - Segunda linha (2 cards)
      const summaryDataRow2 = [
        { label: 'ROI', value: `${results.roi.toFixed(1)}%`, color: primaryColor, isPercentage: true },
        { label: 'Total Sacado', value: results.totalWithdrawn, color: [59, 130, 246] }
      ]

      summaryDataRow2.forEach((item, index) => {
        const xPos = 15 + (index * 63) + 31.5 // Centralizar 2 cards
        
        // Box background
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(xPos, yPos, 60, 25, 3, 3, 'F')
        
        // Label
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(item.label, xPos + 30, yPos + 7, { align: 'center' })
        
        // Value
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...item.color)
        const displayValue = item.isPercentage 
          ? item.value 
          : this.formatCurrency(item.value)
        doc.text(displayValue, xPos + 30, yPos + 18, { align: 'center' })
      })

      yPos += 35

      // Financial Table
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Detalhamento Financeiro', 15, yPos)
      
      yPos += 5

      // Prepare table data and check if there are any investments
      const tableData = []
      const sortedDates = Object.keys(dailyData).sort()
      let hasInvestments = false
      
      sortedDates.forEach(date => {
        const d = dailyData[date]
        // Check if there are any investments in the period
        if (d.outInvest && d.outInvest > 0) {
          hasInvestments = true
        }
      })
      
      // Build table rows
      sortedDates.forEach(date => {
        const d = dailyData[date]
        const row = [
          Formatter.dateDisplay(date),
          this.formatCurrency(d.inReturn || 0),
          this.formatCurrency(d.inIncome || 0)
        ]
        
        // Add investment column only if there are investments
        if (hasInvestments) {
          row.push(this.formatCurrency(d.outInvest || 0))
        }
        
        row.push(
          this.formatCurrency(d.outWithdraw || 0),
          this.formatCurrency(d.endPersonal || 0),
          this.formatCurrency(d.endRevenue || 0)
        )
        
        tableData.push(row)
      })

      // Build headers dynamically
      const headers = ['Data', 'Retornos', 'Renda']
      
      if (hasInvestments) {
        headers.push('Aportes')
      }
      
      headers.push('Saques', 'Saldo Pessoal', 'Saldo Receita')

      // Build column styles dynamically
      const columnStyles = {
        0: { halign: 'center', cellWidth: 22 } // Data
      }
      
      let colIndex = 1
      columnStyles[colIndex++] = { halign: 'right', cellWidth: hasInvestments ? 20 : 25 } // Retornos
      columnStyles[colIndex++] = { halign: 'right', cellWidth: hasInvestments ? 20 : 25 } // Renda
      
      if (hasInvestments) {
        columnStyles[colIndex++] = { halign: 'right', cellWidth: 20 } // Aportes
      }
      
      columnStyles[colIndex++] = { halign: 'right', cellWidth: hasInvestments ? 20 : 25 } // Saques
      columnStyles[colIndex++] = { halign: 'right', cellWidth: hasInvestments ? 25 : 30, fontStyle: 'bold' } // Saldo Pessoal
      columnStyles[colIndex] = { halign: 'right', cellWidth: hasInvestments ? 25 : 30, fontStyle: 'bold' } // Saldo Receita

      // Generate table using autoTable
      doc.autoTable({
        startY: yPos,
        head: [headers],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [51, 65, 85]
        },
        columnStyles: columnStyles,
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 15, right: 15 }
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
      const fileName = `relatorio_gestor_sp_${new Date().toISOString().split('T')[0]}.pdf`
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
   */
  generateExcel(dailyData) {
    try {
      // Prepare data for Excel
      const excelData = []
      const sortedDates = Object.keys(dailyData).sort()
      
      // Check if there are any investments
      let hasInvestments = false
      sortedDates.forEach(date => {
        const d = dailyData[date]
        if (d.outInvest && d.outInvest > 0) {
          hasInvestments = true
        }
      })

      sortedDates.forEach(date => {
        const d = dailyData[date]
        const row = {
          'Data': Formatter.dateDisplay(date),
          'Retornos': this.formatCurrencyForExcel(d.inReturn || 0),
          'Renda': this.formatCurrencyForExcel(d.inIncome || 0)
        }
        
        // Add investment column only if there are investments
        if (hasInvestments) {
          row['Aportes'] = this.formatCurrencyForExcel(d.outInvest || 0)
        }
        
        row['Saques'] = this.formatCurrencyForExcel(d.outWithdraw || 0)
        row['Saldo Pessoal'] = this.formatCurrencyForExcel(d.endPersonal || 0)
        row['Saldo Receita'] = this.formatCurrencyForExcel(d.endRevenue || 0)
        
        excelData.push(row)
      })

      // Create worksheet from data
      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths dynamically
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 12 }, // Retornos
        { wch: 12 }  // Renda
      ]
      
      if (hasInvestments) {
        colWidths.push({ wch: 12 }) // Aportes
      }
      
      colWidths.push(
        { wch: 12 }, // Saques
        { wch: 15 }, // Saldo Pessoal
        { wch: 15 }  // Saldo Receita
      )
      
      ws['!cols'] = colWidths

      // Create workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Detalhamento Financeiro')

      // Add summary sheet
      const summaryData = this.prepareSummarySheet(dailyData)
      const wsSummary = XLSX.utils.json_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo')

      // Generate file name
      const fileName = `gestor_sp_${new Date().toISOString().split('T')[0]}.xlsx`

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
   * @returns {Array} Summary data array
   */
  prepareSummarySheet(dailyData) {
    const dates = Object.keys(dailyData).sort()
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
      { 'Métrica': 'Período Analisado', 'Valor': `${dates.length} dias` },
      { 'Métrica': 'Data Inicial', 'Valor': Formatter.dateDisplay(dates[0]) },
      { 'Métrica': 'Data Final', 'Valor': Formatter.dateDisplay(dates[dates.length - 1]) },
      { 'Métrica': '', 'Valor': '' },
      { 'Métrica': 'Saldo Inicial', 'Valor': this.formatCurrencyForExcel(firstDay.startBal) },
      { 'Métrica': 'Saldo Final', 'Valor': this.formatCurrencyForExcel(lastDay.endBal) },
      { 'Métrica': '', 'Valor': '' },
      { 'Métrica': 'Total de Entradas', 'Valor': this.formatCurrencyForExcel(totalEntries) },
      { 'Métrica': 'Total de Saques', 'Valor': this.formatCurrencyForExcel(totalWithdrawals) },
      { 'Métrica': 'Lucro Líquido', 'Valor': this.formatCurrencyForExcel(lastDay.endBal - firstDay.startBal) }
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
