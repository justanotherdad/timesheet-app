'use client'

import { useRef } from 'react'
import { Download, Printer } from 'lucide-react'
import { formatWeekEnding } from '@/lib/utils'

interface TimesheetExportProps {
  timesheet: any
}

export default function TimesheetExport({ timesheet }: TimesheetExportProps) {
  const exportRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    if (!exportRef.current) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Timesheet Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .signature-section { margin-top: 40px; }
            .signature-line { border-top: 1px solid #000; width: 200px; margin-top: 40px; }
          </style>
        </head>
        <body>
          ${exportRef.current.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={handleDownload}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>
        <button
          onClick={handlePrint}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <div ref={exportRef} className="bg-white p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Timesheet</h2>
          <p className="text-gray-600">Week Ending: {formatWeekEnding(timesheet.week_ending)}</p>
        </div>

        <div className="mb-6">
          <table className="w-full border-collapse border border-gray-300">
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Employee Name:</td>
                <td className="border border-gray-300 p-2">{timesheet.user_profiles.name}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Email:</td>
                <td className="border border-gray-300 p-2">{timesheet.user_profiles.email}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Week Ending:</td>
                <td className="border border-gray-300 p-2">{formatWeekEnding(timesheet.week_ending)}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Site:</td>
                <td className="border border-gray-300 p-2">
                  {timesheet.sites?.name} {timesheet.sites?.code && `(${timesheet.sites.code})`}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Purchase Order:</td>
                <td className="border border-gray-300 p-2">
                  {timesheet.purchase_orders?.po_number}
                  {timesheet.purchase_orders?.description && ` - ${timesheet.purchase_orders.description}`}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">System:</td>
                <td className="border border-gray-300 p-2">
                  {timesheet.systems?.name} {timesheet.systems?.code && `(${timesheet.systems.code})`}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Activity:</td>
                <td className="border border-gray-300 p-2">
                  {timesheet.activities?.name} {timesheet.activities?.code && `(${timesheet.activities.code})`}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Deliverable:</td>
                <td className="border border-gray-300 p-2">
                  {timesheet.deliverables?.name} {timesheet.deliverables?.code && `(${timesheet.deliverables.code})`}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Hours:</td>
                <td className="border border-gray-300 p-2">{timesheet.hours}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold bg-gray-50">Status:</td>
                <td className="border border-gray-300 p-2 capitalize">{timesheet.status}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {timesheet.timesheet_signatures && timesheet.timesheet_signatures.length > 0 && (
          <div className="signature-section mt-8">
            <h3 className="text-lg font-semibold mb-4">Approvals</h3>
            <div className="grid grid-cols-2 gap-8">
              {timesheet.timesheet_signatures.map((sig: any, index: number) => (
                <div key={index} className="border-t-2 border-gray-300 pt-4">
                  <p className="font-semibold capitalize">{sig.signer_role}</p>
                  <p className="text-sm text-gray-600">{sig.user_profiles.name}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Signed: {new Date(sig.signed_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {timesheet.status === 'rejected' && timesheet.rejection_reason && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded">
            <p className="font-semibold text-red-900">Rejection Reason:</p>
            <p className="text-red-700">{timesheet.rejection_reason}</p>
          </div>
        )}
      </div>
    </div>
  )
}

