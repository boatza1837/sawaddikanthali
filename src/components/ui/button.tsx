import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";
const variants = cva("button", {
  variants: {
    variant: { default: "primary", outline: "outline", danger: "danger" },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return (
    <button className={twMerge(variants({ variant }), className)} {...props} />
  );
}
