import * as React from "react";
import styles from "./button.module.css";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${styles.button} ${variant !== "default" ? styles[variant] : ""} ${className || ""}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
