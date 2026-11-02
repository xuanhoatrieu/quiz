import defaultBackground from "@razzia/web/assets/background.png"
import { getBranding, imageFallback } from "@razzia/web/branding"

const GameBackground = () => {
  const customBackground = getBranding()?.background

  if (customBackground) {
    return (
      <div className="fixed top-0 left-0 h-full w-full">
        <img
          className="pointer-events-none h-full w-full object-cover select-none"
          src={customBackground}
          onError={imageFallback(defaultBackground)}
          alt="background"
        />
      </div>
    )
  }

  return (
    <div className="bg-secondary pointer-events-none fixed inset-0 overflow-hidden select-none">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 18%, rgba(22, 163, 74, 0.34), transparent 48%), radial-gradient(circle at 84% 22%, rgba(234, 179, 8, 0.16), transparent 42%), radial-gradient(circle at 50% 88%, rgba(21, 128, 61, 0.28), transparent 55%)",
        }}
      />
      <div className="bg-primary/15 absolute top-[-65vmin] left-[-45vmin] min-h-[115vmin] min-w-[115vmin] rotate-20 rounded-4xl" />
      <div className="bg-primary/15 absolute right-[-12vmin] bottom-[-42vmin] min-h-[75vmin] min-w-[75vmin] rotate-20 rounded-4xl" />
    </div>
  )
}

export default GameBackground
