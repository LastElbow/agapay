import React from "react";

type ButtonProps = {
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>; // allows standard <button> props like onClick, disabled, type, className, style

const Button = ({ children, style, ...props }: ButtonProps) => {
  // default visual style for the button
  const defaultStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    cursor: "pointer",
    borderRadius: "8px",
    fontWeight: 600,
  };

  // merge user-provided style with defaults (user overrides win for specific properties)
  const mergedStyle: React.CSSProperties = {
    ...defaultStyle,
    ...(style as React.CSSProperties),
  };

  return (
    <button {...props} style={mergedStyle}>
      {children}
    </button>
  );
};

export default Button;
