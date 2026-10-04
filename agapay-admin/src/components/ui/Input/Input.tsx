import React from "react";

type InputProps = {
  label: string;
  id: string;
} & React.InputHTMLAttributes<HTMLInputElement>; // allows standard <input> props like value, onChange, type, disabled, placeholder, className, style

const Input = ({ label, id, style, ...props }: InputProps) => {
  const defaultStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    boxSizing: "border-box",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    outline: "none",
  };

  const mergedStyle: React.CSSProperties = {
    ...defaultStyle,
    ...(style as React.CSSProperties),
  };

  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input id={id} {...props} style={mergedStyle} />
    </div>
  );
};

export default Input;
