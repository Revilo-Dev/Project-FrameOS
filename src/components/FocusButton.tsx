import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  focused: string;
  onFocused(id: string): void;
}

export function FocusButton({ id, focused, onFocused, className = '', children, ...rest }: Props) {
  return <button {...rest} id={id} type="button" tabIndex={focused === id ? 0 : -1}
    className={`${className}${focused === id ? ' is-focused' : ''}`}
    onFocus={() => onFocused(id)}>{children}</button>;
}
