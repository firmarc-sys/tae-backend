import type { ReactNode } from 'react'

export function PortraitFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="relative h-full w-full overflow-hidden">{children}</div>
    </div>
  )
}
