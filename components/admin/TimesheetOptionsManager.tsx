'use client'

import { useState } from 'react'
import HierarchicalItemManager from './HierarchicalItemManager'

interface Site {
  id: string
  name: string
  code?: string
}

interface TimesheetOptionsManagerProps {
  sites: Site[]
  readOnly?: boolean
}

type TabType = 'systems' | 'activities' | 'deliverables'

export default function TimesheetOptionsManager({ sites, readOnly = false }: TimesheetOptionsManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('systems')

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Manage Timesheet Options
      </h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('systems')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'systems'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Systems
        </button>
        <button
          onClick={() => setActiveTab('activities')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'activities'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Activities
        </button>
        <button
          onClick={() => setActiveTab('deliverables')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'deliverables'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Deliverables
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'systems' && (
        <HierarchicalItemManager
          sites={sites}
          tableName="systems"
          title="Systems"
          itemName="System"
          readOnly={readOnly}
          embedded
        />
      )}
      {activeTab === 'activities' && (
        <HierarchicalItemManager
          sites={sites}
          tableName="activities"
          title="Activities"
          itemName="Activity"
          readOnly={readOnly}
          embedded
        />
      )}
      {activeTab === 'deliverables' && (
        <HierarchicalItemManager
          sites={sites}
          tableName="deliverables"
          title="Deliverables"
          itemName="Deliverable"
          readOnly={readOnly}
          embedded
        />
      )}
    </div>
  )
}
