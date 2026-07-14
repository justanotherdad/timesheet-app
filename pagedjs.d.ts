declare module 'pagedjs' {
  /** Minimal typing for the bits of Paged.js we use in the budget PDF export. */
  export class Previewer {
    constructor(options?: unknown)
    polisher?: { destroy?: () => void }
    chunker?: { destroy?: () => void }
    preview(
      content: Node | string,
      stylesheets?: Array<string | Record<string, string>>,
      renderTo?: HTMLElement
    ): Promise<{ total: number }>
  }
}
