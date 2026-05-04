import { useEffect, useState } from "react";
import type { ParsedStudent } from "./atr-types";
import { ensureStudentIds } from "./student-excel";
import { getStudentsFn, saveStudentsFn } from "./auth-server";

export type Student = ParsedStudent;

const KEY_PREFIX = "bcet-students-";
const EVT = "bcet-students-changed";

function getStoreKey(mentorId: string) {
  return `${KEY_PREFIX}${mentorId}`;
}

export function listStudentsLocal(mentorId: string): Student[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(getStoreKey(mentorId));
  if (!raw) return [];
  try {
    return ensureStudentIds(JSON.parse(raw) as Student[]);
  } catch {
    return [];
  }
}

export async function listStudents(mentorId: string): Promise<Student[]> {
  // Try server first
  try {
    const remote = await getStudentsFn({ data: { mentorId } });
    if (remote) {
      const normalized = ensureStudentIds(remote as Student[]);
      if (typeof window !== "undefined") {
        localStorage.setItem(getStoreKey(mentorId), JSON.stringify(normalized));
      }
      return normalized;
    }
  } catch (err) {
    console.warn("Failed to fetch students from server, using local cache", err);
  }
  return listStudentsLocal(mentorId);
}

export async function saveStudents(mentorId: string, students: Student[]) {
  // Save local first for instant feedback
  if (typeof window !== "undefined") {
    localStorage.setItem(getStoreKey(mentorId), JSON.stringify(students));
    window.dispatchEvent(new Event(EVT));
  }

  // Then save to server
  try {
    await saveStudentsFn({ data: { mentorId, students } });
  } catch (err) {
    console.error("Failed to save students to server", err);
  }
}

export function useStudents(mentorId: string): {
  students: Student[];
  setStudents: (students: Student[]) => void;
  isLoading: boolean;
} {
  const [students, setStudentsState] = useState<Student[]>(() => listStudentsLocal(mentorId));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await listStudents(mentorId);
      if (active) {
        setStudentsState(data);
        setIsLoading(false);
      }
    };
    load();

    const refresh = () => {
      setStudentsState(listStudentsLocal(mentorId));
    };

    window.addEventListener(EVT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener(EVT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [mentorId]);

  const setStudents = (newStudents: Student[]) => {
    saveStudents(mentorId, newStudents);
  };

  return { students, setStudents, isLoading };
}
