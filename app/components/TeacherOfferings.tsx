'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Offering = {
  id: string;
  title: string;
  description: string;
  subject_name: string;
  board: string;
  class_number: number | null;
  billing_cycle: 'one_off' | 'weekly' | 'monthly';
  sessions_per_week: number;
  session_duration_minutes: number;
  delivery_mode: string;
  price_inr: number;
  max_students: number;
  status: 'draft' | 'published' | 'paused' | 'archived';
};

type Schedule = {
  id: string;
  offering_id: string;
  iso_weekday: number;
  local_start_time: string;
  local_end_time: string;
  timezone: string;
  is_active: boolean;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMPTY = {
  title: '',
  description: '',
  subject_name: '',
  board: 'cbse',
  class_number: '',
  billing_cycle: 'one_off',
  sessions_per_week: '1',
  session_duration_minutes: '60',
  delivery_mode: 'online',
  price_inr: '',
  max_students: '1'
};

export default function TeacherOfferings({ profile }: { profile: any }) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [slot, setSlot] = useState({ iso_weekday: '1', local_start_time: '16:00', local_end_time: '17:00', timezone: 'Asia/Kolkata' });
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedOffering = useMemo(() => offerings.find(item => item.id === selected), [offerings, selected]);
  const selectedSlots = schedules.filter(item => item.offering_id === selected);
  const activeSelectedSlots = selectedSlots.filter(item => item.is_active).length;

  async function api(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
    const response = await fetch('/api/teacher/' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Please try again.');
    return data;
  }

  async function refresh() {
    const data = await api('offerings');
    setOfferings(data.offerings || []);
    setSchedules(data.schedules || []);
    setSelected((current: string) => current && data.offerings?.some((item: Offering) => item.id === current)
      ? current
      : data.offerings?.[0]?.id || '');
  }

  useEffect(() => { refresh().catch(e => setError(e.message || 'Unable to load classes.')); }, []);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await work(); }
    catch (e: any) { setError(e.message || 'Please try again.'); }
    finally { setBusy(false); }
  }

  async function createOffering(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const data = await api('offerings', {
        ...form,
        class_number: form.class_number ? Number(form.class_number) : null,
        sessions_per_week: Number(form.sessions_per_week),
        session_duration_minutes: Number(form.session_duration_minutes),
        price_inr: Number(form.price_inr),
        max_students: Number(form.max_students)
      });
      setOfferings((current: Offering[]) => [data.offering, ...current]);
      setSelected(data.offering.id);
      setForm(EMPTY);
      setNotice('Class saved as a draft. Add a weekly time slot for recurring classes, then publish after approval.');
    });
  }

  async function addSlot(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      await api('offerings/schedules', {
        offering_id: selected,
        ...slot,
        iso_weekday: Number(slot.iso_weekday)
      });
      await refresh();
      setNotice('Weekly time slot saved.');
    });
  }

  async function setStatus(item: Offering, action: string) {
    await run(async () => {
      await api('offerings', { id: item.id, action }, 'PATCH');
      await refresh();
      setNotice(action === 'publish' ? 'Class published to the teacher marketplace.' : 'Class status updated.');
    });
  }

  async function toggleSlot(item: Schedule) {
    await run(async () => {
      await api('offerings/schedules', { id: item.id, is_active: !item.is_active }, 'PATCH');
      await refresh();
    });
  }

  const canPublish = profile?.status === 'approved'
    && (selectedOffering?.billing_cycle === 'one_off' || activeSelectedSlots > 0);

  return <section className="teacher-card" aria-labelledby="teacher-classes-heading">
    <h2 id="teacher-classes-heading">4. Classes and availability</h2>
    <p>Create a single class or a recurring weekly or monthly plan. Prices are in INR. The final platform fee is not set yet.</p>

    <form onSubmit={createOffering}>
      <div className="teacher-grid">
        <label>Class title<input required minLength={3} maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></label>
        <label>Subject<input required maxLength={100} value={form.subject_name} onChange={e => setForm({ ...form, subject_name: e.target.value })}/></label>
        <label>Board<select value={form.board} onChange={e => setForm({ ...form, board: e.target.value })}><option value="cbse">CBSE</option><option value="tbse">TBSE</option><option value="icse">ICSE</option><option value="other">Other</option></select></label>
        <label>Class (optional)<select value={form.class_number} onChange={e => setForm({ ...form, class_number: e.target.value })}><option value="">Any / not specified</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}</select></label>
        <label>Plan<select value={form.billing_cycle} onChange={e => setForm({ ...form, billing_cycle: e.target.value })}><option value="one_off">One-off class</option><option value="weekly">Weekly plan</option><option value="monthly">Monthly plan</option></select></label>
        <label>Price per plan (₹)<input type="number" required min="0" max="1000000" step="0.01" value={form.price_inr} onChange={e => setForm({ ...form, price_inr: e.target.value })}/></label>
        <label>Class duration (minutes)<input type="number" min="15" max="240" value={form.session_duration_minutes} onChange={e => setForm({ ...form, session_duration_minutes: e.target.value })}/></label>
        {form.billing_cycle !== 'one_off' && <label>Classes per week<input type="number" min="1" max="14" value={form.sessions_per_week} onChange={e => setForm({ ...form, sessions_per_week: e.target.value })}/></label>}
        <label>Students per class<input type="number" min="1" max="100" value={form.max_students} onChange={e => setForm({ ...form, max_students: e.target.value })}/></label>
        <label>Delivery<select value={form.delivery_mode} onChange={e => setForm({ ...form, delivery_mode: e.target.value })}><option value="online">Online</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></label>
      </div>
      <label>Short description<textarea rows={3} maxLength={3000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      <button className="teacher-primary" disabled={busy}>Save class draft</button>
    </form>

    <hr style={{ margin: '24px 0', border: 0, borderTop: '1px solid #e2e6ef' }}/>
    <label>Your class drafts and listings<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a class</option>{offerings.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>

    {selectedOffering && <>
      <p><b>{selectedOffering.title}</b> · {selectedOffering.billing_cycle.replace('_', ' ')} · ₹{Number(selectedOffering.price_inr).toFixed(2)} · {selectedOffering.status}</p>
      {selectedOffering.billing_cycle !== 'one_off' && <>
        <form onSubmit={addSlot}>
          <div className="teacher-grid">
            <label>Weekday<select value={slot.iso_weekday} onChange={e => setSlot({ ...slot, iso_weekday: e.target.value })}>{DAYS.map((day, index) => <option key={day} value={String(index + 1)}>{day}</option>)}</select></label>
            <label>Starts (IST)<input type="time" required value={slot.local_start_time} onChange={e => setSlot({ ...slot, local_start_time: e.target.value })}/></label>
            <label>Ends (IST)<input type="time" required value={slot.local_end_time} onChange={e => setSlot({ ...slot, local_end_time: e.target.value })}/></label>
          </div>
          <button disabled={busy}>Add weekly time slot</button>
        </form>
        {selectedSlots.length > 0 && <ul>{selectedSlots.map(item => <li key={item.id} style={{ margin: '8px 0' }}>{DAYS[item.iso_weekday - 1]} {item.local_start_time.slice(0, 5)}–{item.local_end_time.slice(0, 5)} IST · {item.is_active ? 'active' : 'paused'} <button type="button" disabled={busy} onClick={() => toggleSlot(item)}>{item.is_active ? 'Pause slot' : 'Activate slot'}</button></li>)}</ul>}
      </>}

      <div className="teacher-actions" style={{ marginTop: 16 }}>
        {selectedOffering.status !== 'published'
          ? <button className="teacher-primary" disabled={busy || !canPublish} title={!canPublish ? 'Profile approval and at least one weekly time slot are required.' : ''} onClick={() => setStatus(selectedOffering, 'publish')}>Publish class</button>
          : <button disabled={busy} onClick={() => setStatus(selectedOffering, 'pause')}>Pause listing</button>}
        {selectedOffering.status !== 'archived' && <button disabled={busy} onClick={() => setStatus(selectedOffering, 'archive')}>Archive</button>}
        {selectedOffering.status === 'paused' && <button className="teacher-primary" disabled={busy || !canPublish} onClick={() => setStatus(selectedOffering, 'publish')}>Resume listing</button>}
      </div>
      {!canPublish && selectedOffering.status !== 'published' && <p>Publishing becomes available after profile approval. Recurring plans also need one active weekly slot.</p>}
    </>}

    {offerings.length === 0 && <p>No class plans yet. Save one above to start.</p>}
    {error && <p className="teacher-error" role="alert">{error}</p>}
    {notice && <p className="teacher-notice" role="status">{notice}</p>}
  </section>;
}
