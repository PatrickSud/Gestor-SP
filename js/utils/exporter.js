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

      // Summary boxes
      const summaryData = [
        { label: 'Lucro Líquido', value: results.netProfit, color: accentColor },
        { label: 'ROI', value: `${results.roi.toFixed(1)}%`, color: primaryColor, isPercentage: true },
        { label: 'Total Sacado', value: results.totalWithdrawn, color: [59, 130, 246] }
      ]

      summaryData.forEach((item, index) => {
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

      // Prepare table data
      const tableData = []
      const sortedDates = Object.keys(dailyData).sort()
      
      sortedDates.forEach(date => {
        const d = dailyData[date]
        tableData.push([
          Formatter.dateDisplay(date),
          this.formatCurrency(d.startBal),
          this.formatCurrency(d.inReturn + d.inIncome),
          this.formatCurrency(d.outWithdraw),
          this.formatCurrency(d.endBal)
        ])
      })

      // Generate table using autoTable
      doc.autoTable({
        startY: yPos,
        head: [['Data', 'Saldo Inicial', 'Entradas', 'Saídas', 'Saldo Final']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85]
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { halign: 'right', cellWidth: 35 },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
        },
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

      sortedDates.forEach(date => {
        const d = dailyData[date]
        excelData.push({
          'Data': Formatter.dateDisplay(date),
          'Saldo Inicial': this.formatCurrencyForExcel(d.startBal),
          'Retornos': this.formatCurrencyForExcel(d.inReturn),
          'Renda': this.formatCurrencyForExcel(d.inIncome),
          'Entradas Total': this.formatCurrencyForExcel(d.inReturn + d.inIncome),
          'Saques': this.formatCurrencyForExcel(d.outWithdraw),
          'Saldo Final': this.formatCurrencyForExcel(d.endBal)
        })
      })

      // Create worksheet from data
      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 15 }, // Saldo Inicial
        { wch: 12 }, // Retornos
        { wch: 12 }, // Renda
        { wch: 15 }, // Entradas Total
        { wch: 12 }, // Saques
        { wch: 15 }  // Saldo Final
      ]
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
