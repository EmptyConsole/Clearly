import { useId, type ReactNode } from 'react';

export function Section({
  title,
  lead,
  children,
  id,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  id?: string;
}) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className="border-t border-border py-6">
      <h2 id={hid} className="text-2xl">
        {title}
      </h2>
      {lead ? <p className="mt-1 text-text-muted">{lead}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}
