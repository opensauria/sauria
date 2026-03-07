export function fire(host: HTMLElement, name: string, detail?: unknown): void {
  host.dispatchEvent(
    new CustomEvent(name, { bubbles: true, composed: true, detail }),
  );
}
