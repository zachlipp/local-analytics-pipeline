import { useState, type ChangeEvent } from 'react'
import './App.css'

import { countRows } from './example-query'
import { DagUpload } from '@ui/DagUpload'

type Status = 'idle' | 'loading' | 'error'

function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [fileName, setFileName] = useState<string>()
  const [rowCount, setRowCount] = useState<number>()

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setRowCount(undefined)
    setStatus('loading')
    try {
      setRowCount(await countRows(file))
      setStatus('idle')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>LAP</h1>
      <p className="subtitle">Local Analytics Pipeline</p>

			<DagUpload />

      <label className="upload">
        Upload a CSV to count the (non-header) rows
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleChange}
          disabled={status === 'loading'}
        />
      </label>

      <p className="result" role="status">
        {status === 'loading'
          ? `Counting rows in ${fileName}…`
          : status === 'error'
            ? `Could not read ${fileName}`
            : rowCount !== undefined
              ? `${fileName}: ${rowCount.toLocaleString()} rows`
              : 'No file loaded yet.'}
      </p>
    </main>
  )
}

export default App
