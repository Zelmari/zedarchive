import Link from 'next/link';
import Image from 'next/image';

interface BrandWordmarkProps {
  href?: string;
  className?: string;
}

export default function BrandWordmark({ href = '/', className = '' }: BrandWordmarkProps) {
  return (
    <Link href={href} className={`za-wordmark za-link za-site-header__brand ${className}`.trim()}>
      <Image
        alt=""
        aria-hidden="true"
        className="za-wordmark__mark"
        height={36}
        src="/transparentlogo.png"
        width={36}
        unoptimized
      />
      <span className="za-wordmark__text">zedarchive</span>
    </Link>
  );
}
