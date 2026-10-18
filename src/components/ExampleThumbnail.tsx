import type { ExampleId } from '../examples/catalog'

/** Static decorative thumbnail for the gallery card (not a live preview). */
export function ExampleThumbnail({
  id,
  label,
}: {
  id: ExampleId
  label: string
}) {
  return (
    <div
      data-testid={`example-thumb-${id}`}
      role="img"
      aria-label={label}
      className="relative h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-[#eef1f6]"
    >
      {id === 'logo-entrance' && (
        <>
          <div className="absolute inset-x-0 bottom-2 top-8 mx-auto w-10 rounded-xl bg-teal-700 shadow-md" />
          <div className="absolute bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-teal-900/40" />
        </>
      )}
      {id === 'follow-the-leader' && (
        <>
          <div className="absolute left-[18%] top-[55%] size-3.5 rounded-full bg-teal-700 shadow" />
          <div className="absolute left-[42%] top-[40%] size-3 rounded-md bg-orange-700 shadow" />
          <div className="absolute left-[68%] top-[58%] size-2.5 rounded-sm bg-slate-600 shadow" />
          <div className="absolute inset-x-6 top-1/2 h-px bg-slate-300/80" />
        </>
      )}
      {id === 'orbit' && (
        <>
          <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-800 shadow" />
          <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-300" />
          <div className="absolute left-[78%] top-[32%] size-3 rounded-md bg-sky-500 shadow" />
        </>
      )}
    </div>
  )
}
