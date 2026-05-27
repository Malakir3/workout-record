import { getAuthToken, isAuthConfigured } from "./auth";
import type { NewWorkoutRecord, WorkoutRecord } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const STORAGE_KEY = "workout-records-local";

function readLocalRecords(): WorkoutRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as WorkoutRecord[];
  } catch {
    return [];
  }
}

function writeLocalRecords(records: WorkoutRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function localRecordId(date: string) {
  return `RECORD#${date.replaceAll("-", "")}#${Date.now()}`;
}

async function authHeaders() {
  if (!API_BASE_URL || !isAuthConfigured) return {};

  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`
  };
}

export async function fetchRecords(): Promise<WorkoutRecord[]> {
  if (!API_BASE_URL) {
    return readLocalRecords().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  const response = await fetch(`${API_BASE_URL}/records`, {
    headers: await authHeaders()
  });
  if (!response.ok) throw new Error("記録の取得に失敗しました");
  return response.json();
}

export async function createRecord(payload: NewWorkoutRecord): Promise<WorkoutRecord> {
  if (!API_BASE_URL) {
    const record: WorkoutRecord = {
      ...payload,
      recordId: localRecordId(payload.date),
      createdAt: new Date().toISOString()
    };
    writeLocalRecords([record, ...readLocalRecords()]);
    return record;
  }

  const response = await fetch(`${API_BASE_URL}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders())
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("記録の追加に失敗しました");
  return response.json();
}

export async function deleteRecord(recordId: string): Promise<void> {
  if (!API_BASE_URL) {
    writeLocalRecords(readLocalRecords().filter((record) => record.recordId !== recordId));
    return;
  }

  const response = await fetch(`${API_BASE_URL}/records/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    headers: await authHeaders()
  });
  if (!response.ok) throw new Error("記録の削除に失敗しました");
}
