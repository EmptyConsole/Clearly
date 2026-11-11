// Floating captions with Document Picture-in-Picture (feature-detected; needs a user gesture).
// The token stylesheet is copied into the window so captions look the same there.

interface DocumentPiP {
  requestWindow(o: { width: number; height: number }): Promise<Window>;
}

export function hasDocumentPiP(): boolean {
  return 'documentPictureInPicture' in window;
}

export async function openFloatingWindow(title: string): Promise<Window> {
  const api = (window as unknown as { documentPictureInPicture: DocumentPiP })
    .documentPictureInPicture;
  const win = await api.requestWindow({ width: 640, height: 200 });
  win.document.title = title;
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    win.document.head.append(node.cloneNode(true));
  }
  // The window follows the page's theme choice.
  const theme = document.documentElement.dataset['theme'];
  if (theme) win.document.documentElement.dataset['theme'] = theme;
  win.document.body.className = 'bg-[var(--t-color-caption-white-bg)] m-0 p-2';
  return win;
}
