import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRecord, deleteRecord, fetchRecords } from "./api";
import AuthGate from "./AuthGate";
import type { WorkoutRecord } from "./types";

const today = new Date().toISOString().slice(0, 10);

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatJapaneseDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function formatWeight(weight: number) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1).replace(/\.0$/, "");
}

function recordSummary(record: WorkoutRecord) {
  return `${formatWeight(record.weight)}kg × ${record.reps.map((rep) => `${rep}回`).join(" / ")}`;
}

function getMonthDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  return {
    leadingBlanks,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1)
  };
}

function WorkoutApp({ signOut }: { signOut: () => Promise<void> }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const date = new Date(`${today}T00:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [exercise, setExercise] = useState("ベンチプレス");
  const [weight, setWeight] = useState("60");
  const [reps, setReps] = useState<string[]>(["10", "8", ""]);
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [status, setStatus] = useState("");
  const latestSetInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchRecords()
      .then(setRecords)
      .catch((error: Error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const date = new Date(`${selectedDate}T00:00:00`);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [selectedDate]);

  const trainedDates = useMemo(() => new Set(records.map((record) => record.date)), [records]);
  const { leadingBlanks, days } = getMonthDays(calendarMonth.getFullYear(), calendarMonth.getMonth());

  function addSet() {
    setReps((current) => [...current, ""]);
    window.requestAnimationFrame(() => latestSetInput.current?.focus());
  }

  function updateRep(index: number, value: string) {
    setReps((current) => current.map((rep, repIndex) => (repIndex === index ? value : rep)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericReps = reps.map((rep) => Number(rep)).filter((rep) => Number.isFinite(rep) && rep > 0);
    const numericWeight = Number(weight);

    if (!exercise.trim() || !selectedDate || !Number.isFinite(numericWeight) || numericWeight <= 0 || numericReps.length === 0) {
      setStatus("日付、種目、重量、1セット以上の回数を入力してください。");
      return;
    }

    try {
      const saved = await createRecord({
        date: selectedDate,
        exercise: exercise.trim(),
        weight: numericWeight,
        reps: numericReps
      });
      setRecords((current) => [saved, ...current].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
      setStatus("記録しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "記録の追加に失敗しました");
    }
  }

  async function handleDelete(recordId: string) {
    try {
      await deleteRecord(recordId);
      setRecords((current) => current.filter((record) => record.recordId !== recordId));
      setStatus("削除しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "削除に失敗しました");
    }
  }

  function moveMonth(amount: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function selectCalendarDay(day: number) {
    setSelectedDate(toDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1>筋トレ記録</h1>
        <p>セットごとの回数だけをすばやく残そう</p>
        <button type="button" className="logout-button" onClick={signOut}>
          ログアウト
        </button>
      </header>

      <section className="panel log-panel" aria-labelledby="log-title">
        <div className="section-title">
          <span className="title-icon">+</span>
          <h2 id="log-title">記録を追加</h2>
        </div>

        <form className="workout-form" onSubmit={handleSubmit}>
          <fieldset className="base-entry">
            <legend>基本情報</legend>
            <label>
              日付
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <label>
              種目
              <input type="text" value={exercise} onChange={(event) => setExercise(event.target.value)} />
            </label>
            <label>
              重量 (kg)
              <input type="number" min="0" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} />
            </label>
          </fieldset>

          <div className="set-entry">
            <div className="set-entry-heading">
              <div>
                <h3>セット別の回数</h3>
                <p>基本情報は固定したまま、各セットの回数だけ入力</p>
              </div>
              <button type="button" className="ghost-button" onClick={addSet}>
                セット追加
              </button>
            </div>

            <div className="set-list">
              {reps.map((rep, index) => (
                <label className="set-row" key={index}>
                  <span>{index + 1}セット目</span>
                  <input
                    ref={index === reps.length - 1 ? latestSetInput : undefined}
                    className="reps-input"
                    type="number"
                    min="0"
                    placeholder="例: 8"
                    value={rep}
                    aria-label={`${index + 1}セット目の回数`}
                    onChange={(event) => updateRep(index, event.target.value)}
                  />
                  <b>回</b>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="primary-button">
            まとめて記録する
          </button>
          {status && <p className="status-message">{status}</p>}
        </form>
      </section>

      <section className="panel calendar-panel" aria-labelledby="calendar-title">
        <div className="calendar-header">
          <button type="button" className="round-button" aria-label="前の月" onClick={() => moveMonth(-1)}>
            ‹
          </button>
          <h2 id="calendar-title">
            {calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月
          </h2>
          <button type="button" className="round-button" aria-label="次の月" onClick={() => moveMonth(1)}>
            ›
          </button>
        </div>

        <div className="weekdays" aria-hidden="true">
          <span className="sunday">日</span>
          <span>月</span>
          <span>火</span>
          <span>水</span>
          <span>木</span>
          <span>金</span>
          <span className="saturday">土</span>
        </div>

        <div className="calendar-grid">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div className="day blank" key={`blank-${index}`} />
          ))}
          {days.map((day) => {
            const dateValue = toDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
            const className = ["day", trainedDates.has(dateValue) ? "trained" : "", selectedDate === dateValue ? "selected" : ""]
              .filter(Boolean)
              .join(" ");

            return (
              <button type="button" className={className} key={dateValue} onClick={() => selectCalendarDay(day)}>
                {day}
              </button>
            );
          })}
        </div>

        <p className="legend">
          <span />
          トレーニング実施日
        </p>
      </section>

      <section className="panel recent-panel" aria-labelledby="recent-title">
        <div className="section-title">
          <span className="title-icon list-icon">≡</span>
          <h2 id="recent-title">最近の記録</h2>
        </div>

        <div className="record-list" aria-live="polite">
          {records.length === 0 && <p className="empty-message">まだ記録がありません。</p>}
          {records.map((record) => (
            <article className="record-card" key={record.recordId}>
              <div>
                <h3>{record.exercise}</h3>
                <p>{formatJapaneseDate(record.date)}</p>
              </div>
              <strong>{recordSummary(record)}</strong>
              <button className="trash-button" type="button" aria-label={`${record.exercise}の記録を削除`} onClick={() => handleDelete(record.recordId)}>
                <span />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return <AuthGate>{({ signOut }) => <WorkoutApp signOut={signOut} />}</AuthGate>;
}
