import clsx from "clsx"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"

const ConfigTabButton = ({
  children,
  active,
  className,
  ...otherProps
}: ButtonHTMLAttributes<HTMLButtonElement> &
  PropsWithChildren & { active?: boolean }) => (
  <button
    className={twMerge(
      clsx(
        "text-accent-foreground hover:bg-accent flex-1 rounded-lg px-4 py-2 font-semibold",
        active && "bg-primary hover:bg-primary/90 text-white",
        className,
      ),
    )}
    {...otherProps}
  >
    <div>{children}</div>
  </button>
)

export default ConfigTabButton
