/** No scripts, network calls, forms or external frames from uploaded HTML.
 * The iframe also uses an empty sandbox attribute; this CSP constrains subresources. */
export function sandboxDocument(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
