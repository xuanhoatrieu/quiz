import defaultLogo from "@razzia/web/assets/logo.svg"
import { getBranding, imageFallback } from "@razzia/web/branding"
import type { PropsWithChildren } from "react"

const Background = ({ children }: PropsWithChildren) => {
  const branding = getBranding()
  const logo = branding?.logo ?? defaultLogo
  const appName = branding?.appName ?? "Quiz"

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 h-full max-h-svh w-full overflow-hidden">
        <div className="bg-primary/20 absolute top-[-70vmin] left-[-50vmin] min-h-[120vmin] min-w-[120vmin] rotate-20 rounded-4xl" />
        <div className="bg-primary/15 absolute right-[-10vmin] bottom-[-45vmin] min-h-[75vmin] min-w-[75vmin] rotate-20 rounded-4xl" />
        <div className="absolute top-[12%] right-[10%] size-72 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <img
        src={logo}
        onError={imageFallback(defaultLogo)}
        className="z-10 mb-8 h-16 select-none"
        alt={appName}
      />
      {children}

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 text-xs font-semibold tracking-wide text-white/45 select-none">
        {/* oxlint-disable-next-line no-undef */}
        {appName} • v{__APP_VERSION__}
      </div>
    </section>
  )
}

export default Background
