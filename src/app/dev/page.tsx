'use client'

import { useState } from 'react'

export default function DevDepositPage() {
  const [userId, setUserId] = useState('')
  const [provider, setProvider] = useState<'solflare' | 'coinbase'>('solflare')
  const [amountWT, setAmountWT] = useState<number>(100) // 100 WT = $10 if 1$=10WT
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function postDeposit() {
    if (!userId) {
      alert('Enter a userId')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const txHash = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, provider, txHash, amountWT }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setResult({ error: e?.message || 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: '40px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Deposit Dev Tester</h1>

      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>User ID</div>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="paste a real User.id"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8 }}
        />
      </label>

      <label style={{ display: 'block', margin: '12px 0' }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Provider</div>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'solflare' | 'coinbase')}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8 }}
        >
          <option value="solflare">solflare</option>
          <option value="coinbase">coinbase</option>
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Amount (WT)</div>
        <input
          type="number"
          value={amountWT}
          onChange={(e) => setAmountWT(Number(e.target.value))}
          min={0}
          step={10}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8 }}
        />
      </label>

      <button
        onClick={postDeposit}
        disabled={loading}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: 'none',
          background: loading ? '#aaa' : '#111',
          color: '#fff',
          fontWeight: 700,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Posting…' : 'Post Deposit'}
      </button>

      <pre
        style={{
          marginTop: 16,
          padding: 12,
          background: '#f6f6f6',
          borderRadius: 10,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {result ? JSON.stringify(result, null, 2) : 'Response will appear here'}
      </pre>
    </main>
  )
}