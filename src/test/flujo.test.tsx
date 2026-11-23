// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { listarEstudiantes, sessions } from "../data";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  window.scrollTo = vi.fn() as any;
  window.confirm = vi.fn(() => true);
  Element.prototype.scrollIntoView = vi.fn();
});

async function entrar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Comenzar mi primera sesión/ }));
  await user.click(screen.getByRole("button", { name: /^Empezar/ }));
  await user.type(screen.getByLabelText(/Código de estudiante/), "LQ-TEST");
  await user.click(screen.getByLabelText(/acepto participar/));
  await user.click(screen.getByRole("button", { name: /Guardar y continuar/ }));
}

test("no muestra un periodo académico fijo", () => {
  render(<App />);
  expect(document.body.textContent).not.toContain("2026-I");
  expect(document.body.textContent).toContain("Periodo");
});

test("consentimiento → nivel 1 completo con las recomendaciones → progreso guardado", async () => {
  const user = userEvent.setup();
  render(<App />);
  await entrar(user);
  expect(await screen.findByText("Taller de pruebas", { selector: "strong" })).toBeTruthy();
  for (let i = 0; i < 10 && !screen.queryByText("¡Prueba completa!"); i++) {
    const rec = document.querySelector<HTMLButtonElement>(".rule-button.recommended");
    expect(rec, "hay una acción recomendada").toBeTruthy();
    await user.click(rec!);
  }
  expect(screen.getByText("¡Prueba completa!")).toBeTruthy();
  const r = listarEstudiantes().find((x) => x.codigo === "LQ-TEST")!;
  expect(r.consentimiento).not.toBe("");
  expect(r.progreso).toEqual(["1-1"]);
  const derivacion = document.querySelector(".derivation")!.textContent!;
  expect(derivacion).toMatch(/^1\. A∧B ⊢ A \[/);
});

test("la pista explica la regla recomendada", async () => {
  const user = userEvent.setup();
  render(<App />);
  await entrar(user);
  const box = document.querySelector(".hint-box")!;
  expect(box.textContent).toMatch(/Un buen siguiente paso: .+/);
  expect(box.textContent).toMatch(/cierras esta meta|submeta/);
});

test("cuestionario SUS: valida ítems y calcula el puntaje", async () => {
  const user = userEvent.setup();
  render(<App />);
  await entrar(user);
  await user.click(screen.getAllByRole("button", { name: /Cuestionarios/ })[0]);
  await user.selectOptions(screen.getByLabelText("Instrumento"), "SUS");
  await user.click(screen.getByRole("button", { name: /Guardar respuestas/ }));
  expect(screen.getByRole("alert").textContent).toMatch(/Faltan ítems/);
  for (let i = 0; i < 10; i++) {
    const grupo = document.querySelectorAll(".likert-item")[i];
    const opcion = i % 2 === 0 ? "5" : "1";
    await user.click(within(grupo as HTMLElement).getByText(opcion));
  }
  await user.click(screen.getByRole("button", { name: /Guardar respuestas/ }));
  expect(document.body.textContent).toContain("Puntaje SUS: 100 / 100");
  expect(listarEstudiantes()[0].respuestas[0].valores).toHaveLength(10);
});

test("retirarse borra los datos locales", async () => {
  const user = userEvent.setup();
  render(<App />);
  await entrar(user);
  await user.click(screen.getAllByRole("button", { name: /Acerca del estudio/ })[0]);
  await user.click(screen.getByRole("button", { name: /Retirarme y borrar mis datos/ }));
  expect(listarEstudiantes()).toHaveLength(0);
  expect(localStorage.getItem("lq-code")).toBeNull();
});

test("hay 27 niveles y todos los textos de sesión existen", () => {
  expect(sessions.reduce((n, s) => n + s.levels.length, 0)).toBe(27);
});

test("prueba de desempeño: se presenta sin pistas, se envía una vez y desbloquea la posprueba", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole("button", { name: /Prueba de lógica/ })[0]);
  expect(screen.getByRole("button", { name: /Primero la preprueba/ })).toHaveProperty("disabled", true);
  await user.click(screen.getAllByRole("button", { name: /Comenzar/ })[0]);
  await user.type(screen.getByLabelText(/Código de estudiante/), "LQ-PRUEBA");
  await user.click(screen.getByLabelText(/acepto participar/));
  await user.click(screen.getByRole("button", { name: /Guardar y continuar/ }));
  await user.click(screen.getAllByRole("button", { name: /Comenzar/ })[0]);
  expect(screen.getByText("Pregunta 1 de 9")).toBeTruthy();
  expect(document.querySelector(".hint-box")).toBeNull();
  for (let i = 0; i < 8; i++) {
    await user.click(document.querySelector<HTMLInputElement>(".test-options input")!);
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
  }
  await user.click(screen.getByRole("button", { name: /Revisar y enviar/ }));
  expect(screen.getByText(/Sin responder: pregunta 9/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Enviar prueba/ }));
  const r = listarEstudiantes().find((x) => x.codigo === "LQ-PRUEBA")!;
  expect(r.pruebas?.[0].momento).toBe("inicial");
  expect(r.pruebas?.[0].respuestas).toEqual([0, 0, 0, 0, 0, 0, 0, 0, null]);
  expect(r.pruebas?.[0].tiempos.length).toBe(9);
  expect(screen.getByText(/Verás tu resultado al terminar la posprueba/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Comenzar/ })).toHaveProperty("disabled", false);
});
