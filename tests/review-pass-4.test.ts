// Casos da segunda revisão de segurança (app inteiro).
import { describe, expect, test, vi } from "vitest";
import { testDb } from "./helpers/db";
import { users } from "@/db/schema";
import { cleanNotes, validateAccountName, validateLabel } from "@/lib/validation";
import { planFromForm } from "@/lib/cards/installments";
import {
  LIMITS,
  addItem,
  addNote,
  createEvent,
  createQuickNote,
  createTask,
  listEvents,
  listQuickNotes,
  listTasks,
  convertQuickNote,
  updateEvent,
  updateItem,
  updateNote,
  updateQuickNote,
} from "@/lib/todos/store";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ set() {} }) }));

function setup() {
  const db = testDb();
  const u = db.insert(users).values({ username: "ana", passwordHash: "x", isAdmin: false, createdAt: new Date() }).returning().all()[0].id;
  return { db, u };
}

describe("textos", () => {
  test("separadores de linha, preenchimentos invisíveis e surrogates soltos são recusados", () => {
    for (const bad of ["a b", "a b", "aㅤb", "ᅟab", "a\uD800b", "ㅤ"]) {
      expect(validateLabel(bad, 40, "um nome").ok, JSON.stringify(bad)).toBe(false);
    }
    expect(cleanNotes("a bㅤc", 100)).toEqual({ ok: true, value: "abc" });
  });

  test("nome feito só de caracteres invisíveis (ZWJ) é recusado", () => {
    expect(validateLabel("‍‍", 40, "um nome").ok).toBe(false);
    expect(validateLabel(" ‍", 40, "um nome").ok).toBe(false);
  });

  test("bandeiras com caracteres de tag (Inglaterra) são aceitas", () => {
    const england = "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    expect(validateLabel(`Viagem ${england}`, 40, "um nome").ok).toBe(true);
  });

  test("nome de conta aceita emoji composto e segue as mesmas regras", () => {
    expect(validateAccountName("Família 👨‍👩‍👧")).toEqual({ ok: true, value: "Família 👨‍👩‍👧" });
    expect(validateAccountName("a‮b").ok).toBe(false);
    expect(validateAccountName("‍").ok).toBe(false);
  });
});

describe("teto de texto das pendências", () => {
  test("perto do teto ainda dá para encurtar itens, notas, compromissos e notas rápidas", () => {
    const { db, u } = setup();
    createTask(db, u, { title: "T", checklist: ["x".repeat(150)], notes: ["n".repeat(900)] });
    createEvent(db, u, { title: "E", date: "2026-11-10", time: null, categoryId: null, description: "d".repeat(900), status: "scheduled" });
    createQuickNote(db, u, "q".repeat(900));
    const original = LIMITS.textChars;
    LIMITS.textChars = 2860; // praticamente cheio
    try {
      const t = listTasks(db, u)[0];
      expect(updateItem(db, u, t.checklist[0].id, "curto")).toEqual({ ok: true });
      expect(updateNote(db, u, t.notes[0].id, "curta")).toEqual({ ok: true });
      const e = listEvents(db, u)[0];
      expect(updateEvent(db, u, e.id, { title: "E", date: "2026-11-10", time: null, categoryId: null, description: "curta", status: "scheduled" })).toEqual({ ok: true });
      const q = listQuickNotes(db, u)[0];
      expect(updateQuickNote(db, u, q.id, "curta")).toEqual({ ok: true });
      // Crescer além do teto continua bloqueado.
      expect(updateNote(db, u, t.notes[0].id, "n".repeat(900)).ok).toBe(true);
      LIMITS.textChars = 1000;
      expect(addItem(db, u, t.id, "y".repeat(200)).ok).toBe(false);
    } finally {
      LIMITS.textChars = original;
    }
  });

  test("nota rápida virar tarefa respeita o teto", () => {
    const { db, u } = setup();
    createQuickNote(db, u, `${"t".repeat(100)}\n${"d".repeat(400)}`);
    const original = LIMITS.textChars;
    LIMITS.textChars = 550;
    try {
      const q = listQuickNotes(db, u)[0];
      expect(convertQuickNote(db, u, q.id)).toEqual({
        ok: false,
        error: "Limite de texto das pendências atingido. Apague tarefas ou notas antigas.",
      });
      expect(addNote(db, u, 999, "x").ok).toBe(false);
    } finally {
      LIMITS.textChars = original;
    }
  });
});

describe("cartões", () => {
  test("parcela enorme × 48 diz 'muito alto', não 'muito baixo'", () => {
    expect(planFromForm({ amountCents: Number.MAX_SAFE_INTEGER, mode: "parcela", current: 1, total: 48, refMonth: "2026-01", currentPaid: false })).toEqual({
      ok: false,
      error: "Valor muito alto",
    });
  });
});

describe("login", () => {
  test("loginAction chamado sem FormData responde com erro, sem lançar", async () => {
    const { loginAction } = await import("@/app/login/actions");
    await expect(loginAction({}, { username: "x" } as unknown as FormData)).resolves.toEqual({ error: "Usuário ou senha inválidos" });
  });
});
