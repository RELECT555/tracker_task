'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Renders HTML that came from Azure DevOps (descriptions, acceptance criteria) without trusting it:
 * a sandboxed iframe with no script permission and a CSP that blocks everything except images,
 * inline styles and fonts. `allow-same-origin` is only there so the parent can size the frame;
 * without `allow-scripts` nothing inside can run.
 */
export function SafeAzureHtml({ html, title, className }: { html: string; title: string; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(48);
  const [theme, setTheme] = useState({ color: 'inherit', font: 'inherit', scheme: 'normal', link: 'inherit' });

  useEffect(() => {
    const host = frame.current?.parentElement;
    if (!host) return;
    const read = () => {
      const style = getComputedStyle(host);
      const root = getComputedStyle(document.documentElement);
      setTheme({
        color: style.color,
        font: style.fontFamily,
        scheme: root.colorScheme || 'normal',
        link: root.getPropertyValue('--color-primary').trim() || style.color,
      });
    };
    read();
    // next-themes switches the class on <html>; re-read colors when it does.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  const srcDoc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:">
<base target="_blank">
<style>
:root{color-scheme:${theme.scheme}}
html,body{margin:0;padding:0;background:transparent}html{overflow:hidden}body{display:flow-root}
body{color:${theme.color};font-family:${theme.font};font-size:14px;line-height:1.55;overflow-wrap:anywhere}
a{color:${theme.link}}
img{max-width:100%;height:auto}
table{border-collapse:collapse;max-width:100%}td,th{border:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:4px 6px}
p,div{margin:0 0 .4em}ul,ol{margin:.2em 0 .6em;padding-left:1.4em}
pre,code{white-space:pre-wrap;font-size:13px}
</style></head><body>${html}</body></html>`, [html, theme]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const document = element.contentDocument;
      if (!document?.body) return;
      // documentElement includes the last paragraph's margin, which body.scrollHeight leaves out.
      const fit = () => setHeight(Math.max(24, Math.ceil(document.documentElement.scrollHeight)));
      fit();
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(document.body);
    };
    element.addEventListener('load', measure);
    measure();
    return () => {
      element.removeEventListener('load', measure);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height, colorScheme: theme.scheme }}
      className={className ?? 'block w-full border-0 bg-transparent'}
    />
  );
}
