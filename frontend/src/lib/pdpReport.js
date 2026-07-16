import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TEAL = [26, 148, 148]

function fmt$(n) {
  const v = Number(n ?? 0)
  const abs = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : ''}$ ${abs}`
}

function fmtDateUTC(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' })
}

function provName(p) {
  return p.proveedor?.razon_social || p.proveedor?.nombre || 'Sin proveedor'
}

// Un pago en PDP es un egreso (plata que sale) salvo que ingresa_egreso diga lo contrario.
function signedImporte(p) {
  const v = Math.abs(Number(p.importe ?? 0))
  return p.ingresa_egreso === true ? v : -v
}

function nroFactura(p) {
  const tipo = p.id_tipo || ''
  const pv = p.pv != null ? String(p.pv).padStart(5, '0') : ''
  const nro = p.nro != null ? String(p.nro).padStart(8, '0') : ''
  if (!pv && !nro) return '—'
  return `${tipo}${pv}-${nro}`
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch('/logos/DCSMART-APP-horizontal.png')
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Genera y descarga el PDF del Reporte PDP a partir de los pagos actualmente
// en estado PDP (columna "Pagar PDP") de un local, más el total de deuda
// corriente vigente como dato de referencia.
export async function generarReportePdp({ localNombre, pagosPdp, totalDeuda }) {
  const logo = await loadLogoDataUrl()

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(16)
  doc.setTextColor(...TEAL)
  doc.text('REPORTE PDP', pageWidth / 2, 40, { align: 'center' })

  const now = new Date()
  const fechaHora = now.toLocaleString('es-AR', { hour12: false })
  const slug = (localNombre || 'LOCAL').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '')
  const ddmmyy = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`
  const nombreReporte = `${slug}_PDP_${ddmmyy}`

  const totalPdp = pagosPdp.reduce((acc, p) => acc + signedImporte(p), 0)

  autoTable(doc, {
    startY: 55,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6, lineColor: TEAL, lineWidth: 0.75, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 80, fontStyle: 'bold', textColor: TEAL },
      2: { cellWidth: 140 },
      3: { cellWidth: 80, fontStyle: 'bold', textColor: TEAL },
      4: { cellWidth: 125 },
    },
    body: [
      [
        { content: logo ? '' : (localNombre || ''), rowSpan: 4, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        'FECHA:', fechaHora, 'CONFECCIONÓ:', '',
      ],
      ['NOMBRE:', nombreReporte, 'AUDITA:', ''],
      ['TOTAL:', fmt$(totalPdp), 'LIBERA:', ''],
      ['DEUDA CORRIENTE:', fmt$(totalDeuda), 'BANCO & FECHA:', ''],
    ],
    didParseCell: (data) => {
      if (data.column.index === 0 && data.row.index === 0 && logo) {
        data.cell.text = []
      }
    },
    didDrawCell: (data) => {
      if (data.column.index === 0 && data.row.index === 0 && logo) {
        const pad = 8
        const w = data.cell.width - pad * 2
        const h = data.cell.height - pad * 2
        try { doc.addImage(logo, 'PNG', data.cell.x + pad, data.cell.y + pad, w, Math.min(h, w * 0.4)) } catch { /* logo opcional */ }
      }
    },
  })

  let y = doc.lastAutoTable.finalY + 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('RESUMEN', margin, y)

  const groupsMap = new Map()
  for (const p of pagosPdp) {
    const key = p.proveedor?.id ?? '__none__'
    if (!groupsMap.has(key)) groupsMap.set(key, { nombre: provName(p), total: 0, items: [] })
    const g = groupsMap.get(key)
    g.total += signedImporte(p)
    g.items.push(p)
  }
  const groups = [...groupsMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6, lineColor: TEAL, lineWidth: 0.75 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: TEAL, lineWidth: 0.75 },
    head: [['RAZÓN SOCIAL', 'TOTAL']],
    body: groups.map(g => [g.nombre, fmt$(g.total)]),
    columnStyles: { 1: { halign: 'right' } },
  })

  y = doc.lastAutoTable.finalY + 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('DETALLE', margin, y)

  const detalleRows = groups.flatMap(g =>
    g.items
      .slice()
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .map(p => [
        p.nro_ord != null ? `OP-${p.nro_ord}` : '—',
        fmtDateUTC(p.fecha),
        provName(p),
        nroFactura(p),
        fmt$(signedImporte(p)),
      ])
  )

  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: TEAL, lineWidth: 0.75 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: TEAL, lineWidth: 0.75 },
    head: [['ORDEN', 'FECHA FACTURA', 'RAZÓN SOCIAL', 'Nro FACTURA', 'IMPORTE']],
    body: detalleRows,
    columnStyles: { 4: { halign: 'right' } },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFont('helvetica', 'bolditalic')
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text('DC-SMART', pageWidth / 2, pageHeight - 24, { align: 'center' })
    },
  })

  doc.save(`${nombreReporte}.pdf`)
  return { blob: doc.output('blob'), filename: `${nombreReporte}.pdf` }
}
