export function $<T extends Element = HTMLElement>(seletor: string): T {
  const el = document.querySelector<T>(seletor);
  if (!el) throw new Error(`Elemento não encontrado: ${seletor}`);
  return el;
}

export const $$ = <T extends Element = HTMLElement>(seletor: string): T[] => [...document.querySelectorAll<T>(seletor)];

export type CampoFormulario = HTMLInputElement | HTMLSelectElement;

export function campoForm(form: HTMLFormElement, nome: string): CampoFormulario {
  const el = form.elements.namedItem(nome);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el;
  throw new Error(`Campo não encontrado no formulário: ${nome}`);
}

export function dadosForm(form: HTMLFormElement): Record<string, string> {
  const dados: Record<string, string> = {};
  new FormData(form).forEach((valor, chave) => {
    dados[chave] = typeof valor === 'string' ? valor : valor.name;
  });
  return dados;
}

export function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    return;
  }
}
