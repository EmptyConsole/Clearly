import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { buttonClass, type ButtonVariant } from './buttonClass.ts';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, className)} {...rest} />;
});

export function ButtonLink({
  variant = 'primary',
  className,
  ...rest
}: LinkProps & { readonly variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}
